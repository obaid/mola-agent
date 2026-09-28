import { ToolLoopAgent, stepCountIs } from 'ai';
import { readConfig } from './config';
import { modelFor } from './providers';
import { buildTools, type Session, SENT } from './tools';
import { readThread, update } from './threads';

/**
 * The agent, scoped to one conversation.
 *
 * Each thread owns its own machine. A single shared session would mean two
 * conversations silently operating the same computer, which is the kind of bug
 * that looks like the model going mad.
 */

const INSTRUCTIONS = `You control a real Linux computer: Arch Linux running the Hyprland desktop, in a virtual machine on the user's own hardware. It is disposable. Nothing on it matters except what you put there, and the user can throw it away and make another in about a second.

How to work on it:

- Prefer run_command. Almost everything is faster, cheaper and more reliable through a shell than by clicking. Only drive the desktop when the task is genuinely graphical: a browser, a GUI editor, something you must see.
- That preference loses to what the user actually asked for. If they named the browser, or the screen, or an application, work there and answer from what is on it. Fetching the same page with curl is a different task, and answering from it while claiming to have used the browser is a lie about what you did. If the graphical route is genuinely blocked, say so and say what blocked it before falling back.
- For web browsing on this Omarchy machine, use open_browser. Chromium is installed. Do not try Firefox, xdg-open, or a guessed default browser first.
- Continue browsing in the existing Chromium window and current tab. open_browser focuses and reuses it. Create additional windows or tabs only when the user asks for them or the task specifically requires keeping pages side by side.
- Chromium may show a first-run keyring dialog. Dismiss it with Cancel and continue; do not invent a password for the user.
- The desktop belongs to nobody, so nothing on it gets dismissed unless you dismiss it. Notifications sit in the top-right corner until clicked and can cover what is under them. If a click seems to do nothing, or the screen stops responding to clicks, press escape once or twice before trying again: something is probably open on top that you did not open.
- Use start_task for anything that takes more than two minutes, which includes every package install. Then poll check_task and tell the user what is happening rather than going quiet.
- The screen you see is ${SENT.width}x${SENT.height}. Give click coordinates in that space.
- The machine is created for you the first time you use a tool. You do not need to ask permission to make one.
- When the user asks for a file, create it, verify its contents, then use export_file to attach it. A path in the VM is not a download. Never invent sandbox: or file: links; use the actual URL returned by export_file.
- Verify explicit output constraints before answering. For an exact word count, count the final body with a small script, excluding any separately requested subject or title; revise and recount until it matches. Verify arithmetic programmatically when practical.
- For current web research, distinguish facts you actually checked from estimates. Cite the specific official page supporting prices, dates, hours, or service alerts. Do not invent an alert or assume a notice applies to different dates. Check itinerary times against opening hours and published departures before presenting the plan.
- Keep chat updates short and useful. Say what you are about to do before a long step, update the user when the plan changes or a wait is substantial, and give a clear result. The interface already holds the individual computer actions in expandable activity, so do not narrate every click or screenshot.

If something fails, read the actual error and say what it was. A wrong answer delivered confidently is worse than "this failed, here is the output".`;

/** Build a session bound to a thread, persisting the machine it acquires. */
export function sessionFor(threadId: string): Session {
  const thread = readThread(threadId);
  return {
    machineId: thread?.machineId ?? null,
    threadId,
    onMachine: (id) => {
      update(threadId, { machineId: id, machineTouchedAt: new Date().toISOString() });
    },
    onActivity: () => {
      update(threadId, { machineTouchedAt: new Date().toISOString() });
    },
  };
}

export function buildAgent(session: Session) {
  const config = readConfig();
  if (!config.provider || !config.apiKey || !config.model) {
    throw new Error('Not configured yet.');
  }

  return new ToolLoopAgent({
    model: modelFor(config.provider, config.apiKey, config.model),
    instructions: INSTRUCTIONS,
    tools: buildTools(session),

    // The default is 20 steps. Driving a desktop spends one per screenshot and
    // one per click, so 20 is about four useful actions and the agent stops
    // mid-task looking broken. This is a safety rail, not a work limit.
    stopWhen: stepCountIs(120),

    toolApproval: {
      // Destroying a machine is the one irreversible thing here.
      delete_machine: 'user-approval',
      ...(config.confirmCommands ? { run_command: 'user-approval' as const } : {}),
    },

    // Binds each approval to the exact tool, call id and arguments the server
    // offered, so a tampered browser cannot approve something else.
    experimental_toolApprovalSecret: config.approvalSecret,
  });
}
