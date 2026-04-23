# Evacua

**The missing planning layer between alerts and action.**

Evacua is an agentic household evacuation copilot for California wildfires. It
ingests live public crisis signals (weather, wildfire perimeters, road
closures) and turns them into a **household-specific** action plan — a
leave-by time, a primary and backup route, a destination, and a role-based
checklist. When conditions change, the plan regenerates itself and explains,
in one sentence, what changed and why.

## Why this exists

Families already receive alerts. They still have to do the planning
themselves — under stress, with kids, pets, meds, mobility needs, and a
limited number of vehicles. Evacua is that planning layer.

## Stack

- **Next.js 16** App Router · React 19 · TypeScript
- **Tailwind v4** + a premium OLED-black design system
- **Framer Motion** for deliberate, calm-to-crisis motion
- **MapLibre GL** with OpenFreeMap tiles (no token)
- **Claude Opus 4.7** for the Plan Agent and Diff Narrator (with a
  deterministic fallback so the product works without an API key)
- **Zustand + idb-keyval** for local-first household persistence

## Data sources

All free, public, no-token:

- **NWS Alerts** — `api.weather.gov` (Red Flag, fire weather, evacuation)
- **NIFC WFIGS** — current interagency fire perimeters
- **CAL FIRE** — incident metadata
- **Caltrans LCS** — road/lane closures
- **OSRM** — public routing (with Valhalla fallback)
- **Nominatim** — geocoding
- **OpenFreeMap** — basemap tiles (restyled dark-cinematic)

Live signals run alongside a bundled Scenario Engine so the demo works
regardless of current real-world conditions.

## Running locally

```bash
pnpm install
cp .env.example .env.local   # optional — add ANTHROPIC_API_KEY for Opus
pnpm dev
```

Open http://localhost:3000.

## Status

This is an in-progress MVP being built in atomic, phased commits. See
[`agents.md`](./agents.md) for the architecture overview.

## License

MIT — see [`LICENSE`](./LICENSE).
