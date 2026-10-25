# Episodes

<!-- Newest last. The gate appends FAIL|DONE|FINDING and keeps the last 100 entries (git keeps older ones).
Agents append `<UTC ISO> s=<session> LESSON <Signan>` only for a falsified HYPOTHESIS, a dead end, or a root cause.
A lesson recurring ≥2 → test | .agents/VERIFY.py rule | MEMORY line, then delete its lines. -->

2026-10-01T05:48:36Z s=328f726c FINDING vite.config.ts:63 learn=none: one-line config fallback; no cheap mechanical rule beyond the .env.example default BASE_PATH=/
2026-10-09T21:24:52Z s=560a6297 FINDING src/trackTags.ts:readTrackTags link learn=none: Assets are our own files; one guarded line, no recurring mechanism worth a verifier rule.
2026-10-09T21:24:52Z s=560a6297 FINDING src/main.ts:nextTrack hook learn=none: Stale comment, not mechanically checkable.
2026-10-09T21:24:52Z s=560a6297 FINDING scope: Hud.tsx, Ground.ts, terrainRenderer.ts, terrainShader.ts, map.ts, crowd.ts, farming.ts, villagers.ts, world.ts, crowd.test.mjs learn=none: Scope note, not a defect.
2026-10-09T21:24:52Z s=560a6297 FINDING .github/workflows/verify.yml:checkout learn=none: CI itself is the check; confirmed once the push with workflow scope runs.
2026-10-10T00:20:02Z s=560a6297 FINDING scope learn=none: Scope note.
2026-10-10T11:31:17Z s=560a6297 FINDING src/world/villagers.ts:throwRelease learn=none: Visual one-frame glitch; no cheap mechanical check without a rendering harness.
2026-10-10T11:31:17Z s=560a6297 FINDING src/gl/entityRenderer.ts:away (P_TOOL) learn=none: Covered by gallery screenshot; smoke checks clip libraries load, not prop visibility.
2026-10-10T11:42:03Z s=560a6297 FINDING src/world/unit/*.ts walk/flee learn=none: Requirement interpretation, not a code defect.
2026-10-10T16:19:50Z s=560a6297 FINDING src/main.ts:imtheking cheat learn=none: Frozen getter makes any leftover write fail loudly; no further check needed.
2026-10-10T16:32:42Z s=560a6297 FINDING src/game/Picker.ts:animal, src/game/overlay.ts, src/game/selectionView.ts, src/game/hoverInfo.ts learn=none: Fixed by reading animal.look/size/maxFood; all display callers grepped (def.food/def.shape/def.height in src/game, src/components).
2026-10-11T11:36:32Z s=560a6297 FINDING src/game/selectionView.ts:import catalog, goodsText/animalName learn=none: Pure merge resolution; covered by existing storage-stock and herd tests plus smoke.
2026-10-11T14:09:11Z s=560a6297 FINDING docs/ANIMATION.md:413 T06 learn=none: Prose gate checks it mechanically.
2026-10-11T14:09:11Z s=560a6297 FINDING src/gl/entityRenderer.ts:CARRY_STILL learn=none: Visual stand-in; a real stand-with-load clip needs larger uniform arrays.
2026-10-11T14:04:13Z s=560a6297 FINDING src/world/world.ts:canPlant learn=none: Not observed in Testseed; the condition is named in the ponytail comment.
2026-10-11T21:55:49Z s=560a6297 FINDING src/world/render.ts:throw/hoe phase learn=none: Visual timing; checked in gallery throw sequence screenshots, no cheap mechanical check.
2026-10-11T21:55:49Z s=560a6297 FINDING src/gl/entityRenderer.ts:away mask learn=none: Shader constant; covered visually only.
2026-10-11T22:31:17Z s=560a6297 FINDING src/gl/entityRenderer.ts:shin anchor learn=none: Visual-only shader change.
2026-10-11T22:49:58Z s=560a6297 FINDING src/gl/entityRenderer.ts:away mask bow bit learn=none: Visual-only shader constant.
2026-10-11T22:58:26Z s=560a6297 FINDING src/world/building/Pasture.ts:key learn=none: No check for duplicate build keys exists; a cheap test could assert unique BUILDINGS keys - left as note.
2026-10-11T22:58:26Z s=560a6297 FINDING src/world/villagers.ts:tick case archery learn=none: Merge artefact; tsc noFallthrough not enabled, tests/archery+pasture pass after fix.
2026-10-11T22:58:26Z s=560a6297 FINDING src/gl/entityRenderer.ts:PROP_TEST learn=none: Visual-only shader constant.
2026-10-11T23:37:49Z s=560a6297 FINDING src/world/research.ts:blocker learn=none: Depends on B26 merge; will be handled there.
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
2026-10-23T17:20:36Z s=9d3ed845 DONE fp=617cd2d56756 cov=80.7% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,plans/2026-10-09_21-50_bugs-sammlung.md(+17)
2026-10-23T17:20:36Z s=9d3ed845 FINDING src/world/villagers.ts:deliverTo learn=test: tests/shoes.test.mjs and tests/research.test.mjs: pickup on delivery, prefer leather, no trips when idle or passing
2026-10-23T17:20:36Z s=9d3ed845 FINDING src/world/villagers.ts:tickCrafter deliver learn=test: tests/shoes.test.mjs: first pair delivered and worn, second lies in the town center
2026-10-23T17:20:36Z s=9d3ed845 FINDING src/world/world.ts:applySave learn=test: tests/shoes.test.mjs: old save moves wood and leather pairs with their kinds
2026-10-23T17:20:36Z s=9d3ed845 FINDING src/models/buildings/cobbler.glb learn=test: tests/check-models.test.mjs and tests/ids.test.mjs
2026-10-23T17:20:36Z s=9d3ed845 FINDING src/world/villagers.ts:tickTask gather; src/world/construction.ts:tickBuilder; tickFarmer; blockedAt; selectionView.animalSex learn=test: tests/water-path, construction, fields, herd B35-B39 tests
2026-10-23T19:32:29Z s=9d3ed845 DONE fp=716203380481 cov=80.7% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,index.html(+30)
2026-10-23T19:32:29Z s=9d3ed845 FINDING src/generator.ts:frame cellPixels learn=test: smoke.mjs now clicks Schräg on /generator; frame cost itself is not asserted (no benchmarks by user rule).
2026-10-23T19:32:29Z s=9d3ed845 FINDING src/gl/terrainRenderer.ts:regenerate learn=none: performance detail without a stable threshold to test
2026-10-23T19:32:29Z s=9d3ed845 FINDING src/generator.ts:wheel learn=none: trivial input guard
2026-10-23T19:32:29Z s=9d3ed845 FINDING src/generator.ts:reachZ learn=none: page-local wiring
2026-10-23T19:32:29Z s=9d3ed845 FINDING src/generatorParams.ts:fromQuery learn=test: tests/generator.test.mjs
2026-10-23T20:28:31Z s=9d3ed845 DONE fp=e70dfce745e3 cov=80.7% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,index.html(+31)
2026-10-23T20:28:31Z s=9d3ed845 FINDING src/noise.ts:MapGenerator learn=test: tests/generator.test.mjs MapGenerator test
2026-10-23T20:28:31Z s=9d3ed845 FINDING src/world/resources.ts:dispose learn=none: GPU buffer lifetime is not observable in node tests; one caller (generator.ts)
2026-10-23T20:28:31Z s=9d3ed845 FINDING tools/ui/smoke.mjs:Generator fps learn=none: editing mistake, caught by make lint
2026-10-23T22:35:04Z s=9d3ed845 DONE fp=1bc30d54898a cov=80.7% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,index.html(+31)
2026-10-23T22:52:48Z s=9d3ed845 DONE fp=8fa26cd81866 cov=80.7% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,index.html(+31)
2026-10-23T23:15:07Z s=9d3ed845 DONE fp=9a7d64f3bba8 cov=80.7% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,index.html(+31)
2026-10-23T23:57:16Z s=9d3ed845 DONE fp=bd012c0b2679 cov=80.7% paths=README.md,docs/BLENDER.md,docs/OFFEN.md,index.html(+32)
2026-10-23T23:57:16Z s=9d3ed845 FINDING vite.config.ts:saveBillboards learn=none: dev-only debug output folder; no cheap mechanical check without a browser bake, covered by the comment at the plugin
2026-10-24T01:06:19Z s=ccb2ed49 DONE fp=690b6dba53d3 cov=80.7% paths=src/components/StartScreen.tsx
2026-10-24T01:12:09Z s=ccb2ed49 DONE fp=cc81b9867b58 cov=80.7% paths=README.md,bun.lock,package.json,src/components/StartScreen.tsx(+1)
2026-10-24T03:36:19Z s=ccb2ed49 FAIL tests.unit,coverage
2026-10-24T03:39:12Z s=ccb2ed49 FAIL tests.unit
2026-10-24T03:58:01Z s=ccb2ed49 DONE fp=34f65d3f1205 cov=84.7% paths=README.md,bun.lock,package.json,src/components/StartScreen.tsx(+9)
2026-10-24T03:58:01Z s=ccb2ed49 FINDING tools/lsystem/bark/data.ts:2,tools/lsystem/leaves/data.ts:2 learn=test: tests/lsystem-sides.test.mjs imports the tool in node, so a missing attribute fails make test
2026-10-24T03:58:01Z s=ccb2ed49 FINDING tools/lsystem/index.html:#wire learn=none: layout detail, only visible in a screenshot; no cheap mechanical check
2026-10-25T16:30:46Z s=ccb2ed49 DONE fp=ed54c0205c65 cov=87.8% paths=README.md,bun.lock,package.json,src/components/StartScreen.tsx(+9)
2026-10-25T16:30:46Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:build collar learn=none: visual only; no cheap geometric check without a mesh intersection test
2026-10-25T16:30:46Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:collar inner radius learn=none: visual only
2026-10-25T16:30:46Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:barkTube naming learn=none: the name rule is unchanged (start radius > 0.12); a test would need ring radii per object from the OBJ, not cheap
2026-10-25T16:43:05Z s=ccb2ed49 DONE fp=17fa5fde4d21 cov=87.8% paths=README.md,bun.lock,package.json,src/components/StartScreen.tsx(+10)
2026-10-25T16:43:05Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:pipeRadii learn=test: tests/lsystem.test.mjs asserts continuity and taper for every single-child segment; fails on the old cylinder radii
2026-10-25T17:12:47Z s=ccb2ed49 DONE fp=c9a7db5276cb cov=88.2% paths=README.md,bun.lock,package.json,src/components/StartScreen.tsx(+12)
2026-10-25T17:12:47Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:rootFoot learn=test: seam test fails if ring count, frame or radius diverge
2026-10-25T17:12:47Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:rootFoot reach learn=none: appearance only
2026-10-25T17:12:47Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:rootFoot ground learn=test: 'Wurzeln reichen nicht unter den Boden'
2026-10-25T18:34:02Z s=ccb2ed49 DONE fp=9dd5ceea940a cov=88.2% paths=README.md,bun.lock,package.json,src/components/StartScreen.tsx(+13)
2026-10-25T18:34:02Z s=ccb2ed49 FINDING tools/lsystem/baumarten.json learn=none: data file is not read by code yet; a schema test would pin a format no consumer uses (YAGNI)
2026-10-25T21:07:58Z s=ccb2ed49 DONE fp=f0d44a57f22d cov=88.2% paths=Makefile,README.md,bun.lock,package.json(+15)
2026-10-25T21:07:58Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:interpret wander learn=test: tests/lsystem.test.mjs Krümmung: FFFF deviates with wander>0, first segment stays at x=z=0
2026-10-25T21:07:58Z s=ccb2ed49 FINDING tools/lsystem/presets/nadelbaeume.ts:mammutbaum wander learn=none: appearance per species; no cheap mechanical bound that is a verified requirement
2026-10-25T21:07:58Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:rootFoot rootSeed learn=test: Wurzel-Seed test: same rootSeed as seed gives identical foot, other rootSeed changes foot, segments and leaves unchanged
2026-10-25T21:07:58Z s=ccb2ed49 FINDING Makefile:coverage learn=none: race inside node test runner output, not reproducible on demand; documented in Makefile comment
2026-10-25T22:20:01Z s=ccb2ed49 DONE fp=5610eb04ca70 cov=88.4% paths=Makefile,README.md,bun.lock,package.json(+16)
2026-10-25T22:20:01Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:interpret scale learn=none: appearance; the height requirement itself is tested
2026-10-25T22:20:01Z s=ccb2ed49 FINDING tools/lsystem/presets/index.ts:sized learn=test: Beispiele sind so hoch wie ihre Art: every mapped preset must lie in its species typical range
2026-10-25T22:20:01Z s=ccb2ed49 FINDING src/gl/entityRenderer.ts:unitLength learn=none: observation about an unchanged caller
2026-10-25T22:25:46Z s=ccb2ed49 DONE fp=f6ffccaf03c9 cov=88.5% paths=Makefile,README.md,bun.lock,package.json(+16)
2026-10-25T22:25:46Z s=ccb2ed49 FINDING tools/lsystem/presets/index.ts:SPECIES fallback learn=none: data gap, needs research of missing diameters; reported to the user
2026-10-25T22:25:46Z s=ccb2ed49 FINDING tools/lsystem/presets/index.ts:sized pipe learn=test: species test asserts diameter in typical range or <= max
2026-10-25T22:35:06Z s=ccb2ed49 DONE fp=9d5dbe3d98d4 cov=88.5% paths=Makefile,README.md,bun.lock,package.json(+16)
2026-10-25T22:35:06Z s=ccb2ed49 FINDING tools/lsystem/lsystem.ts:turnFrame learn=test: Gerüst bleibt endlich: interprets every preset at full iterations; fails on HEAD f8f171d, passes with the fix
2026-10-25T23:11:26Z s=ccb2ed49 DONE fp=73e47adeb9d8 cov=88.5% paths=Makefile,README.md,bun.lock,package.json(+16)
2026-10-25T23:11:26Z s=ccb2ed49 FINDING tools/lsystem/index.html:#reroot learn=none: layout detail, checked by screenshot
