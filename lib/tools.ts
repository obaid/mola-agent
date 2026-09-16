import { tool } from 'ai';
import { z } from 'zod';
import { asModelMedia, type Shot } from './media';
import { act, createMachine, deleteMachine, desktopUrl, getMachine, listMachines, startMachine, waitForReady } from './backend';

/**
 * The tools the agent uses, and the state they share.
 *
 * One machine per conversation, created on first need rather than up front, so
 * a chat that turns out not to need a computer never pays for one.
 */

export type Session = {
  machineId: string | null;
  /** Pushed to the UI so the desktop panel can open itself at the right moment. */
  onMachine?: (id: string) => void;
  /** Called whenever the machine is used, so the idle reaper knows it is alive. */
  onActivity?: () => void;
};

/** The guest's real screen. Coordinates from the model are scaled back to this. */
export const SCREEN = { width: 1280, height: 800 };

/**
 * What the model is shown.
 *
 * Anthropic recommends about 1024px wide for computer use, and a smaller image
 * is cheaper every single turn. The catch is that the model then answers in
 * *its* coordinate space, so every coordinate coming back has to be scaled up
 * before it reaches the machine. Skip that and every click lands 20% short,
 * which looks like a stupid model rather than a units bug.
 */
export const SENT = { width: 1024, height: 640 };

const scaleUp = (value: number, axis: 'width' | 'height') =>
  Math.round(value * (SCREEN[axis] / SENT[axis]));

/**
 * Retry a screen action once.
 *
 * A machine is `ready` when its guest daemon checks in, which happens before
 * wayvnc is accepting connections. The first click or key press after boot can
 * therefore land in the gap and fail, and the engine reports that as a flat
 * "Automation transport failed." with no detail. One retry turns a confusing
 * dead end into a short pause.
 */
async function screen<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: any) {
    if (!/automation|transport|refused|connect/i.test(error?.message ?? '')) throw error;
    await new Promise((r) => setTimeout(r, 2000));
    return run();
  }
}

async function ensureMachine(session: Session) {
  session.onActivity?.();
  if (session.machineId) {
    // A thread resumed after the idle reaper stopped its machine should just
    // work, at the cost of the same boot wait as the first time.
    const machine = await getMachine(session.machineId).catch(() => null);
    if (!machine) {
      session.machineId = null;
    } else if (machine.status === 'stopped') {
      await startMachine(session.machineId);
      await waitForReady(session.machineId);
    }
    if (session.machineId) return session.machineId;
  }
  const machine = await createMachine({ name: 'agent' });
  const ready = await waitForReady(machine.id);
  session.machineId = ready.id;
  session.onMachine?.(ready.id);
  return ready.id;
}

export function buildTools(session: Session) {
  return {
    create_machine: tool({
      description:
        'Create a fresh Linux computer: Arch Linux with the Hyprland desktop, in its own '
        + 'virtual machine. Takes about eight seconds to become usable. You only need one '
        + 'per conversation, and the other tools create it automatically, so call this only '
        + 'when the person explicitly asks for a new one.',
      inputSchema: z.object({}),
      execute: async () => {
        session.machineId = null;
        const id = await ensureMachine(session);
        const machine = await getMachine(id);
        return { id, status: machine.status, vcpus: machine.vcpus, memory_mb: machine.memory_mb };
      },
    }),

    run_command: tool({
      description:
        'Run a shell command on the computer and wait for it to finish. Reach for this '
        + 'first: anything a terminal can do is faster and far more reliable here than '
        + 'clicking through the desktop. Runs as "dev", who has passwordless sudo. Stops at '
        + '120 seconds, so use start_task for installs, builds and big downloads.',
      inputSchema: z.object({
        command: z.string().describe('The command line to run.'),
        timeout: z.number().int().min(1).max(120).optional(),
      }),
      execute: async ({ command, timeout }) => {
        const id = await ensureMachine(session);
        const result = await act(id, { action: 'exec', command, timeout: timeout ?? 60 });
        if (result.timed_out) {
          return {
            timed_out: true,
            partial_output: `${result.stdout}${result.stderr}`.slice(0, 4000),
            hint: 'It hit the time limit. Run it with start_task instead, which has none.',
          };
        }
        return {
          exit_code: result.exit_code,
          stdout: result.stdout.slice(0, 8000),
          stderr: result.stderr.slice(0, 2000),
        };
      },
    }),

    start_task: tool({
      description:
        'Start a command that will take longer than two minutes, such as a package '
        + 'install, a build, or a large download. Returns a handle immediately. Poll '
        + 'check_task to follow it. Use this for pacman, npm, pip, cargo, make.',
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        const id = await ensureMachine(session);
        const handle = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const log = `/tmp/mola-task-${handle}.log`;
        // setsid detaches it from the SSH session, so it survives this call
        // returning. Without it the command dies the moment we disconnect.
        const quoted = `'${command.replaceAll("'", `'\\''`)}'`;
        await act(id, {
          action: 'exec',
          timeout: 20,
          command: `setsid nohup sh -c ${quoted} > ${log} 2>&1 < /dev/null &\necho $! > ${log}.pid`,
        });
        return { handle, note: 'Started. Poll check_task; do not assume it worked.' };
      },
    }),

    check_task: tool({
      description: 'Check whether a background command is still running, and read the end of its output.',
      inputSchema: z.object({ handle: z.string(), lines: z.number().int().min(1).max(300).optional() }),
      execute: async ({ handle, lines }) => {
        const id = await ensureMachine(session);
        const log = `/tmp/mola-task-${handle}.log`;
        const result = await act(id, {
          action: 'exec',
          timeout: 30,
          command: `if [ -f ${log}.pid ] && kill -0 "$(cat ${log}.pid)" 2>/dev/null; then echo RUNNING; else echo FINISHED; fi; echo '---'; tail -n ${lines ?? 40} ${log} 2>/dev/null || echo '(no output yet)'`,
        });
        const [state, ...rest] = result.stdout.split('\n---\n');
        return { running: state.trim() === 'RUNNING', output: rest.join('\n---\n').trimEnd().slice(0, 8000) };
      },
    }),

    read_file: tool({
      description: 'Read a file from the computer. ~ expands in the guest.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const id = await ensureMachine(session);
        const result = await act(id, { action: 'read_file', path });
        return { content: Buffer.from(result.content_base64, 'base64').toString('utf8').slice(0, 20_000) };
      },
    }),

    write_file: tool({
      description: 'Write a file on the computer, creating parent directories as needed.',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path, content }) => {
        const id = await ensureMachine(session);
        await act(id, { action: 'write_file', path, content });
        return { written: path, bytes: Buffer.byteLength(content) };
      },
    }),

    /**
     * `toModelOutput` is attached with Object.assign rather than passed to
     * tool(), because ai@7.0.97 cannot typecheck the two together: the
     * contextual parameter is {input: unknown, output: any} and no annotation
     * satisfies it contravariantly. The runtime contract is unaffected.
     */
    screenshot: Object.assign(
      tool({
        description:
          `Look at the desktop. The image you get is ${SENT.width}x${SENT.height}; give coordinates in `
          + 'that space and they are translated for you. Use this to see the result of a '
          + 'graphical action or to find something to click. You do not need it to check '
          + 'whether a command worked, because run_command already tells you.',
        inputSchema: z.object({}),
        execute: async (): Promise<Shot> => {
          const id = await ensureMachine(session);
          const shot = await screen(() => act(id, { action: 'screenshot' }));
          return { mediaType: shot.mime_type as string, data: shot.image_base64 as string };
        },
      }),
      {
        /**
         * Without this the SDK sends the return value as JSON, so a quarter of
         * a megabyte of base64 reaches the model as *text*. It cannot see the
         * picture, it pays for every character, and the run tends to stop dead.
         */
        toModelOutput: ({ output }: { output: Shot }) => asModelMedia(output),
      },
    ),

    click: tool({
      description: `Click the desktop. Coordinates are in the ${SENT.width}x${SENT.height} space of the screenshot.`,
      inputSchema: z.object({
        x: z.number().int(),
        y: z.number().int(),
        button: z.number().int().min(1).max(3).optional(),
      }),
      execute: async ({ x, y, button }) => {
        const id = await ensureMachine(session);
        await screen(() => act(id, { action: 'click', x: scaleUp(x, 'width'), y: scaleUp(y, 'height'), button: button ?? 1 }));
        return { clicked: { x, y } };
      },
    }),

    move_mouse: tool({
      description: 'Move the pointer without clicking, to reveal a hover state or to position for a scroll.',
      inputSchema: z.object({ x: z.number().int(), y: z.number().int() }),
      execute: async ({ x, y }) => {
        const id = await ensureMachine(session);
        await screen(() => act(id, { action: 'move', x: scaleUp(x, 'width'), y: scaleUp(y, 'height') }));
        return { moved: { x, y } };
      },
    }),

    scroll: tool({
      description:
        'Scroll the wheel. This acts wherever the pointer already is rather than at a '
        + 'position you give it, so move_mouse over the right pane first.',
      inputSchema: z.object({
        direction: z.enum(['up', 'down', 'left', 'right']),
        amount: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ direction, amount }) => {
        const id = await ensureMachine(session);
        await screen(() => act(id, { action: 'scroll', direction, amount: amount ?? 3 }));
        return { scrolled: direction };
      },
    }),

    type_text: tool({
      description: 'Type into whatever has keyboard focus. Click the target first.',
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => {
        const id = await ensureMachine(session);
        await screen(() => act(id, { action: 'type', text }));
        return { typed: text.length };
      },
    }),

    press_key: tool({
      description:
        'Press a key or a combination joined with "-", such as enter, escape, ctrl-c or '
        + 'super-return. In Omarchy super-return opens a terminal, super-space the menu, '
        + 'super-k the keybinding list, super-w closes a window.',
      inputSchema: z.object({ key: z.string() }),
      execute: async ({ key }) => {
        const id = await ensureMachine(session);
        await screen(() => act(id, { action: 'key', key }));
        return { pressed: key };
      },
    }),

    delete_machine: tool({
      description:
        'Destroy the computer and its disk. This cannot be undone. Do it when the work is '
        + 'finished, because a running machine holds several GB of the host.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!session.machineId) return { deleted: false, note: 'There is no machine.' };
        const id = session.machineId;
        await deleteMachine(id);
        session.machineId = null;
        return { deleted: true, id };
      },
    }),
  };
}

export { listMachines, desktopUrl };
export { getBackend } from './backend';
