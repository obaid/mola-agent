# Phase 2+3 Screenshots Directory

## Status: ⏳ Awaiting Manual Testing with MOLA_TOKEN

This directory will contain real PNG screenshots of the Phase 2+3 cloud features once manual testing is completed with a valid `MOLA_TOKEN`.

## Required Screenshots

All screenshots must be real binary PNG files captured from browser testing, verified with `file` and `ls -lah`.

### Minimum Required (7 screenshots)

1. **01-backend-selection.png** (~200KB+)
   - Setup wizard showing backend selection step
   - Cloud option selected
   - Authentication status: "cloud.mola.sh — user@example.com (plan)"

2. **02-profile-picker.png** (~150KB+)
   - Profile selection step in wizard
   - Multiple profiles listed with specs: "pilot-2c-4g — 2 vCPU · 4 GB · 20 GB disk"
   - One profile selected

3. **03-desktop-cloud.png** (~300KB+)
   - Chat interface with conversation
   - Desktop panel open (split view)
   - Cloud machine desktop visible in iframe
   - Header shows "☁️ cloud" indicator

4. **04-usage-display.png** (~150KB+)
   - Chat header with usage stats
   - "X/Y computers · X/Y min" format
   - Cloud indicator visible

5. **06-snapshots-ui.png** (~200KB+)
   - Snapshots panel open
   - List of snapshots with status badges
   - Create snapshot form or button visible

6. **08-settings-panel.png** (~200KB+)
   - Settings panel showing:
     - Backend selection (local/cloud radio buttons)
     - Profile dropdown (cloud)
     - Computer policy options
     - Save/Cancel buttons

7. **09-fleet-view.png** (~250KB+)
   - Machines view with multiple computers
   - Each showing: name, status badge, specs, profile, region
   - Start/Stop/Delete controls visible

### Optional but Recommended (4 screenshots)

8. **05-billing-warning.png**
   - Warning banner: "⚠️ Approaching compute minutes limit"
   - Or: "⚠️ At computer limit. Stop unused machines to create new ones."

9. **07-delete-confirm.png**
   - Machine with delete confirmation dialog
   - "Delete it and its disk? This cannot be undone."
   - Delete and Cancel buttons

10. **10-region-display.png**
    - Machine card highlighting region field
    - Shows "Germany" or pilot region

11. **11-local-mode.png**
    - App running with local backend
    - "🏠 local" indicator in header
    - Proof local mode still works

## How to Capture

See [../docs/testing-and-screenshots.md](../docs/testing-and-screenshots.md) for detailed instructions.

### Quick Start

```bash
# Export cloud token
export MOLA_TOKEN="your-token-here"

# Start app
npm start

# Open http://localhost:3000 in browser
# Follow testing checklist
# Use browser DevTools > Capture screenshot (F12 > ... menu)
# Save each to this directory with correct filename

# Verify
file *.png
ls -lah
# Each file should show:
# "PNG image data" and size >10KB

# Commit
git add *.png
git commit -m "Add Phase 2+3 UI screenshots

Real PNG files captured from cloud.mola.sh testing:
- 01-backend-selection.png (XXX KB)
- 02-profile-picker.png (XXX KB)
... (list all with sizes)

All verified with file(1)."
```

## Verification Checklist

Before committing:
- [ ] All files are .png extension
- [ ] `file *.png` shows "PNG image data" for each
- [ ] No file is 0 bytes
- [ ] Each file is >10KB (real screenshot, not stub)
- [ ] No HTML error pages saved as .png
- [ ] Images are visually correct (open in image viewer)
- [ ] Filenames match the numbering scheme above
- [ ] Git status shows files in artifacts/phase2/

## PR Integration

In PR body, embed with relative paths:
```markdown
![Backend selection](artifacts/phase2/01-backend-selection.png)
![Profile picker](artifacts/phase2/02-profile-picker.png)
...
```

GitHub will render these inline when the PR branch contains the PNG files.

## Current Status

**Code:** ✅ Complete, committed, pushed
**Tests:** ✅ All passing
**Build:** ✅ Clean build
**Docs:** ✅ Complete
**Screenshots:** ⏳ Blocked on MOLA_TOKEN availability

Ready for manual testing and screenshot capture.
