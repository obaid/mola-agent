# Changelog

## 1.1.3 — 2026-09-27

- Fix Cloud provisioning: preserve the computer/operation envelope and recognize `succeeded` operations.
- Parse Cloud resource lists correctly so conversations reuse and resume their computers.
- Discover account-available profile slugs and use Cloud's default auto-stop policy.
- Connect the embedded desktop through an authenticated loopback relay to Cloud's noVNC gateway, without periodic forced reconnects.
- Restore the graphical session environment for Chromium and skip first-run onboarding.
- Surface API errors and reject malformed responses instead of retrying blind creation.
- Describe Cloud computers as persistent workspaces and verify cloud lifecycle response contracts.

## 1.1.2 — 2026-09-27

- Fix the missing Sharp external alias that broke chat in the npm package.
- Build production with Webpack and materialize standalone symlinks for npm.
- Install Sharp for the user's OS/CPU instead of bundling the build machine's native binary.
- Verify chat route loading and a real screenshot resize from an installed tarball.

## 1.1.1 — 2026-09-27

- Exclude previous standalone builds and development evidence from package traces.
- Reject recursive bundles during packaging and verify the tarball stays clean.

## 1.1.0 — 2026-09-27

- Choose Local or Cloud on first launch. Local starts or reuses Mola Core; Cloud
  connects through browser login. Finish model setup in the browser before chat.
- Reuse private per-API credentials saved by mola-cloud login.
- Show compact, expandable computer activity and clear working/error states.
- Render Markdown tables, lists and code; keep chat and desktop within responsive columns.
- Clear messages while retaining the conversation, computer and generated files.
- Reuse the existing Chromium window and current tab on Omarchy.
- Resize screenshots to the advertised coordinate space and scale desktop input correctly.
- Attach generated files through real downloads with conversation-scoped storage.
- Keep provider streams on HTTP/1.1 to avoid observed HTTP/2 interruptions.
- Include the cloud backend, settings, profiles and snapshot features already on main.
- Reconcile local desktop URLs and backend selection across tools, viewing and cleanup.
- Restore local machine listings after the backend refactor.

The hands-on Muse comparison records successful tests and remaining quality limits
in `docs/muse-comparison-2026-09-27.md`. Travel planning still requires verification.
