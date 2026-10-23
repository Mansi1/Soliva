# Episodes

<!-- Newest last. The gate appends FAIL|DONE|FINDING and keeps the last 100 entries (git keeps older ones).
Agents append `<UTC ISO> s=<session> LESSON <Signan>` only for a falsified HYPOTHESIS, a dead end, or a root cause.
A lesson recurring ≥2 → test | .agents/VERIFY.py rule | MEMORY line, then delete its lines. -->

2026-10-01T05:48:36Z s=328f726c FINDING vite.config.ts:63 learn=none: one-line config fallback; no cheap mechanical rule beyond the .env.example default BASE_PATH=/
2026-10-09T21:24:52Z s=560a6297 FINDING src/trackTags.ts:readTrackTags link learn=none: Assets are our own files; one guarded line, no recurring mechanism worth a verifier rule.
2026-10-09T21:24:52Z s=560a6297 FINDING src/main.ts:nextTrack hook learn=none: Stale comment, not mechanically checkable.
2026-10-09T21:24:52Z s=560a6297 FINDING scope: Hud.tsx, Ground.ts, terrainRenderer.ts, terrainShader.ts, map.ts, crowd.ts, farming.ts, villagers.ts, world.ts, crowd.test.mjs learn=none: Scope note, not a defect.
2026-10-09T21:24:52Z s=560a6297 FINDING .github/workflows/verify.yml:checkout learn=none: CI itself is the check; confirmed once the push with workflow scope runs.
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
2026-10-10T16:32:42Z s=560a6297 DONE fp=b33ff45b11dd cov=80.4% paths=docs/BLENDER.md,src/components/SelectionPanel.tsx,src/gallery.ts,src/game/Picker.ts(+20)
2026-10-10T16:32:42Z s=560a6297 FINDING src/game/Picker.ts:animal, src/game/overlay.ts, src/game/selectionView.ts, src/game/hoverInfo.ts learn=none: Fixed by reading animal.look/size/maxFood; all display callers grepped (def.food/def.shape/def.height in src/game, src/components).
2026-10-11T11:36:32Z s=560a6297 DONE fp=71f4d4813424 cov=80.4% paths=docs/BLENDER.md,src/components/SelectionPanel.tsx,src/gallery.ts,src/game/Picker.ts(+33)
2026-10-11T11:36:32Z s=560a6297 FINDING src/game/selectionView.ts:import catalog, goodsText/animalName learn=none: Pure merge resolution; covered by existing storage-stock and herd tests plus smoke.
2026-10-11T14:07:06Z s=560a6297 FAIL prose
2026-10-11T14:09:11Z s=560a6297 DONE fp=d5ca381ab268 cov=80.4% paths=docs/ANIMATION.md,docs/BLENDER.md,memory.md,src/gallery.ts(+10)
2026-10-11T14:09:11Z s=560a6297 FINDING docs/ANIMATION.md:413 T06 learn=none: Prose gate checks it mechanically.
2026-10-11T14:09:11Z s=560a6297 FINDING make e2e port 4173 learn=memory: memory.md Umgebung entry 2026-10-11.
2026-10-11T14:09:11Z s=560a6297 FINDING src/world/render.ts:loadLook learn=test: tests/load-look.test.mjs
2026-10-11T14:09:11Z s=560a6297 FINDING src/gl/entityRenderer.ts:CARRY_STILL learn=none: Visual stand-in; a real stand-with-load clip needs larger uniform arrays.
2026-10-11T14:01:39Z s=560a6297 FAIL tests.e2e.1
2026-10-11T14:04:13Z s=560a6297 DONE fp=25f10ca3e639 cov=80.4% paths=docs/BLENDER.md,memory.md,src/components/SelectionPanel.tsx,src/gallery.ts(+22)
2026-10-11T14:04:13Z s=560a6297 FINDING make e2e / make start (port 4173) learn=memory: Parallel worktrees share the fixed preview port; run make verify in worktrees one after another. Recorded in memory.md.
2026-10-11T14:04:13Z s=560a6297 FINDING src/world/world.ts:canPlant learn=none: Not observed in Testseed; the condition is named in the ponytail comment.
2026-10-11T14:04:13Z s=560a6297 FINDING src/world/deposits.ts:restore/plantedSave learn=test: tests/forester.test.mjs
2026-10-11T21:55:49Z s=560a6297 DONE fp=88457e3ead34 cov=80.4% paths=docs/ANIMATION.md,docs/BLENDER.md,docs/OFFEN.md,memory.md(+26)
2026-10-11T21:55:49Z s=560a6297 FINDING src/world/render.ts:throw/hoe phase learn=none: Visual timing; checked in gallery throw sequence screenshots, no cheap mechanical check.
2026-10-11T21:55:49Z s=560a6297 FINDING src/world/render.ts:figureHolding (hunter) learn=test: tests/spear.test.mjs + load-look; gallery screenshot.
2026-10-11T21:55:49Z s=560a6297 FINDING src/gl/entityRenderer.ts:away mask learn=none: Shader constant; covered visually only.
2026-10-11T21:55:49Z s=560a6297 FINDING src/world/villagers.ts:hopeless learn=test: tests/spear.test.mjs gives up on the hare.
2026-10-11T21:55:49Z s=560a6297 FINDING src/world/save.ts:inv learn=test: tests/spear.test.mjs save round-trip and old save.
2026-10-11T22:31:17Z s=560a6297 DONE fp=c0a7c323a884 cov=80.5% paths=docs/ANIMATION.md,docs/BLENDER.md,docs/OFFEN.md,memory.md(+22)
2026-10-11T22:31:17Z s=560a6297 FINDING src/world/villagers.ts:lookForShoes learn=test: tests/shoes.test.mjs idle fetch, detour near, no detour far.
2026-10-11T22:31:17Z s=560a6297 FINDING src/gl/entityRenderer.ts:shin anchor learn=none: Visual-only shader change.
2026-10-11T22:31:17Z s=560a6297 FINDING src/models/villagers/{male,female}.glb learn=test: tests/ids + check-models.
2026-10-11T22:31:17Z s=560a6297 FINDING src/world/save.ts:inv.shoes learn=test: tests/shoes.test.mjs save round-trip.
2026-10-11T22:46:39Z s=560a6297 FAIL tests.unit,coverage
2026-10-11T22:49:58Z s=560a6297 DONE fp=4a467cf24e27 cov=80.5% paths=docs/ANIMATION.md,docs/BLENDER.md,docs/OFFEN.md,memory.md(+21)
2026-10-11T22:49:58Z s=560a6297 FINDING src/world/archery.ts (allBuildings().some) learn=test: tests/archery.test.mjs exercises sendToRange.
2026-10-11T22:49:58Z s=560a6297 FINDING merge feat/schuhe (PR #65) into feat/bogen learn=test: tests/archery + tests/shoes cover both inventory slots after merge.
2026-10-11T22:49:58Z s=560a6297 FINDING src/world/unit/skills.ts:practise learn=test: tests/archery.test.mjs master 1.5x, capped.
2026-10-11T22:49:58Z s=560a6297 FINDING src/gl/entityRenderer.ts:away mask bow bit learn=none: Visual-only shader constant.
2026-10-11T22:58:26Z s=560a6297 DONE fp=87959e667926 cov=80.5% paths=docs/ANIMATION.md,docs/BLENDER.md,docs/OFFEN.md,memory.md(+28)
2026-10-11T22:58:26Z s=560a6297 FINDING src/world/pasture.ts:deliver (inside) learn=test: tests/pasture.test.mjs asserts he is visible while tending.
2026-10-11T22:58:26Z s=560a6297 FINDING src/world/building/Pasture.ts:key learn=none: No check for duplicate build keys exists; a cheap test could assert unique BUILDINGS keys - left as note.
2026-10-11T22:58:26Z s=560a6297 FINDING src/world/villagers.ts:tick case archery learn=none: Merge artefact; tsc noFallthrough not enabled, tests/archery+pasture pass after fix.
2026-10-11T22:58:26Z s=560a6297 FINDING src/world/villagers.ts:hopeless / blockedAt / hunt learn=test: tests/pasture, spear, shoes, archery all green (139).
2026-10-11T22:58:26Z s=560a6297 FINDING src/gl/entityRenderer.ts:PROP_TEST learn=none: Visual-only shader constant.
2026-10-11T23:37:49Z s=560a6297 DONE fp=eee85c79118a cov=80.5% paths=docs/OFFEN.md,memory.md,src/components/SelectionPanel.css,src/components/SelectionPanel.tsx(+17)
2026-10-11T23:37:49Z s=560a6297 FINDING src/world/save.ts:migrate learn=test: tests/research.test.mjs save round-trip; memory.md notes migrate must pass new top-level fields.
2026-10-11T23:37:49Z s=560a6297 FINDING src/gl/entityRenderer.ts:SHAPE.clogs icon learn=test: smoke checks research buttons have an image.
2026-10-11T23:37:49Z s=560a6297 FINDING src/world/research.ts:blocker learn=none: Depends on B26 merge; will be handled there.
2026-10-11T23:37:49Z s=560a6297 FINDING src/world/villagers.ts:hunt leather learn=test: tests/research.test.mjs hunted sheep gives 4 leather + meat.
2026-10-11T23:55:10Z s=560a6297 DONE fp=670c1141e8ce cov=80.6% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,memory.md(+19)
2026-10-11T23:55:10Z s=560a6297 FINDING src/world/world.ts:startResearch learn=test: tests/construction.test.mjs asserts startResearch on a town center site is refused.
2026-10-11T23:55:10Z s=560a6297 FINDING src/world/building/BuildingBase.ts:built / stores / isUnitProducer learn=test: tests/construction.test.mjs: site does not store, house, train or work.
2026-10-11T23:55:10Z s=560a6297 FINDING src/gl/entityRenderer.ts:gCut for sites learn=none: Screenshot comparison within noise.
2026-10-11T23:55:10Z s=560a6297 FINDING tools/ui/smoke.mjs learn=test: Smoke covers site and finished workshop.
2026-10-11T23:55:10Z s=560a6297 FINDING src/world/construction.ts:hasTownCenter learn=none: No observed failure; noted in docs/OFFEN.md.
2026-10-12T00:38:25Z s=560a6297 DONE fp=483bcf8f0b59 cov=80.7% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,memory.md(+28)
2026-10-12T00:38:25Z s=560a6297 FINDING src/world/walls.ts:wallLine learn=test: tests/walls.test.mjs every step shares an edge; ring without gate has no route out.
2026-10-12T00:38:25Z s=560a6297 FINDING src/world/building/BuildingBase.ts:passable learn=test: tests/walls.test.mjs gate lets villager out, locked gate not, cows stay in 60 s.
2026-10-12T00:38:25Z s=560a6297 FINDING src/world/construction.ts:sendToSite learn=test: tests/walls.test.mjs builders spread; tests/construction.test.mjs fifth refused.
2026-10-12T00:38:25Z s=560a6297 FINDING tests/keys.test.mjs learn=test: tests/keys.test.mjs
2026-10-12T00:38:25Z s=560a6297 FINDING src/world/render.ts:gate open check learn=none: Not measured (no benchmarks by user rule).
2026-10-12T00:45:24Z s=9d3ed845 DONE fp=125eadaec3e4 cov=80.6% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,memory.md(+20)
2026-10-12T00:45:24Z s=9d3ed845 FINDING src/world/construction.ts:nearestDeposit learn=test: B35 plan requires a test in tests/water-path.test.mjs: an unreachable tree leads to the next reachable tree.
2026-10-12T00:45:24Z s=9d3ed845 FINDING src/world/construction.ts:freeSlot learn=test: B35 plan requires a test in tests/construction.test.mjs for the enclosed site side.
2026-10-12T00:46:23Z s=9d3ed845 DONE fp=231997e1b4b1 cov=80.6% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,memory.md(+20)
2026-10-23T16:37:52Z s=9d3ed845 DONE fp=15d1ffc385ff cov=80.7% paths=README.md,plans/2026-10-09_21-50_bugs-sammlung.md,src/game/hoverInfo.ts,src/game/selectionView.ts(+7)
2026-10-23T16:37:52Z s=9d3ed845 FINDING src/world/villagers.ts:tickTask gather learn=test: tests/water-path.test.mjs B35 x2 fail on old code, pass now
2026-10-23T16:37:52Z s=9d3ed845 FINDING src/world/construction.ts:tickBuilder learn=test: tests/construction.test.mjs B35 fails on old code; tests/walls.test.mjs spread test guards freeSlot
2026-10-23T16:37:52Z s=9d3ed845 FINDING src/world/villagers.ts:tickFarmer learn=test: tests/fields.test.mjs B2/B36 and B36 paid-furrow tests fail on old code
2026-10-23T16:37:52Z s=9d3ed845 FINDING src/world/villagers.ts:blockedAt learn=test: tests/construction.test.mjs B39 x2 fail on old code
2026-10-23T16:37:52Z s=9d3ed845 FINDING src/game/selectionView.ts:animalSex learn=test: tests/herd.test.mjs B38 fails on old code
2026-10-23T16:37:52Z s=9d3ed845 FINDING README.md:Bauen learn=none: doc only
