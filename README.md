# Evacua

Voice-first responder command center for wildfire operations.

Built for Anthropic's **Built with Opus 4.7: a Claude Code hackathon** — a
selective event limited to 500 participants. Claude Opus 4.7 powers the
in-product incident planner (briefings, agentic tool loops, role synthesis,
and voice intent fallback), and the project itself was engineered with Claude
Code using a verification-driven workflow: every change gated through
typecheck, lint, unit tests, and the end-to-end suites under `scripts/e2e/`.

Evacua uses a responder-focused backend model: Supabase stores active
incidents, fire stations, responders, route advisories, and evacuation zones.
The Next.js API routes expose that data to a responder-only command surface for
incident monitoring, dispatch, route updates, environmental context, voice ops,
internal AI incident planning, approval-gated alerts, and deterministic judge
demo runs.

The responder map uses Mapbox GL with dark terrain styling, 3D building
extrusions, animated fire perimeters, evacuation buffers, staging routes, and
route-advisory overlays.

## Routes

| Route | Purpose |
| ----- | ------- |
| `/` | Canonical live responder dashboard and judge-demo surface |
| `/plan` | Deprecated redirect to `/` |
| `/api/demo/reset` | Reset the curated Pine Ridge demo scenario |
| `/api/demo-readiness` | Non-secret readiness checks for demo keys and modes |
| `/api/fire-state` | Active fires and fire stations from Supabase |
| `/api/dispatch-responder` | Responder stats and nearest-team dispatch |
| `/api/update-routes` | Route advisories (GET/POST) and evacuation-zone writes (PUT) |
| `/api/fire-agent` | Route/evacuation scan: GET analyzes, POST commits recommendations |
| `/api/evacua-briefing` | Read-only assistant briefing synthesis |
| `/api/evacua-commander` | Internal approval-gated responder plan tool |
| `/api/opus-commander` | Underlying planner behind `/api/evacua-commander` |
| `/api/evacua-agent-runs` | Evacua intelligence run orchestration (in-memory store) |
| `/api/evacua-agent-runs/:runId` | Fetch a stored intelligence run |
| `/api/send-emergency-alert` | Dry-run alert preparation by default, live dispatch only when enabled |
| `/api/assistant-suggestions` | Context-aware assistant suggestion chips |
| `/api/voice-agent` | Typed/voice operator command handler (approval-gated) |
| `/api/vapi/events` | Vapi webhook target for tool calls and transcripts |
| `/api/vapi-webhook` | Agent-message queue polled by the dashboard feed |
| `/api/signals` | Impact-scored crisis events for a coordinate |
| `/api/weather` | Open-Meteo weather + air quality + fire-risk score |
| `/api/geocode` | Nominatim geocoding (California-biased) |

## Environment

See `.env.example` for the full annotated list. The core keys:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
EVACUA_DEMO_MODE=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
EVACUA_ALERT_MODE=
SMS_WEBHOOK_URL=
EMAIL_WEBHOOK_URL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-4-7
NEXT_PUBLIC_VAPI_PUBLIC_KEY=
NEXT_PUBLIC_VAPI_ASSISTANT_ID=
EVACUA_VAPI_WEBHOOK_TOKEN=
EVACUA_REQUIRE_APPROVAL_TOKEN=
```

`SUPABASE_SERVICE_ROLE_KEY` is optional but recommended for server-side writes.
If it is omitted, API routes use `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

If the Supabase env vars are missing, Evacua serves bundled responder demo data
with active California fire incidents, stations, responders, route advisories,
and evacuation-zone recommendations. Set `EVACUA_DEMO_MODE=true` to force that
demo data even when Supabase is configured, or `EVACUA_DEMO_MODE=false` to make
missing Supabase config fail loudly.

`NEXT_PUBLIC_MAPBOX_TOKEN` is recommended for production. The app does not ship
a bundled Mapbox token, so local demos need a token in the environment for the
3D responder map to render.

Alerts are dry-run by default. Even when Telegram or webhook keys exist,
`/api/send-emergency-alert` prepares the alert draft without sending it unless
`EVACUA_ALERT_MODE=live`.

`ANTHROPIC_API_KEY` enables the hidden Evacua planning, briefing, role handoff,
and safety-review workflows. If it is omitted, the routes still return
deterministic, approval-gated demo plans using the same structured response
shape. `ANTHROPIC_MODEL` defaults to `claude-opus-4-7`, but the model identity
is not surfaced in the operator UI.

`NEXT_PUBLIC_VAPI_PUBLIC_KEY` and `NEXT_PUBLIC_VAPI_ASSISTANT_ID` wire the
browser voice session to a Vapi assistant. Vapi handles speech transport and
transcripts; final operator transcripts are routed back into Evacua's internal
planning/briefing APIs so the same approval-gated workflow is used for voice and
typed commands.

## Internal AI Orchestration

The dashboard includes an Evacua conversational assistant that turns operator
voice or typed requests into either a concise operations brief or an auditable
incident action plan. The backend reads fire state, responder availability,
route advisories, evacuation zones, and the existing alert payload schema, then
returns:

- risk posture: `watch`, `prepare`, or `leave`
- next dispatch, alert, route, evacuation, and monitor actions
- an alert draft generated from `AlertPayload`
- a durable run trace with explicit safety-gate steps
- role handoffs for incident, logistics, communications, and safety review
- an ICS-201-style markdown brief for export

The assistant briefing route runs a read-only tool loop over fire, responder,
route, zone, and alert context before synthesizing a spoken ops brief. The
agent-run route mirrors a managed-agent-style pattern internally: it creates a
run log, calls briefing and planning tools, merges role findings, safety-reviews
actions, and returns a before/after digital twin replay for the dashboard.

Dispatches and public alerts are never executed by planning routes. The UI
exposes contextual approval buttons only after Evacua produces an actionable
plan, and those buttons call the existing dispatch and alert APIs.

## Judge Demo

The `Judge demo` control on `/` runs a deterministic walkthrough:

1. Reset curated demo state.
2. Select Pine Ridge Fire.
3. Generate a concise incident brief.
4. Start an Evacua intelligence run.
5. Render plan cards, trace timeline, map overlays, alert draft, safety review,
   digital twin replay, and approval-gated CTAs.

## Supabase Tables

The backend expects these Supabase tables/views:

- `incidents`
- `firestations`
- `responders`
- `responder_stats` (view)
- `route_updates`
- `evacuation_zones`

Provision them by running `supabase/fire-ops.sql` in the Supabase SQL editor
(it also seeds the Pine Ridge demo scenario). The voice-agent persistence
tables live in `supabase/voice-agent.sql`. Neither is required for demo mode.

## Running Locally

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Testing

```bash
pnpm test           # unit tests (vitest)
pnpm typecheck
pnpm lint
```

End-to-end suites run against a local server (default `http://localhost:3100`,
override with `EVACUA_TEST_BASE`):

```bash
pnpm build && pnpm start -p 3100 &
pnpm e2e:functional  # every route: happy paths, error paths, response shapes
pnpm e2e:ai          # judge demo, voice intents, clarification, idempotency, approval gating
pnpm e2e:stress      # concurrent load with latency percentiles + state-consistency checks
pnpm e2e:a11y        # axe-core scan, skip link, live regions (needs Playwright chromium)
```
