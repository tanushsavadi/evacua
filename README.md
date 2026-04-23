# Evacua

**The missing planning layer between alerts and action.**

Evacua is an agentic household evacuation copilot for California wildfires.
It watches live public crisis signals, composes a household-specific plan
(leave-by time, primary and backup route, destination, role-based
checklist), and **re-plans itself** when conditions change — narrating
what moved and why.

---

## The problem

Families already receive alerts. What they don't have is a planner. In a
real evacuation, they have to decide — under stress, with kids, pets,
medications, mobility needs, and a limited number of vehicles — who does
what, in what order, and where you all end up. Evacua is that missing
layer.

## The closed loop

```
public signals  →  impact scoring  →  Plan Agent  →  diff vs. last plan
     ^                                                          │
     └──────────────  Ember Field drawer + toast  ──────────────┘
```

Every poll (4s in scenario mode, 90s live) we re-derive the crisis state
using hysteresis-aware logic. When the Plan Agent composes a meaningfully
different plan, a client-side **Diff Narrator** drops an _Ember Field_
card into the Plan panel with a one-line headline, a short narrative,
and the trigger events.

## Surfaces

| Route | Purpose |
| ----- | ------- |
| `/` | Cinematic landing page with hero, how-it-works, and scripted scenario picker |
| `/setup` | Address-first household wizard (dwelling, people, pets, meds, logistics) |
| `/plan` | Mission control: 3-panel command center (household, dark MapLibre map, plan) |
| `/plan?demo=<id>` | Same command center, but running a scripted scenario end-to-end |
| `/go` | Mobile action card — huge leave-by, next task, voice briefing |

## AI surface

Two thin agents, each with a deterministic fallback:

- **Plan Agent** — composes a baseline plan deterministically (leave-by,
  destination, OSRM routes, state-aware tasks), then optionally asks
  **Claude Opus 4.7** to rewrite the headline, reasoning, and task list
  with a terse, directive tone. If the Anthropic call fails or the
  rewrite doesn't parse, we silently keep the deterministic plan and mark
  `author: "fallback"`.
- **Diff Narrator** — runs on the client. Given `prevPlan`, `nextPlan`,
  and the most recent events, it emits a structured `PlanDiff` with a
  headline, narrative, severity, and trigger events. Returns `null` for
  cosmetic churn so the Ember Field doesn't pop every poll.

Evacua never invents road names. The plan's route descriptions come from
OSRM's leg steps; AI narration is constrained to what those routes
actually say.

## Tech stack

- **Next.js 16** App Router · **React 19** · **TypeScript**
- **Tailwind v4** + a custom OLED-black design system (tokens live in
  `src/app/globals.css`)
- **Framer Motion** for calm-to-crisis motion with shared easings
- **MapLibre GL** on OpenFreeMap Positron tiles with runtime dark
  overrides (`src/lib/map/style.ts`) — no token, no vendor lock-in
- **Zod** for every boundary (household, crisis event, plan, plan diff)
- **Zustand + idb-keyval** for local-first household persistence
- **Anthropic Claude Opus 4.7** via `@anthropic-ai/sdk`, optional
- **Web Speech API** for the `/go` voice briefing

## Data sources

All free, public, no-token, no-auth:

| Source | What it gives us |
| ------ | ---------------- |
| [NWS `api.weather.gov`](https://api.weather.gov) | Red Flag, fire weather, evacuation alerts |
| [NIFC WFIGS](https://data-nifc.opendata.arcgis.com/) | Current interagency fire perimeters |
| [OSRM public demo](https://router.project-osrm.org) | Driving routes + alternatives |
| [Nominatim](https://nominatim.openstreetmap.org) | Address geocoding (proxied server-side) |
| [OpenFreeMap](https://openfreemap.org) | Basemap tiles |

A bundled **Scenario Engine** runs alongside live signals so the
re-plan-in-real-time demo always works regardless of current real-world
conditions.

## Running locally

```bash
pnpm install
cp .env.example .env.local   # optional — add ANTHROPIC_API_KEY for Opus
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Jump straight to
[/plan?demo=coastal-palisades](http://localhost:3000/plan?demo=coastal-palisades)
to see the re-plan loop without any setup.

### Env

| Variable | Purpose |
| -------- | ------- |
| `ANTHROPIC_API_KEY` | Optional. Enables Opus 4.7 narration on the Plan Agent. Everything still works without it — the product just relies on the deterministic planner. |
| `ANTHROPIC_MODEL` | Optional override, defaults to `claude-opus-4-7` |
| `NOMINATIM_UA` | Optional user-agent string for polite Nominatim usage |

### Scripts

```bash
pnpm dev       # turbopack dev server
pnpm build     # type-check + production build
pnpm lint      # eslint
```

## Project map

```
src/
  app/
    page.tsx           # landing
    setup/page.tsx     # household wizard
    plan/page.tsx      # command center
    go/page.tsx        # mobile action card
    api/
      geocode/         # Nominatim proxy
      signals/         # live + scenario signals
      plan/            # Plan Agent endpoint
  components/
    landing/           # hero, scenario picker, trust strip
    setup/             # wizard + steps + field primitives
    command-center/    # 3-panel shell, map, plan, signals rail, ember field
    mobile/            # (currently in-route at app/go/)
  lib/
    schemas/           # zod: household, crisis, plan, plan-diff
    adapters/          # nws, nifc → crisis event
    scenarios/         # scripted timelines
    scoring/           # impact + state derivation
    agents/            # plan-agent, diff-narrator
    router/            # osrm client
    hooks/             # use-signals, use-plan
    map/               # dark-style overrides
    voice/             # web speech api wrapper
    store/             # zustand + idb-keyval household store
    utils.ts           # cn, formatCountdown, haversineKm
```

See [`agents.md`](./agents.md) for a deeper architecture note.

## License

MIT — see [`LICENSE`](./LICENSE).

---

Built in focused, phased commits. None of the vendored assets, tiles,
or APIs require a paid account.
