// Functional test matrix for all Evacua API routes: happy paths, error paths,
// and response-shape assertions. Run against a local production server.
const BASE = process.env.EVACUA_TEST_BASE ?? "http://localhost:3100";

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  PASS ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  FAIL ${name} ${detail}`);
  }
}

async function req(method, path, body, headers = {}) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - started;
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json, ms };
}

console.log("=== 1. fire-state ===");
{
  const r = await req("GET", "/api/fire-state");
  check("GET 200", r.status === 200);
  check("has fires[]", Array.isArray(r.json?.fires) && r.json.fires.length >= 2);
  check("has firestations[]", Array.isArray(r.json?.firestations) && r.json.firestations.length === 3);
  check("count matches", r.json?.count?.active_fires === r.json?.fires?.length);
  const fire = r.json?.fires?.[0];
  check(
    "fire shape",
    fire && typeof fire.id === "string" && typeof fire.lat === "number" &&
      Array.isArray(fire.polygon_coords) && typeof fire.containment === "number",
  );
  check("polygon closed", (() => {
    const p = fire?.polygon_coords ?? [];
    if (p.length < 4) return false;
    return p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1];
  })());
}

console.log("=== 2. demo-readiness ===");
{
  const r = await req("GET", "/api/demo-readiness");
  check("GET 200", r.status === 200);
  check("dataMode demo", r.json?.checks?.dataMode === "demo");
  check("telegram dry-run", r.json?.checks?.telegramMode === "dry-run");
  check("no secrets in response", !JSON.stringify(r.json).match(/sk-ant|Bearer|service_role/i));
}

console.log("=== 3. demo/reset ===");
{
  const r = await req("POST", "/api/demo/reset");
  check("POST 200", r.status === 200);
  check("success true", r.json?.success === true);
  check("returns fireState+responderStats+routeOps", Boolean(r.json?.fireState && r.json?.responderStats && r.json?.routeOps));
}

console.log("=== 4. dispatch-responder ===");
{
  const stats = await req("GET", "/api/dispatch-responder");
  check("GET 200", stats.status === 200);
  check("stats shape", Array.isArray(stats.json?.stats) && stats.json?.totals?.total > 0);
  const availableBefore = stats.json?.totals?.available;

  const bad1 = await req("POST", "/api/dispatch-responder", {});
  check("POST missing fields -> 400", bad1.status === 400);
  const bad2 = await req("POST", "/api/dispatch-responder", { incidentId: "x", incidentLat: "not-a-number", incidentLon: 1 });
  check("POST bad lat -> 400", bad2.status === 400);
  const badJson = await fetch(`${BASE}/api/dispatch-responder`, { method: "POST", headers: { "content-type": "application/json" }, body: "{broken" });
  check("POST broken JSON -> 400", badJson.status === 400);

  const ok = await req("POST", "/api/dispatch-responder", { incidentId: "demo-pine-ridge-fire", incidentLat: 37.2897, incidentLon: -119.5272 });
  check("POST valid -> 200 success", ok.status === 200 && ok.json?.success === true);
  check("responder assigned", typeof ok.json?.responder?.id === "string" && ok.json?.responder?.firestation_name?.length > 0);
  check("route geometry present", ok.json?.route?.geometry?.type === "LineString");

  const after = await req("GET", "/api/dispatch-responder");
  check("available count decremented", after.json?.totals?.available === availableBefore - 1, `${availableBefore} -> ${after.json?.totals?.available}`);
}

console.log("=== 5. update-routes ===");
{
  const bad = await req("POST", "/api/update-routes", { reason: "no station" });
  check("POST missing station -> 400", bad.status === 400);
  const ok = await req("POST", "/api/update-routes", {
    station_id: 1, station_name: "Madera County Station 8", fire_id: "demo-pine-ridge-fire",
    new_route: { from: [-119.6493, 37.3282], to: [-119.66, 37.34] }, reason: "functional-test route", risk_score: 2.2,
  });
  check("POST valid -> 200", ok.status === 200 && ok.json?.success === true);
  const badPut = await req("PUT", "/api/update-routes", { zone_name: "no fire id" });
  check("PUT missing fields -> 400", badPut.status === 400);
  const okPut = await req("PUT", "/api/update-routes", {
    fire_id: "demo-pine-ridge-fire", zone_name: "functional-test zone",
    polygon: [[-119.53, 37.29], [-119.52, 37.30], [-119.51, 37.29], [-119.53, 37.29]],
  });
  check("PUT valid -> 200", okPut.status === 200 && okPut.json?.success === true);
  const list = await req("GET", "/api/update-routes");
  check("GET lists created route", list.json?.routes?.some((r) => r.reason === "functional-test route"));
  check("GET lists created zone", list.json?.evacuations?.some((z) => z.zone_name === "functional-test zone"));
}

console.log("=== 6. fire-agent ===");
{
  const analyze = await req("GET", "/api/fire-agent");
  check("GET analyze 200", analyze.status === 200 && analyze.json?.status === "complete");
  check("findings present", Array.isArray(analyze.json?.findings) && analyze.json.findings.length > 0);
  const commit = await req("POST", "/api/fire-agent");
  check("POST commit 200", commit.status === 200 && commit.json?.status === "complete");
}

console.log("=== 7. signals ===");
{
  const bad = await req("POST", "/api/signals", { lat: 999, lng: 0 });
  check("invalid coords -> 400", bad.status === 400);
  const ok = await req("POST", "/api/signals", { lat: 37.2897, lng: -119.5272 });
  check("valid -> 200", ok.status === 200);
  // "leave" is reserved for evacuation orders in the scoring engine; a
  // fire_incident signal near home escalates to at least "prepare".
  check("state escalates near critical fire", ok.json?.state === "prepare" || ok.json?.state === "leave", `got ${ok.json?.state}`);
  check("events carry distanceKm", typeof ok.json?.events?.[0]?.distanceKm === "number");
  check("events sorted by impact", (() => {
    const e = ok.json?.events ?? [];
    return e.every((ev, i) => i === 0 || (e[i - 1].impact ?? 0) >= (ev.impact ?? 0));
  })());
  const far = await req("POST", "/api/signals", { lat: 44.5, lng: -73.2 });
  check("far coords -> watch", far.json?.state === "watch", `got ${far.json?.state}`);
}

console.log("=== 8. send-emergency-alert (dry-run gating) ===");
{
  const bad = await req("POST", "/api/send-emergency-alert", {});
  check("missing payload -> 400", bad.status === 400);
  const ok = await req("POST", "/api/send-emergency-alert", {
    incident: { id: "demo-pine-ridge-fire", name: "Pine Ridge Fire", risk: "critical", lat: 37.2897, lon: -119.5272, containment: 14 },
  });
  check("dry-run 200", ok.status === 200);
  check("dryRun true (nothing sent)", ok.json?.dryRun === true);
  check("composed text present", typeof ok.json?.composedText === "string" && ok.json.composedText.includes("EVACUA OPERATIONS ALERT"));
  const custom = await req("POST", "/api/send-emergency-alert", {
    incident: { id: "demo-pine-ridge-fire", name: "Pine Ridge Fire", risk: "high", lat: 37.2897, lon: -119.5272 },
    customMessage: "operator-note-xyz",
  });
  check("custom message included", custom.json?.composedText?.includes("operator-note-xyz"));
}

console.log("=== 9. weather ===");
{
  const bad = await req("GET", "/api/weather?lat=abc&lon=def");
  check("bad params -> 400", bad.status === 400);
  const ok = await req("GET", "/api/weather?lat=37.2897&lon=-119.5272");
  check("valid -> 200 or 502 (upstream)", ok.status === 200 || ok.status === 502, `got ${ok.status}`);
  if (ok.status === 200) {
    check("risk score 0-100", ok.json?.risk?.fireRiskPct >= 0 && ok.json?.risk?.fireRiskPct <= 100);
    const lng = await req("GET", "/api/weather?lat=37.2897&lng=-119.5272");
    check("lng alias works", lng.status === 200);
  }
}

console.log("=== 10. geocode ===");
{
  const short = await req("GET", "/api/geocode?q=ab");
  check("short query -> empty results", short.status === 200 && short.json?.results?.length === 0);
  const ok = await req("GET", "/api/geocode?q=Fresno");
  check("Fresno -> 200 or 502 (upstream)", ok.status === 200 || ok.status === 502, `got ${ok.status}`);
  if (ok.status === 200) check("results have lat/lng", typeof ok.json?.results?.[0]?.lat === "number");
}

console.log("=== 11. vapi-webhook (agent message queue) ===");
{
  const bad = await req("POST", "/api/vapi-webhook", { action: "scan" });
  check("missing message -> 400", bad.status === 400);
  const marker = `functional-test-${Date.now()}`;
  const ok = await req("POST", "/api/vapi-webhook", { action: "scan", message: marker });
  check("enqueue 200", ok.status === 200 && ok.json?.success === true);
  const list = await req("GET", "/api/vapi-webhook");
  check("GET returns queued message", list.json?.messages?.some((m) => m.message === marker));
  const since = await req("GET", `/api/vapi-webhook?since=${encodeURIComponent(new Date(Date.now() + 60000).toISOString())}`);
  check("since-filter excludes past messages", since.json?.messages?.length === 0);
}

console.log("=== 12. evacua-agent-runs/[runId] 404 ===");
{
  const r = await req("GET", "/api/evacua-agent-runs/nonexistent-run-id");
  check("unknown run -> 404", r.status === 404);
}

console.log("=== 13. plan redirect + pages ===");
{
  const plan = await fetch(`${BASE}/plan`, { redirect: "manual" });
  check("/plan -> 307/308", plan.status === 307 || plan.status === 308);
  check("redirect target /", (plan.headers.get("location") ?? "").endsWith("/"));
  const home = await fetch(`${BASE}/`);
  const html = await home.text();
  check("/ renders dashboard html", home.status === 200 && html.includes("Evacua"));
}

console.log("=== 14. commander validation ===");
{
  const bad = await req("POST", "/api/evacua-commander", { message: "no mode" });
  check("missing mode -> 400", bad.status === 400);
  const badIncident = await req("POST", "/api/evacua-commander", { mode: "recommend", incidentId: "does-not-exist" });
  check("unknown incident -> 404", badIncident.status === 404);
}

console.log("=== 15. voice-agent validation ===");
{
  const bad = await req("POST", "/api/voice-agent", { transcript: "wrong field" });
  check("missing utterance -> 400", bad.status === 400);
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
