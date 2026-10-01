# Episodes

<!-- Newest last. The gate appends FAIL|DONE|FINDING and keeps the last 100 entries (git keeps older ones).
Agents append `<UTC ISO> s=<session> LESSON <Signan>` only for a falsified HYPOTHESIS, a dead end, or a root cause.
A lesson recurring ≥2 → test | .agents/VERIFY.py rule | MEMORY line, then delete its lines. -->

2026-10-01T05:42:15Z s=328f726c FAIL layout,env.example,tests.unit=?,coverage=?
2026-10-01T05:48:36Z s=328f726c DONE fp=0c870cf3d40e cov=97.8% paths=.github/workflows/pages.yml,.github/workflows/verify.yml,Makefile,src/components/GalleryOverlay.tsx(+6)
2026-10-01T05:48:36Z s=328f726c FINDING tools/ui/smoke.mjs:107 learn=test: make e2e runs the smoke test against the Pages build under /soliva/, so any new root-absolute path or check fails there
2026-10-01T05:48:36Z s=328f726c FINDING vite.config.ts:63 learn=none: one-line config fallback; no cheap mechanical rule beyond the .env.example default BASE_PATH=/
