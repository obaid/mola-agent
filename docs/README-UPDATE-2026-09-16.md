# README Update - Post Cloud MVP & Phase 2+3

**Date**: 2026-09-16  
**Branch**: cursor/readme-update-post-cloud-1655  
**Purpose**: Rewrite README.md to accurately reflect the product after merged PR #1 (cloud MVP) and PR #2 (Phase 2+3 polish)

## Changes Made

### 1. README.md Rewrite

**Problems Fixed:**
- **Opening reframed**: No longer presents product as "throwaway only" — now clearly states "local or cloud" upfront
- **Cloud duplication removed**: Merged overlapping "Backends: Local or Cloud" and "Cloud mode" sections into streamlined "Quick Start" and "Local vs Cloud" sections
- **MCP section updated**: Now mentions both `npx mola-core mcp` (local) and `npx mola-cloud mcp` (cloud)
- **Auto-stop clarity**: Clear distinction — local 15 min, cloud 30/60 min based on plan
- **Single config section**: Environment variables and config file documented once, not duplicated

**New Structure:**
1. **One-liner**: Agent + real Omarchy computer, local or cloud.mola.sh
2. **Quick Start**: Both local and cloud modes with clear commands
3. **What it does**: Agent capabilities (shell, screen, machines, snapshots)
4. **Local vs Cloud**: Clean comparison table (setup, backend, persistence, cost, auto-stop, snapshots, requirements)
5. **What you need**: Requirements for both backends
6. **Cloud Features**: Phase 2+3 features listed concisely:
   - Backend picker (wizard/settings)
   - Profile selection
   - Snapshots (create/list/restore/delete)
   - Usage display (computers, compute minutes)
   - Fleet management
   - Computer policy (per-thread vs shared)
   - Auto-stop (30/60 min)
   - Region display
   - Billing warnings (90% thresholds)
7. **Already using an agent**: MCP server info for both backends
8. **Configuration**: Single unified section (env vars + config.json)
9. **How it fits together**: Architecture diagrams for both modes
10. **Implementation details**: Technical notes
11. **Working on it**: Development instructions
12. **Licence**: FSL-1.1-ALv2

**Tone**: Kept sharp, concise voice of original README while adding cloud content

**Links verified**: `docs/cloud-setup.md` exists on main — link preserved

### 2. package.json Description Update

**Before**: `"A local chat app whose agent drives a throwaway Omarchy computer."`  
**After**: `"A chat app whose agent drives a real Omarchy computer, local or cloud."`

**Rationale**: Description now matches README tone and reflects both modes

## Testing

- ✅ Links verified (docs/cloud-setup.md exists)
- ✅ No secrets committed
- ✅ Markdown valid
- ✅ Clear quick start for newcomers (under 1 minute to choose mode and run)

## Files Changed

1. `README.md` - Complete rewrite (200 lines, clean structure)
2. `package.json` - One-line description update
3. `docs/README-UPDATE-2026-09-16.md` - This documentation file

## Success Criteria

✅ Opening no longer frames product as throwaway-only  
✅ Cloud content not duplicated  
✅ MCP section mentions both `mola-core mcp` and `mola-cloud mcp`  
✅ Auto-stop wording clear (local 15 min, cloud 30/60)  
✅ package.json description updated  
✅ Links to existing docs preserved  
✅ Phase 2+3 features covered (backend picker, profiles, snapshots, usage, fleet, policy, regions, billing warnings)  
✅ Config + env vars documented once  
✅ Redundancy removed  
✅ Sharp voice preserved  
✅ Newcomer can choose mode and run in under 1 minute of reading

## Next Steps

1. Review README structure and tone
2. Verify all cloud features from Phase 2+3 are mentioned
3. Merge PR when approved
