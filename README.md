# Evacua

Voice-first responder command center for wildfire operations.

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
| `/api/update-routes` | Route advisories and evacuation-zone writes |
| `/api/fire-agent` | Autonomous route/evacuation scan over Supabase fire state |
| `/api/evacua-briefing` | Read-only assistant briefing synthesis |
| `/api/evacua-commander` | Internal approval-gated responder plan tool |
| `/api/evacua-agent-runs` | Durable Evacua intelligence run orchestration |
| `/api/evacua-agent-runs/:runId` | Fetch a stored intelligence run |
| `/api/send-emergency-alert` | Dry-run alert preparation by default, live dispatch only when enabled |

## Environment

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
```

`SUPABASE_SERVICE_ROLE_KEY` is optional but recommended for server-side writes.
If it is omitted, API routes use `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

If the Supabase env vars are missing, Evacua serves bundled responder demo data
with active California fire incidents, stations, responders, route advisories,
and evacuation-zone recommendations. Set `EVACUA_DEMO_MODE=true` to force that
demo data even when Supabase is configured, or `EVACUA_DEMO_MODE=false` to make
missing Supabase config fail loudly.

`NEXT_PUBLIC_MAPBOX_TOKEN` is recommended for production. The bundled public
demo token is used only when curated demo mode is active, so production builds
should provide their own Mapbox token.

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
- `responder_stats`
- `route_updates`
- `evacuation_zones`

## Running Locally

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).
