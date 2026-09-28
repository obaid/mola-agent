# Phase 2+3 Manual Testing & Screenshot Capture Guide

## Testing Prerequisites

### Required
- Node 20+
- `MOLA_TOKEN` environment variable set (get from https://cloud.mola.sh)
- Model provider API key (Anthropic, OpenAI, or OpenRouter)

### Optional
- `mola-core` running for local backend testing
- Multiple terminal windows for parallel testing

## Testing Checklist

### ✅ Phase 2.1: Backend Selection

**Local Mode:**
1. Unset `MOLA_TOKEN` or set `MOLA_BACKEND=local`
2. Start `mola-core` in separate terminal: `npx mola-core`
3. Start app: `npm start`
4. Wizard should show backend selection step
5. Select "Local (mola-core)"
6. Verify status shows "running" with engine details
7. Complete setup and create conversation
8. Verify machine is created via local engine

**Cloud Mode:**
1. Set `MOLA_TOKEN` environment variable
2. Start app: `npm start`
3. Wizard should show backend selection step
4. Select "Cloud (cloud.mola.sh)"
5. Verify status shows authenticated user email
6. Complete setup and proceed to profile selection

**Screenshot: `01-backend-selection.png`**
- Setup wizard with both backend options visible
- Cloud selected with authentication status shown

### ✅ Phase 2.2: Profile Picker

**Cloud Only:**
1. After selecting cloud backend in wizard
2. Should see profile selection step
3. Profiles should list: name, vCPU, RAM, disk
4. Select a profile (e.g., pilot-2c-4g)
5. Complete setup

**Screenshot: `02-profile-picker.png`**
- Profile selection screen with multiple profiles
- Each showing specs (vCPU · RAM · disk)

### ✅ Phase 2.3: Desktop Session Refresh

**Cloud Only:**
1. Create conversation with cloud backend
2. Ask agent to create a machine
3. Click "Show desktop" button
4. Verify desktop iframe loads
5. Wait 45+ seconds (session should auto-refresh)
6. Desktop should remain connected (no manual reconnect needed)

**Screenshot: `03-desktop-cloud.png`**
- Chat + desktop split view
- Desktop showing Omarchy screen
- Cloud indicator in header

### ✅ Phase 2.4: Retry with Backoff (409s)

**Cloud Only:**
1. Rapidly trigger multiple start/stop actions
2. Or try concurrent automation from multiple threads
3. App should automatically retry with backoff
4. No user-visible 409 errors

**Testing method:**
- Check browser DevTools Network tab for retries
- Verify 409 responses followed by successful retry

### ✅ Phase 2.5: Cost/Usage Display

**Cloud Only:**
1. With cloud backend configured
2. Main chat UI header should show:
   - Cloud indicator (☁️ cloud)
   - Computers: X/Y format (running/limit)
   - Compute minutes: X/Y format (used/limit)
3. Create a machine to see counters increment

**Screenshot: `04-usage-display.png`**
- Header showing cloud backend
- Usage stats visible (computers, minutes)

### ✅ Phase 2.6: Billing Warnings

**Cloud Only:**
1. With account approaching limits
2. Should see warning banner: "⚠️ Approaching compute minutes limit"
3. Or: "⚠️ At computer limit. Stop unused machines..."

**Screenshot: `05-billing-warning.png`**
- Warning banner displayed prominently
- Clear actionable message

### ✅ Phase 3.1: Snapshots UI

**Cloud Only:**
1. Create a conversation with a machine
2. Click "Snapshots" button in header
3. Should see snapshots panel
4. Click "Create snapshot"
5. Enter name, click Create
6. Should see "Computer will be stopped" notice
7. Snapshot should appear in list with status
8. Try Restore and Delete operations (with confirmation)

**Screenshot: `06-snapshots-ui.png`**
- Snapshots panel showing list
- Create snapshot form
- Snapshot with status badge and actions

### ✅ Phase 3.2: Delete Confirmation

**Both backends:**
1. Open Machines view
2. Click Delete on a machine
3. Should see confirmation prompt
4. Shows "Cannot be undone" warning
5. Two steps: Delete button → Confirm → Execute

**Screenshot: `07-delete-confirm.png`**
- Machine with delete confirmation UI
- Clear warning message visible

### ✅ Phase 3.3: Computer Policy Setting

**Both backends:**
1. Click Settings (⚙️) in header
2. Find "Computer policy" section
3. Two options:
   - "Per-thread (each conversation gets its own)"
   - "Shared (one default computer for all)"
4. Select and save

**Screenshot: `08-settings-panel.png`**
- Settings panel open
- Backend selection
- Profile selection (cloud)
- Computer policy options

### ✅ Phase 3.4: Fleet View

**Both backends:**
1. Create multiple machines (different conversations)
2. Click "Machines" in sidebar
3. Should see:
   - Machine list with status badges
   - vCPU, RAM, disk specs
   - Associated thread/conversation
   - Start/Stop/Delete buttons
   - Running memory total

**Cloud also shows:**
- Profile name
- Region
- Auto-stop minutes

**Screenshot: `09-fleet-view.png`**
- Machines view with multiple machines
- Cloud-specific fields visible
- Status badges and controls

### ✅ Phase 3.5: Region Display

**Cloud Only:**
1. Open Machines view
2. Cloud computers should show region field
3. Currently pilot is Germany-only

**Screenshot: `10-region-display.png`**
- Machine card showing region field

### ✅ Local Mode Regression Testing

**Critical: Ensure local mode still works!**

1. Unset `MOLA_TOKEN`
2. Set `MOLA_BACKEND=local`
3. Start `mola-core`
4. Start app
5. Complete full workflow:
   - Setup wizard
   - Create conversation
   - Agent creates machine
   - Show desktop works
   - Machine operations (stop/start/delete)
6. Settings allow switching to cloud if token available

**Screenshot: `11-local-mode.png`**
- App running with local backend
- Local indicator visible

## Screenshot Requirements (Per Obaid)

### File Format & Verification

Each screenshot MUST:
1. **Be a real binary PNG file** (not HTML, not 0-byte stub)
2. **Be committed to `artifacts/phase2/` directory**
3. **Use relative path in PR** (e.g., `![Setup](artifacts/phase2/01-backend-selection.png)`)
4. **Be verifiable** with:
   ```bash
   file artifacts/phase2/*.png
   ls -lah artifacts/phase2/
   pngcheck artifacts/phase2/*.png  # if available
   ```

### Required Screenshots

Minimum set for PR:
1. `01-backend-selection.png` - Setup wizard, cloud selected, authenticated
2. `02-profile-picker.png` - Profile selection step
3. `03-desktop-cloud.png` - Chat + Show desktop with cloud machine
4. `04-usage-display.png` - Header with cloud usage stats
5. `06-snapshots-ui.png` - Snapshots management panel
6. `08-settings-panel.png` - Settings with all options
7. `09-fleet-view.png` - Machines view with multiple cloud computers

Optional but recommended:
8. `05-billing-warning.png` - Usage warning banner
9. `07-delete-confirm.png` - Delete confirmation flow
10. `11-local-mode.png` - Local backend still working

## Capture Process

### Option 1: Browser DevTools
```bash
# Start app with cloud token
export MOLA_TOKEN="your-token-here"
npm start

# Open http://localhost:3000 in browser
# Use browser DevTools > Device Toolbar for consistent size
# Set viewport to 1920x1080 or 1440x900
# Use browser's screenshot feature (F12 > ... > Capture screenshot)
# Save to artifacts/phase2/
```

### Option 2: Playwright/Puppeteer Script
```javascript
// screenshot-capture.js - run with: node screenshot-capture.js
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  
  await page.goto('http://localhost:3000');
  
  // Wait for setup wizard
  await page.waitForSelector('.wizard');
  await page.screenshot({ path: 'artifacts/phase2/01-backend-selection.png' });
  
  // Continue through flow...
  
  await browser.close();
})();
```

### Option 3: Manual with Print Screen
1. Start app
2. Navigate to each UI
3. Use OS screenshot tool:
   - macOS: Cmd+Shift+4
   - Windows: Win+Shift+S
   - Linux: Print Screen or Flameshot
4. Save as PNG to artifacts/phase2/

## Verification After Capture

```bash
# Verify all PNGs are real
cd /workspace
file artifacts/phase2/*.png

# Check sizes (should be >10KB each)
ls -lah artifacts/phase2/

# Verify PNG integrity (if pngcheck available)
pngcheck artifacts/phase2/*.png

# Stage and commit
git add artifacts/phase2/*.png
git commit -m "Add Phase 2+3 UI screenshots

Real PNG files captured from browser testing:
- 01-backend-selection.png (XXX KB) - Setup wizard cloud
- 02-profile-picker.png (XXX KB) - Profile selection
- 03-desktop-cloud.png (XXX KB) - Chat + desktop
- 04-usage-display.png (XXX KB) - Usage in header
- 06-snapshots-ui.png (XXX KB) - Snapshots panel
- 08-settings-panel.png (XXX KB) - Settings UI
- 09-fleet-view.png (XXX KB) - Fleet management

All verified with file(1) and ls -lah.
Screenshots show cloud.mola.sh integration working."

# Push
git push -u origin cursor/phase-2-3-cloud-polish-4aef
```

## PR Body Template

````markdown
# Phase 2 & 3: Cloud Polish + Advanced Features

Implements all Phase 2 (Polish & UX) and Phase 3 (Advanced) features for cloud.mola.sh integration.

## What's New

### Phase 2 - Polish & UX ✅
- ✅ Backend selection (local vs cloud) in setup wizard + settings
- ✅ Dynamic profile picker from /profiles API
- ✅ Desktop session auto-refresh for cloud
- ✅ Retry with exponential backoff on 409 conflicts
- ✅ Usage/cost display in UI (computers, compute minutes)
- ✅ Billing warnings when approaching limits

### Phase 3 - Advanced ✅
- ✅ Snapshots: create/list/restore with stop-before-snapshot
- ✅ Explicit delete confirmation (no auto-delete)
- ✅ Computer policy: per-thread vs shared
- ✅ Fleet view: multi-computer management
- ✅ Region display (pilot Germany-only for now)
- ✅ Billing warnings before long runs

## Screenshots

### Setup: Cloud Backend Selection
![Backend selection](artifacts/phase2/01-backend-selection.png)

### Setup: Profile Picker
![Profile picker](artifacts/phase2/02-profile-picker.png)

### Chat + Show Desktop (Cloud)
![Desktop cloud](artifacts/phase2/03-desktop-cloud.png)

### Usage Display
![Usage stats](artifacts/phase2/04-usage-display.png)

### Snapshots Management
![Snapshots UI](artifacts/phase2/06-snapshots-ui.png)

### Settings Panel
![Settings](artifacts/phase2/08-settings-panel.png)

### Fleet View
![Machines fleet](artifacts/phase2/09-fleet-view.png)

## Testing

- ✅ All existing tests pass (`npm test`)
- ✅ Build succeeds (`npm run build`)
- ✅ Local mode fully backward compatible
- ✅ Cloud mode tested with real cloud.mola.sh API
- ✅ APIs verified against https://cloud.mola.sh/openapi.json

## Configuration

Requires `MOLA_TOKEN` env var for cloud mode. Backend selection available in:
1. Setup wizard (first run)
2. Settings panel (⚙️ button)
3. `MOLA_BACKEND` env var (overrides config)

See [docs/phase2-3-implementation.md](docs/phase2-3-implementation.md) for full documentation.

## Breaking Changes

None. Fully backward compatible with local mola-core mode.
````

## Current Status

**Code Implementation:** ✅ Complete and committed
**Tests:** ✅ Passing
**Documentation:** ✅ Complete

**Screenshots:** ⏳ Requires MOLA_TOKEN for cloud testing

To complete:
1. Set MOLA_TOKEN in environment
2. Follow testing checklist above
3. Capture required screenshots
4. Verify PNGs with file/ls
5. Commit screenshots
6. Push branch
7. Open PR with screenshot embeds
