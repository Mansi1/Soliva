# Episodes

<!-- Newest last. The gate appends FAIL|DONE|FINDING and keeps the last 100 entries (git keeps older ones).
Agents append `<UTC ISO> s=<session> LESSON <Signan>` only for a falsified HYPOTHESIS, a dead end, or a root cause.
A lesson recurring ≥2 → test | .agents/VERIFY.py rule | MEMORY line, then delete its lines. -->

2026-10-01T05:42:15Z s=328f726c FAIL layout,env.example,tests.unit=?,coverage=?
2026-10-01T05:48:36Z s=328f726c FINDING tools/ui/smoke.mjs:107 learn=test: make e2e runs the smoke test against the Pages build under /soliva/, so any new root-absolute path or check fails there
2026-10-01T05:48:36Z s=328f726c FINDING vite.config.ts:63 learn=none: one-line config fallback; no cheap mechanical rule beyond the .env.example default BASE_PATH=/
2026-10-09T21:09:36Z s=560a6297 DONE fp=931afad83a22 cov=79.1% paths=AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md,memory.md(+23)
2026-10-09T21:24:52Z s=560a6297 DONE fp=30bd0a2c69f0 cov=79.1% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+24)
2026-10-09T21:24:52Z s=560a6297 FINDING src/trackTags.ts:readTrackTags link learn=none: Assets are our own files; one guarded line, no recurring mechanism worth a verifier rule.
2026-10-09T21:24:52Z s=560a6297 FINDING tools/ui/smoke.mjs:menu checks learn=test: Smoke test now pins tag display and the default-off checkbox.
2026-10-09T21:24:52Z s=560a6297 FINDING tools/ui/smoke.mjs:end learn=verifier: Encoded by the existing gate check tests.e2e.evidence.
2026-10-09T21:24:52Z s=560a6297 FINDING src/main.ts:nextTrack hook learn=none: Stale comment, not mechanically checkable.
2026-10-09T21:24:52Z s=560a6297 FINDING memory.md:21,47,49 T06 learn=verifier: Prose gate checks typography.
2026-10-09T21:24:52Z s=560a6297 FINDING AGENTS.md:277,282,300 T06 learn=verifier: Prose gate checks typography on every touched page.
2026-10-09T21:24:52Z s=560a6297 FINDING docs/OPTIMIZATION_PLAN.md:3-537 T02,T06 learn=verifier: Prose gate checks typography of every touched page.
2026-10-09T21:24:52Z s=560a6297 FINDING scope: Hud.tsx, Ground.ts, terrainRenderer.ts, terrainShader.ts, map.ts, crowd.ts, farming.ts, villagers.ts, world.ts, crowd.test.mjs learn=none: Scope note, not a defect.
2026-10-09T21:24:52Z s=560a6297 FINDING memory.md:27 learn=memory: Lives in memory.local.md now.
2026-10-09T21:24:52Z s=560a6297 FINDING .github/workflows/verify.yml:checkout learn=none: CI itself is the check; confirmed once the push with workflow scope runs.
2026-10-09T21:36:02Z s=560a6297 DONE fp=39773e816be6 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+24)
2026-10-09T21:36:02Z s=560a6297 FINDING src/trackTags.ts:readTrackTags link learn=test: tests/track-tags.test.mjs: no link for WCOM only, other description, javascript: URL.
2026-10-09T21:38:33Z s=560a6297 DONE fp=b164b6cf31da cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+24)
2026-10-09T21:38:33Z s=560a6297 FINDING assets/music/*.mp3 WCOM; tests/track-tags.test.mjs no-link cases learn=test: No-link cases stay in tests/track-tags.test.mjs.
2026-10-09T21:50:45Z s=560a6297 DONE fp=b7f55f1c3459 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T21:53:37Z s=560a6297 DONE fp=e27769bcddf2 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T21:55:27Z s=560a6297 DONE fp=16639f7cd7cc cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T21:57:58Z s=560a6297 DONE fp=485f83e6dde1 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T21:59:00Z s=560a6297 DONE fp=882598d1dc84 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T21:59:56Z s=560a6297 DONE fp=d2fd54d09dbd cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:00:24Z s=560a6297 DONE fp=c19d59f56e09 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:02:11Z s=560a6297 DONE fp=2067011fa074 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:04:52Z s=560a6297 DONE fp=16787a5011ae cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:05:57Z s=560a6297 DONE fp=e725c3d87292 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:07:08Z s=560a6297 DONE fp=d62863867460 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:07:48Z s=560a6297 DONE fp=8ac7615a7f54 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:08:05Z s=560a6297 DONE fp=b77fc6cd30c2 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:09:19Z s=560a6297 DONE fp=61c793304d3c cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:10:38Z s=560a6297 DONE fp=bb37b783044c cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:12:23Z s=560a6297 DONE fp=2aff7be73b88 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:13:41Z s=560a6297 DONE fp=e83df8aeb3a9 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:14:33Z s=560a6297 DONE fp=3c8717d56dd3 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:16:40Z s=560a6297 DONE fp=094befb331a2 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:17:06Z s=560a6297 DONE fp=d213a3a0b8e4 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:21:07Z s=560a6297 DONE fp=2fcc3cdd1717 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:24:06Z s=560a6297 DONE fp=78ffa8041904 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:25:07Z s=560a6297 DONE fp=38eb13b54595 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:26:02Z s=560a6297 DONE fp=f99a8442ffd5 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:27:57Z s=560a6297 DONE fp=7a36b2cb5c0e cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:31:10Z s=560a6297 DONE fp=5d566554a4b6 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:31:59Z s=560a6297 DONE fp=74d795794954 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:32:25Z s=560a6297 DONE fp=04045174f49a cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:34:05Z s=560a6297 DONE fp=2c73f9a59cc7 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:35:12Z s=560a6297 DONE fp=597d212e7b97 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:35:54Z s=560a6297 DONE fp=df6dfa4f878d cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:37:31Z s=560a6297 DONE fp=a2ea696215ee cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:37:54Z s=560a6297 DONE fp=66578b0a5f70 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:39:58Z s=560a6297 DONE fp=5e8fc8a8d6d4 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:40:16Z s=560a6297 DONE fp=3fa82435768f cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:41:32Z s=560a6297 DONE fp=4da0007e2643 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:44:27Z s=560a6297 DONE fp=56c26402f7b9 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:46:02Z s=560a6297 DONE fp=219045582e11 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:48:03Z s=560a6297 DONE fp=09ab7bbdfcc6 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:49:31Z s=560a6297 DONE fp=d2be38b77042 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:50:03Z s=560a6297 DONE fp=dd9a270caa36 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:51:16Z s=560a6297 DONE fp=83f7bc20233f cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:52:18Z s=560a6297 DONE fp=c7344339edea cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:55:01Z s=560a6297 DONE fp=09abe0671e01 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T22:56:51Z s=560a6297 DONE fp=49c30d7b4be1 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T23:01:20Z s=560a6297 DONE fp=e2fe88c3dfcc cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T23:37:49Z s=560a6297 DONE fp=0b35d81ee4eb cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-09T23:39:29Z s=560a6297 DONE fp=20ede49c5ee5 cov=79.2% paths=.github/workflows/verify.yml,AGENTS.md,bun.lock,docs/OPTIMIZATION_PLAN.md(+25)
2026-10-10T00:14:16Z s=560a6297 FAIL prose
2026-10-10T00:20:02Z s=560a6297 DONE fp=32e92ff7e523 cov=79.7% paths=.github/workflows/verify.yml,AGENTS.md,README.md,bun.lock(+56)
2026-10-10T00:20:02Z s=560a6297 FINDING src/world/villagers.ts:enter/nearestDropSite learn=test: Regression test in tests/water-path.test.mjs.
2026-10-10T00:20:02Z s=560a6297 FINDING tests/training-queue.test.mjs, tests/build-preview.test.mjs learn=test: Single fixture; mutation-checked test.
2026-10-10T00:20:02Z s=560a6297 FINDING README.md, docs/ANIMATION.md, docs/OFFEN.md T02/T06 learn=verifier: Prose gate.
2026-10-10T00:20:02Z s=560a6297 FINDING B19 rename (24 files) learn=test: Smoke checks Dorfzentrum labels.
2026-10-10T00:20:02Z s=560a6297 FINDING scope learn=none: Scope note.
2026-10-10T00:33:44Z s=560a6297 DONE fp=7aa3fd1afe1e cov=79.7% paths=.github/workflows/verify.yml,AGENTS.md,README.md,bun.lock(+58)
2026-10-10T00:33:44Z s=560a6297 FINDING src/world/farming.ts:furrowNeeds learn=test: tests/fields.test.mjs B2 harvests only the ripe furrow with wood=0, then phase wood.
2026-10-10T11:26:52Z s=560a6297 FAIL prose
2026-10-10T11:31:17Z s=560a6297 DONE fp=1bb36e527682 cov=79.7% paths=.github/workflows/verify.yml,AGENTS.md,README.md,bun.lock(+65)
2026-10-10T11:31:17Z s=560a6297 FINDING src/world/villagers.ts:throwRelease learn=none: Visual one-frame glitch; no cheap mechanical check without a rendering harness.
2026-10-10T11:31:17Z s=560a6297 FINDING src/gl/entityRenderer.ts:away (P_TOOL) learn=none: Covered by gallery screenshot; smoke checks clip libraries load, not prop visibility.
2026-10-10T11:42:03Z s=560a6297 DONE fp=b7347b860d62 cov=79.7% paths=.github/workflows/verify.yml,AGENTS.md,README.md,bun.lock(+74)
2026-10-10T11:42:03Z s=560a6297 FINDING src/world/unit/*.ts walk/flee learn=none: Requirement interpretation, not a code defect.
2026-10-10T07:46:55Z s=560a6297 DONE fp=8e3cb678f581 cov=79.7% paths=.github/workflows/verify.yml,AGENTS.md,README.md,bun.lock(+59)
2026-10-10T08:01:28Z s=560a6297 DONE fp=9ba99f4436fd cov=80.4% paths=.github/workflows/verify.yml,AGENTS.md,README.md,bun.lock(+62)
2026-10-10T15:47:58Z s=560a6297 DONE fp=250970fa8dea cov=80.4% paths=.github/workflows/verify.yml,AGENTS.md,README.md,bun.lock(+78)
2026-10-10T15:47:58Z s=560a6297 FINDING src/models/animals/boar.glb:Head.Neck learn=memory: Documented as model rule in docs/BLENDER.md (Tiere); no cheap mechanical check for intended pivot location beyond gallery.
2026-10-10T15:47:58Z s=560a6297 FINDING src/world/unit/Boar.ts:height learn=test: Size test checks every species against its model height.
2026-10-10T15:48:12Z s=560a6297 DONE fp=8514279440e3 cov=80.4% paths=.github/workflows/verify.yml,AGENTS.md,README.md,bun.lock(+78)
2026-10-10T16:19:50Z s=560a6297 DONE fp=62a0de175c8b cov=80.4% paths=src/components/SelectionPanel.tsx,src/game/selectionView.ts,src/main.ts,src/world/building/Armory.ts(+13)
2026-10-10T16:19:50Z s=560a6297 FINDING src/main.ts:imtheking cheat learn=none: Frozen getter makes any leftover write fail loudly; no further check needed.
