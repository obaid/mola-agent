type Action = { action: string; command?: string; timeout?: number; key?: string; text?: string };
type Run = (action: Action) => Promise<any>;

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

/** Focus the most recently used Chromium window, or launch it once. */
function browserCommand(url?: string) {
  return `python3 - ${shellQuote(url ?? '')} <<'PY'
import json, os, shutil, subprocess, sys, time
url = sys.argv[1]
if not shutil.which('chromium'):
    raise RuntimeError('Chromium is not installed.')
instances = json.loads(subprocess.check_output(['hyprctl', '-j', 'instances'], text=True))
instance = next((i for i in instances if i['wl_socket'] == os.environ.get('WAYLAND_DISPLAY')), None)
if instance is None and instances:
    instance = instances[0]
if instance:
    os.environ['HYPRLAND_INSTANCE_SIGNATURE'] = instance['instance']
    clients = json.loads(subprocess.check_output(['hyprctl', '-j', 'clients'], text=True))
    windows = [c for c in clients if 'chromium' in (c.get('class', '') + ' ' + c.get('initialClass', '')).lower()]
    if windows:
        window = min(windows, key=lambda c: c.get('focusHistoryID', 99999))
        selector = 'address:' + window['address']
        focused = subprocess.run(['hyprctl', 'dispatch', 'hl.dsp.focus({ window = ' + json.dumps(selector) + ' })'], capture_output=True, text=True)
        if focused.returncode:
            subprocess.run(['hyprctl', 'dispatch', 'focuswindow', selector], capture_output=True, text=True, check=True)
        print(json.dumps({'reused': True}))
        sys.exit(0)
with open('/tmp/mola-chromium.log', 'a') as log:
    subprocess.Popen(['chromium'] + ([url] if url else []), stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
if instance:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        clients = json.loads(subprocess.check_output(['hyprctl', '-j', 'clients'], text=True))
        if any('chromium' in c.get('class', '').lower() for c in clients):
            break
        time.sleep(0.1)
    else:
        raise RuntimeError('Chromium did not show a window. See /tmp/mola-chromium.log.')
print(json.dumps({'reused': False}))
PY`;
}

export async function openChromium(run: Run, url?: string) {
  const result = await run({ action: 'exec', command: browserCommand(url), timeout: 15 });
  if (result.exit_code !== 0 || result.timed_out) {
    return { opened: false, error: String(result.stderr || result.stdout || 'Chromium did not start.').trim() };
  }
  const { reused } = JSON.parse(result.stdout.trim());
  if (reused && url) {
    // Navigate the current tab instead of accumulating windows or tabs.
    await run({ action: 'key', key: 'ctrl-l' });
    await run({ action: 'type', text: url });
    await run({ action: 'key', key: 'enter' });
  }
  return { opened: true, browser: 'Chromium', reused, url: url ?? null };
}
