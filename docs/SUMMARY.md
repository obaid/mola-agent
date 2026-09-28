<!--
# Changes:
# 2026-09-16: Executive summary of cloud.mola.sh integration investigation
#             Quick reference: architecture, differences, plan, risks, next steps
#             Entry point for reviewing the cloud integration proposal
-->

# Cloud Support Investigation Summary

**Date:** 2026-09-16  
**Status:** Plan Complete, Awaiting Approval  
**Goal:** Add cloud.mola.sh support alongside local mola-core

---

## TL;DR

**What:** Add a backend abstraction to mola-agent that supports both local mola-core (current) and cloud.mola.sh (new) as compute backends.

**How:** Create a `ComputerBackend` interface with two implementations:
- `LocalCoreBackend` (refactored existing code)
- `CloudMolaBackend` (new HTTP client for cloud.mola.sh)

**User impact:** Set `MOLA_BACKEND=cloud` and `MOLA_TOKEN=...` to use persistent cloud computers instead of local VMs.

---

## Architecture

### Current (local only)

```
Browser → Next.js → lib/engine.ts → mola-core :4141 → QEMU
```

### Proposed (backend abstraction)

```
Browser → Next.js → lib/engine.ts (facade)
                         ↓
                    ComputerBackend interface
                    /                \
         LocalCoreBackend      CloudMolaBackend
              ↓                      ↓
         mola-core :4141     cloud.mola.sh/api/v1
              ↓                      ↓
           QEMU (local)       Cloud VMs (Germany)
```

---

## Key Differences: Local vs Cloud

| Aspect | Local (mola-core) | Cloud (cloud.mola.sh) |
|--------|-------------------|------------------------|
| **Auth** | Token from `~/.mola/token` | Bearer token via `MOLA_TOKEN` or login |
| **Lifecycle** | Synchronous | Asynchronous (poll operation) |
| **Persistence** | Throwaway VMs | Persistent computers (reuse by ID/name) |
| **Desktop URL** | `POST /machines/{id}/desktop` | `POST /computers/{id}/desktop-sessions` |
| **Actions API** | ✅ Identical | ✅ Identical (exec, screenshot, click, etc.) |
| **Cost** | Free (local resources) | Usage-based ($20+/mo, 10h free tier) |
| **Auto-stop** | Manual (reaper) | Built-in (30/60/240 min) |

---

## API Mapping

### Actions (100% compatible)

- `exec` ✅
- `read_file` ✅
- `write_file` ✅
- `screenshot` ✅
- `click` ✅
- `move` ✅
- `type` ✅
- `key` ✅
- `scroll` ⚠️ Cloud: `up`/`down` only (no `left`/`right`)

### Lifecycle (needs abstraction)

| Operation | Local | Cloud | Difference |
|-----------|-------|-------|------------|
| Create | Sync | Async → operation | Must poll |
| Start | Sync | Async → operation | Must poll |
| Stop | Sync | Async → operation | Must poll |
| Delete | Sync | Async → operation | Must poll |
| Get/List | Sync | Sync | Same |

---

## Implementation Plan

### Phase 1: MVP (First PR)

**Files to create:**
- `lib/backends/backend.ts` - Interface definition
- `lib/backends/factory.ts` - Backend selection via env var
- `lib/backends/local.ts` - Refactored local implementation
- `lib/backends/cloud.ts` - New cloud implementation (~400 LOC)

**Files to modify:**
- `lib/engine.ts` - Thin facade over backend
- `lib/tools.ts` - Computer reuse logic for cloud
- `README.md` - Document cloud mode

**Estimated size:** ~800 LOC, mostly cloud.ts

### Phase 2: Polish

- Setup wizard backend selection UI
- Cloud-specific error messages
- Auto-stop configuration UI
- Snapshot tools

### Phase 3: Advanced

- Multi-region support
- Usage/cost tracking
- SSH integration UI
- Computer management dashboard

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Async ops timeout | Medium | Poll with 2s interval, 180s timeout |
| Desktop URL expiry | Low | Already handled (auto-reconnect) |
| Concurrent action 409s | Low | Agent runs serially (no change needed) |
| Auto-stop surprises | Medium | 60min default + heartbeat extensions |
| Regional latency (Germany only) | Low | Document; add regions when available |
| Scroll left/right missing | Low | Validate in tool; agent prefers up/down |

---

## Success Criteria

### MVP Complete ✓

- [x] Architecture investigation complete
- [x] API mapping documented
- [x] Integration plan written
- [ ] Backend interface implemented
- [ ] Cloud backend implemented
- [ ] Local mode no regression
- [ ] End-to-end test in cloud mode
- [ ] README updated

### Production Ready

- [ ] Setup wizard includes backend selection
- [ ] Cloud errors have helpful messages
- [ ] Usage/cost visible in UI
- [ ] Snapshot tools available

---

## Example Usage

### Local mode (existing)

```bash
# Terminal 1
npx mola-core

# Terminal 2
npx mola-agent
```

### Cloud mode (new)

```bash
npx mola-cloud login
export MOLA_BACKEND=cloud
npx mola-agent
```

Both modes have identical agent conversation UX. The backend is transparent to the user after setup.

---

## Documents

1. **[cloud-integration-plan.md](./cloud-integration-plan.md)** - Comprehensive technical plan (10,000+ words)
2. **[cloud-setup.md](./cloud-setup.md)** - User-facing setup guide
3. **SUMMARY.md** - This document (executive overview)

---

## Next Steps

### For Repository Owner

1. **Review documents** - Approve architecture, API mapping, phased rollout
2. **Approve MVP scope** - Confirm what goes in first PR
3. **Decide on open questions** (from plan):
   - Computer lifecycle: delete on thread delete, or just stop?
   - Naming: per-thread computers or shared?
   - Auto-stop default: 30min (free) or 60min?

### For Implementation (if approved)

1. Create `lib/backends/` directory
2. Implement interface + factory
3. Refactor local backend (no behavior change)
4. Implement cloud backend
5. Test both modes
6. Update README
7. Open PR

---

## Open Questions

See section 8 in [cloud-integration-plan.md](./cloud-integration-plan.md) for full discussion. Key decisions needed:

1. **Computer deletion policy** - Stop or delete when thread deleted?
2. **Computer naming** - One per thread vs shared?
3. **Profile selection** - Hardcode `small` or expose UI?
4. **Auto-stop default** - 30min (free tier) or 60min (generous)?
5. **Credential storage** - Read `~/.mola-cloud/credentials` or require `MOLA_TOKEN`?

---

## References

- **Cloud API:** https://cloud.mola.sh/api/v1
- **OpenAPI:** https://cloud.mola.sh/openapi.json
- **Full docs:** https://cloud.mola.sh/llms-full.txt
- **Billing:** https://cloud.mola.sh/docs/billing
- **CLI:** https://cloud.mola.sh/docs/cli

---

**Investigation complete.** Ready for review and approval.
