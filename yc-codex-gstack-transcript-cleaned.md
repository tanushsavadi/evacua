# Coding Agent Session: Hardening Evacua’s Re-planning Logic

## Why I’m proud of this session
This session shows how I use Codex CLI with GStack as an engineering partner, not a code generator I blindly trust. We started with an ambitious AI product framing, inspected the actual repo, noticed a mismatch between the existing responder-command-center direction and my household-copilot framing, narrowed the task, and shipped a small deterministic evacuation plan revision engine with tests.

## Editing note
This transcript is cleaned for readability from the raw Codex CLI session log. I removed Codex system/developer prompts, encrypted/log metadata, repeated duplicate entries, long generated skill files, and lockfile noise. I preserved the actual user prompts, repo-inspection conclusions, implementation plan, implementation summary, review findings, QA report, and retro summary.

## Session summary
We scoped a narrow product problem for Evacua: when wildfire conditions change, a household evacuation plan should update in a deterministic, explainable, and testable way.

Early repo inspection found a mismatch: the current app is framed as a responder command center, while the proposed YC narrative was a household evacuation copilot. We treated that as a scoping signal, not something to hide. The session narrowed from “agentic wildfire copilot” to a pure TypeScript plan revision engine.

I pushed back on scope several times: no UI, no API route, no Supabase, no Mapbox, no alert sending, no LLM calls, and no claim that Evacua decides whether someone should evacuate. The implementation stayed focused on the smallest testable wedge.

Implemented:
- `src/lib/evacuation-plan/revision.ts`
- `src/lib/evacuation-plan/revision.test.ts`
- `pnpm test` via Vitest

Review caught and fixed two small issues:
- pet-carrier action was initially too broad and could be added while posture stayed `watch`
- backup route promotion was order-dependent if the backup route was also closed in the same signal set

QA verified:
- `pnpm test`: passed, 7 tests
- `pnpm typecheck`: passed
- `pnpm lint`: passed

Do not overclaim:
- Evacua does not decide whether evacuation is safe.
- Evacua does not replace official evacuation orders.
- This is not live routing, alerting, or emergency dispatch.
- This is a tested deterministic planning core.

---

# Cleaned Transcript

## 1. Office Hours: Scope Before Coding

**User prompt**

```text
Load gstack. Use the gstack-office-hours skill.

I want to create a coding-agent session that I can submit for a YC Startup School application.

Project: Evacua, an agentic wildfire evacuation copilot for households.

Before we code anything, help me scope the strongest possible session. The goal is not to build a huge new feature. The goal is to show excellent judgment with an AI coding agent: clear scoping, pushing back on ambiguity, repo inspection, implementation, tests, review, and QA.

The product problem I’m considering:
When wildfire conditions change, Evacua should update the household’s evacuation plan in a deterministic, explainable, and testable way.

Please challenge the framing first:
1. What is the actual user pain?
2. What is the narrowest impressive wedge?
3. What should we avoid building?
4. What would make this transcript look strong to YC?
5. What would make it look fake, overbuilt, or weak?

Do not edit files yet.
```

**Codex/GStack response**

I’ll use the `office-hours` skill for the framing pass and keep this strictly pre-code. I’m going to read the skill instructions first, then I’ll inspect just enough repo context to make the scoping grounded rather than generic.

The gstack preamble hit sandbox limits writing `~/.gstack`, but the useful read-only state came through: branch `yc-gstack-codex-session`, solo repo mode, no prior relevant session state.

This is a Next app with existing wildfire ops, voice-agent, alerts, signals, plan page, and API routes. I’m reading the README, package metadata, and likely plan/agent files to identify a small deterministic-plan update slice that is real in this codebase.

One important repo fact already changes the framing: the current README and plan say Evacua has pivoted to a responder command center, while your proposed YC session says “household evacuation copilot.” That mismatch is useful if handled explicitly; it is weak if we pretend it is not there.

Here’s the hard framing.

**What I Understand**
Evacua currently presents as a responder command center in the repo: incident ops, route updates, evacuation zones, alerts, voice ops, approval gates. Your YC session framing is household evacuation copilot. That mismatch is the first thing a strong coding-agent transcript should notice.

Do not hide it. Use it.

The strongest session is probably: “We found the repo has responder-command-center surfaces, but the core product thesis needs deterministic household plan revision. So we’ll add a small, testable domain engine first, without pretending to solve routing, alerts, or live emergency decisions.”

**Actual user pain**

The pain is not “wildfire conditions change.” That is too abstract. The real household pain is:

> “I have an evacuation plan, but when a red flag warning, wind shift, road closure, or evacuation warning appears, I don’t know what part of my plan is now wrong, what changed, or why.”

The household does not need an AI that sounds smart. They need a clear posture, a small diff to their plan, reasons tied to specific signals, no hallucinated emergency authority, and predictable behavior they can trust before a crisis.

The trust issue is the product. Deterministic and explainable is not an implementation detail; it is the thing that makes Evacua credible.

**Narrowest impressive wedge**

Build a pure deterministic “plan revision engine.”

Input:
- current household evacuation plan
- household constraints: pets, vehicles, mobility needs, contacts, preferred routes, rally point
- condition changes: fire distance, evacuation warning/order, wind direction, road closure, air quality, red flag warning

Output:
- revised plan
- plan diff
- posture escalation/de-escalation
- explanation list: “changed because…”
- blocked/unsafe assumptions
- testable rule trace

Example wedge:

> “When a road closure blocks the primary route and wind shifts toward the home, Evacua marks the primary route unavailable, promotes the backup route, escalates posture from `watch` to `prepare`, adds a pet-carrier action, and explains each change with source signals.”

That is small, real, and impressive. It avoids “AI magic” while showing excellent judgment.

**What to avoid building**

Avoid live wildfire data integration, real-time route optimization, household onboarding UI, SMS/Telegram alert sending, LLM-generated evacuation advice, map redesigns, “agentic” multi-step orchestration theater, broad responder/household platform reconciliation, and anything that claims to tell people whether it is safe to evacuate.

Also avoid making the agent “decide emergencies.” The product should update a plan and preserve the boundary: official evacuation orders and human judgment remain authoritative.

**What would look strong to YC**

A strong transcript would show you and the coding agent doing this:

1. Inspect the repo first.
2. Notice the household-vs-responder mismatch.
3. Push back on scope.
4. Choose a small deterministic core instead of a flashy UI.
5. Define input/output contracts before implementation.
6. Add tests with concrete wildfire condition scenarios.
7. Keep emergency safety boundaries explicit.
8. Run lint/typecheck/tests.
9. Review the diff critically.
10. QA the behavior with examples.

The strongest artifact is not a huge feature. It is a small module that makes the product more real.

---

## 2. Autoplan: Define a Minimal Testable Slice

**User prompt**

```text
Use gstack-autoplan.

I agree with the recommended wedge: add a deterministic, explainable evacuation plan revision engine.

Before editing files, create a concrete implementation plan for the smallest testable version.

Target behavior:
When a road closure blocks the primary route and wind shifts toward the home, Evacua should:
1. mark the primary route unavailable,
2. promote the backup route,
3. escalate posture from watch to prepare,
4. add a pet-carrier action if the household has pets,
5. return a plan diff,
6. return explanation reasons tied to the input signals,
7. preserve a safety boundary saying Evacua does not replace official evacuation orders.

Please:
- identify the exact files you plan to create or modify,
- define the TypeScript input/output types,
- define the test scenarios,
- explain what you will explicitly avoid touching,
- do not edit files until I approve.
```

**Codex/GStack response**

There is no existing TypeScript test runner in `package.json`; only `lint`, `typecheck`, and `build`. That affects the plan: either add a tiny test runner intentionally, or settle for weaker compile-only validation. For this YC session, I recommend adding Vitest because the feature’s whole point is deterministic behavior.

Using `gstack-autoplan`, with file edits intentionally held back.

**Plan**
Build the smallest useful core as a pure TypeScript domain module. No UI, no API route, no live data, no LLM. The YC transcript should show that we chose deterministic behavior first because this is a trust problem.

**Files to create**
- `src/lib/evacuation-plan/revision.ts`
  - Pure types and `reviseEvacuationPlan(input)` implementation.
  - No React, no Supabase, no network, no dates generated internally.
- `src/lib/evacuation-plan/revision.test.ts`
  - Scenario tests for the deterministic rule engine.

**Files to modify**
- `package.json`
  - Add `"test": "vitest run"`.
  - Add `vitest` to `devDependencies`.
- `pnpm-lock.yaml`
  - Updated by `pnpm add -D vitest`.

I do not recommend touching README, app UI, API routes, Supabase, voice-agent code, alerts, Mapbox, or existing responder ops in this first slice.

**Function contract**

```ts
export function reviseEvacuationPlan(
  input: ReviseEvacuationPlanInput,
): ReviseEvacuationPlanOutput;
```

**Rules**
- If a `road_closure` signal targets the primary route, mark that route `unavailable`; if a backup route exists, set `activeRouteId` to backup route; create diff entries for route status and active route.
- If a `wind_shift` signal has `towardHome: true`, escalate `watch` to `prepare`; do not downgrade `prepare` or `leave`.
- If household `hasPets`, add one pending action with id `pack-pet-carrier`; do not duplicate it on repeated calls.
- Always return a safety boundary: “Evacua updates household planning assumptions but does not replace official evacuation orders or emergency instructions.”

**Test scenarios**
1. Road closure + wind toward home + pets.
2. Road closure on non-primary route.
3. Wind shift toward home without pets.
4. Already `prepare` or `leave`.
5. Idempotency.
6. Primary route blocked with no backup.

**Explicit non-goals**
No live wildfire feeds, geospatial route calculation, official evacuation-order interpretation, alert sending, household onboarding UI, LLM-generated advice, changes to responder command-center flows, or claim that Evacua decides whether evacuation is safe.

---

## 3. Human Scope Narrowing Before Implementation

**User prompt**

```text
This plan is strong, but I want to keep the YC session small and reviewable.

Before implementing, revise the plan with these constraints:
- Do not add UI, API routes, Supabase changes, Mapbox changes, alert sending, or LLM calls.
- Only create the pure TypeScript revision engine and tests.
- Add Vitest only if it is the smallest reasonable test setup for this repo.
- Keep the diff minimal and easy to review.
- Keep all safety-critical decisions deterministic.
- Make the safety boundary explicit but do not overclaim that Evacua decides whether someone should evacuate.

Once you revise the plan, proceed with implementation without asking again unless you find a major blocker.
```

**Codex/GStack response**

Revised plan: create `src/lib/evacuation-plan/revision.ts` and `revision.test.ts`, add only a test script plus Vitest dependency, and leave every product surface/integration untouched. The engine will be pure and deterministic: route closure, wind shift, pet action, diff, reasons, and an explicit non-authoritative safety boundary.

I’m editing only the planned files now. The implementation will clone the input plan, apply explicit rules, and emit machine-checkable diffs and reasons without touching external services or app surfaces.

**Implementation summary**

Implemented the narrow wedge only.

Created `src/lib/evacuation-plan/revision.ts` with a pure deterministic `reviseEvacuationPlan` engine covering route closure, backup promotion, `watch -> prepare`, pet-carrier action, diff output, signal-tied reasons, and the explicit safety boundary.

Created `src/lib/evacuation-plan/revision.test.ts` with 6 focused scenarios, including the exact target case, non-primary closure, no-pets, no downgrade, idempotency, and no-backup behavior.

Updated `package.json` with `pnpm test` and added Vitest as the smallest reasonable TypeScript test setup for this repo. `pnpm-lock.yaml` changed from that dependency install.

No UI, API routes, Supabase, Mapbox, alerts, or LLM paths were touched.

Verification passed:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

---

## 4. Review: Skeptical Diff Review and Fixes

**User prompt**

```text
Use gstack-review.

Review the final diff like a skeptical senior engineer. Focus on:
1. correctness of the deterministic rules,
2. idempotency,
3. whether any emergency/safety claim is too broad,
4. whether the tests actually prove the intended behavior,
5. whether adding Vitest was justified as the smallest reasonable test setup,
6. whether this stayed scoped to the YC-worthy vertical slice.

Do not make large architectural changes. Fix only obvious small issues. If you think something bigger should change, explain it as a risk instead of implementing it.
```

**Codex/GStack response**

I’ll use `gstack-review` in code-review mode and keep fixes limited to small obvious issues. I’m going to read the review workflow, then inspect the actual diff and tests skeptically against your six criteria.

The first diff command only showed tracked files; the new engine files are untracked, so I’m reading them directly and checking the gstack checklist from the installed skill location. That matters because review must include new files, not just git diff output.

I found one small correctness/scope issue worth fixing: the pet-carrier action can currently be added for a primary route closure alone while the plan remains `watch`. The requested vertical slice ties that action to the prepare-level revision, so I’m tightening it to only add once the revised plan is no longer `watch`, and I’ll add a test assertion for that.

I also see a small order-dependent edge case: if both primary and backup routes are in the closure signals, the engine can promote a backup route that is also being closed. I’m making promotion look at the full signal set so it never promotes a known-unavailable backup.

**Pre-landing review: no remaining blocking issues found.**

Auto-fixed:
- `src/lib/evacuation-plan/revision.ts` — Pet-carrier action was broader than the requested slice; it could be added on primary-road closure while posture stayed `watch`. Fixed so it only adds once the revised plan is no longer `watch`.
- `src/lib/evacuation-plan/revision.ts` — Backup promotion was order-dependent if the backup route was also closed in the same signal set. Fixed by precomputing closed route ids and refusing to promote a known-closed backup.

Review findings:
- Deterministic rules now match the target case: primary route unavailable, backup promoted only if available, `watch -> prepare`, pet action only in prepare-or-higher posture, diff and reasons returned.
- Idempotency is acceptable for this slice: repeated revision does not duplicate the pet-carrier action, re-promote routes, or downgrade posture.
- Safety boundary is appropriately narrow: it says Evacua updates planning assumptions and does not replace official orders. It does not claim Evacua decides whether evacuation is safe.
- Tests prove the intended behavior well for the YC vertical slice: target scenario, non-primary closure, no pets, no downgrade, idempotency, no backup, and closed-backup edge.
- Vitest is justified. This repo had no TS test runner, and deterministic behavior is the core product claim here.
- Scope stayed tight: no UI, API routes, Supabase, Mapbox, alert sending, or LLM paths changed.

Residual risk:
The model still has no explicit “no viable route” state. In no-backup or all-routes-closed cases, `activeRouteId` can still point at an unavailable route. That is acceptable for this tiny slice because the type contract only supports a string route id, but the next real product step should add an explicit blocked-route/no-active-route state instead of overloading `activeRouteId`.

Verification passed after fixes:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

---

## 5. QA: Final Verification

**User prompt**

```text
Use gstack-qa.

Re-run:
pnpm test
pnpm typecheck
pnpm lint

Then give me a concise QA report:
- commands run,
- pass/fail status,
- behaviors verified,
- what was not verified,
- remaining manual QA checklist,
- whether this is safe to commit for the YC coding-agent transcript.
```

**Codex/GStack response**

I’ll use `gstack-qa` for the final verification pass. This is a code-only slice, so the QA will focus on command results and behavioral coverage rather than browser testing.

I’m rerunning exactly the three requested commands now. No code changes unless a command exposes a concrete bug.

**QA Report**

Commands run:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Status:
- `pnpm test`: PASS, 1 test file, 7 tests passed
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS

Behaviors verified:
- Primary route closure marks route unavailable.
- Backup route is promoted only when available.
- Backup route is not promoted if it is also closed.
- Wind toward home escalates `watch` to `prepare`.
- `prepare` and `leave` are not downgraded.
- Pet-carrier action is added once for pet households in prepare-or-higher revisions.
- Output includes diff, signal-tied reasons, and explicit official-orders safety boundary.

Not verified:
- UI rendering.
- API integration.
- Supabase persistence.
- Map behavior.
- Alert sending.
- Live wildfire/weather feed behavior.
- End-to-end household workflow.

Safe to commit for the YC coding-agent transcript: yes. This is small, deterministic, tested, scoped, and reviewable.

---

## 6. Retro: Upload-Ready Summary

**User prompt**

```text
Use gstack-retro.

Summarize this coding-agent session for a YC Startup School upload.

Include:
1. what problem we scoped,
2. the repo/product mismatch we noticed,
3. where I pushed back or narrowed scope,
4. what was implemented,
5. what review caught and fixed,
6. what QA verified,
7. what was not verified,
8. what risks remain,
9. what I should not overclaim,
10. why this session shows good judgment with an AI coding agent.

Keep it concise and written like a transcript summary I can paste at the top of a Markdown upload.
```

**Codex/GStack response**

## YC Coding-Agent Session Summary

We scoped a narrow product problem for Evacua: when wildfire conditions change, a household evacuation plan should update in a deterministic, explainable, and testable way.

Early repo inspection found a mismatch: the current app is framed as a responder command center, while the proposed YC narrative was a household evacuation copilot. We treated that as a scoping signal, not something to hide. The session narrowed from “agentic wildfire copilot” to a pure TypeScript plan revision engine.

I pushed back on scope several times: no UI, no API route, no Supabase, no Mapbox, no alert sending, no LLM calls, and no claim that Evacua decides whether someone should evacuate. The implementation stayed focused on the smallest testable wedge.

Implemented:
- `src/lib/evacuation-plan/revision.ts`
- `src/lib/evacuation-plan/revision.test.ts`
- `pnpm test` via Vitest

The engine deterministically handles:
- primary route closure
- backup route promotion only when available
- `watch -> prepare` escalation on wind toward home
- pet-carrier action for pet households once posture is prepare-or-higher
- plan diff output
- signal-tied explanation reasons
- explicit safety boundary preserving official evacuation orders

Review caught and fixed two small issues:
- pet-carrier action was initially too broad and could be added while posture stayed `watch`
- backup route promotion was order-dependent if the backup route was also closed in the same signal set

QA verified:
- `pnpm test`: passed, 7 tests
- `pnpm typecheck`: passed
- `pnpm lint`: passed

Not verified:
- UI behavior
- API integration
- Supabase persistence
- live wildfire/weather feeds
- Mapbox routes
- alert sending
- end-to-end household flow

Remaining risk:
- the model has no explicit “no viable route” state. If all routes are unavailable, `activeRouteId` can still point at an unavailable route. That should be a future product/type design change, not hidden inside this slice.

Do not overclaim:
- Evacua does not decide whether evacuation is safe.
- Evacua does not replace official evacuation orders.
- This is not live routing, alerting, or emergency dispatch.
- This is a tested deterministic planning core.

Why this shows good AI-coding-agent judgment:
- inspected the repo before coding
- noticed and named product/repo mismatch
- narrowed scope aggressively
- chose deterministic rules over AI theater
- implemented a small vertical slice
- added focused tests
- reviewed the diff skeptically
- fixed concrete issues
- clearly stated what was and was not verified
