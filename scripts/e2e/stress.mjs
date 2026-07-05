// Stress test for the Evacua local server.
// Phase 1: concurrent read load on the dashboard's polling endpoints.
// Phase 2: write burst (dispatch + route + evacuation + webhook enqueue).
// Phase 3: sustained mixed load mirroring the real dashboard poll pattern.
// Phase 4: post-load state-consistency verification.
const BASE = process.env.EVACUA_TEST_BASE ?? "http://localhost:3100";

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function stats(latencies, errors, label, totalMs) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  console.log(
    `  ${label}: n=${sorted.length} err=${errors} rps=${(sorted.length / (totalMs / 1000)).toFixed(1)} ` +
      `p50=${percentile(sorted, 50)}ms p95=${percentile(sorted, 95)}ms p99=${percentile(sorted, 99)}ms ` +
      `max=${sorted[sorted.length - 1]}ms avg=${(sum / sorted.length).toFixed(1)}ms`,
  );
  return { n: sorted.length, errors, p95: percentile(sorted, 95), p99: percentile(sorted, 99) };
}

async function timedFetch(method, path, body) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    await res.arrayBuffer();
    return { ms: Date.now() - started, ok: res.status < 500, status: res.status };
  } catch (e) {
    return { ms: Date.now() - started, ok: false, status: 0, error: String(e) };
  }
}

async function runWave(label, count, concurrency, makeRequest) {
  const latencies = [];
  let errors = 0;
  const errorStatuses = {};
  const started = Date.now();
  let issued = 0;
  async function worker() {
    while (issued < count) {
      const i = issued++;
      const r = await makeRequest(i);
      latencies.push(r.ms);
      if (!r.ok) {
        errors++;
        errorStatuses[r.status] = (errorStatuses[r.status] ?? 0) + 1;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  const totalMs = Date.now() - started;
  const s = stats(latencies, errors, label, totalMs);
  if (errors) console.log(`    error statuses: ${JSON.stringify(errorStatuses)}`);
  return { ...s, totalMs };
}

let hardFailures = 0;

console.log("=== PHASE 0: reset baseline ===");
await timedFetch("POST", "/api/demo/reset");
const baseline = await fetch(`${BASE}/api/dispatch-responder`).then((r) => r.json());
console.log(`  baseline responders: available=${baseline.totals.available} total=${baseline.totals.total}`);

console.log("\n=== PHASE 1: concurrent read load (400 req x 4 endpoints, 40 concurrent) ===");
const readEndpoints = [
  ["GET", "/api/fire-state"],
  ["GET", "/api/dispatch-responder"],
  ["GET", "/api/update-routes"],
  ["GET", "/api/vapi-webhook"],
];
for (const [method, path] of readEndpoints) {
  const r = await runWave(`${method} ${path}`, 400, 40, () => timedFetch(method, path));
  if (r.errors > 0) hardFailures++;
  if (r.p99 > 2000) {
    console.log(`    WARN p99 over 2s`);
  }
}

console.log("\n=== PHASE 2: heavier read burst on fire-agent analysis (100 req, 20 concurrent) ===");
{
  const r = await runWave("GET /api/fire-agent", 100, 20, () => timedFetch("GET", "/api/fire-agent"));
  if (r.errors > 0) hardFailures++;
}

console.log("\n=== PHASE 3: write burst ===");
{
  await timedFetch("POST", "/api/demo/reset");
  // Dispatch until pool is exhausted: demo pool has limited teams, extra
  // requests must fail cleanly with 404, never 500.
  const dispatch = await runWave("POST /api/dispatch-responder x30 (pool exhaustion)", 30, 10, () =>
    timedFetch("POST", "/api/dispatch-responder", {
      incidentId: "demo-pine-ridge-fire",
      incidentLat: 37.2897,
      incidentLon: -119.5272,
      suppressAgentMessage: true,
    }),
  );
  if (dispatch.errors > 0) hardFailures++;

  const routes = await runWave("POST /api/update-routes x100", 100, 20, (i) =>
    timedFetch("POST", "/api/update-routes", {
      station_id: (i % 3) + 1,
      fire_id: "demo-pine-ridge-fire",
      new_route: { from: [-119.6493, 37.3282], to: [-119.66 - i * 0.001, 37.34] },
      reason: `stress-route-${i}`,
      risk_score: 1 + (i % 5),
    }),
  );
  if (routes.errors > 0) hardFailures++;

  const zones = await runWave("PUT /api/update-routes x50 (evac zones)", 50, 10, (i) =>
    timedFetch("PUT", "/api/update-routes", {
      fire_id: "demo-pine-ridge-fire",
      zone_name: `stress-zone-${i}`,
      polygon: [[-119.53, 37.29], [-119.52, 37.3], [-119.51, 37.29], [-119.53, 37.29]],
    }),
  );
  if (zones.errors > 0) hardFailures++;

  const webhook = await runWave("POST /api/vapi-webhook x200 (queue overflow)", 200, 20, (i) =>
    timedFetch("POST", "/api/vapi-webhook", { action: "scan", message: `stress-msg-${i}` }),
  );
  if (webhook.errors > 0) hardFailures++;

  const alerts = await runWave("POST /api/send-emergency-alert x50 (dry-run)", 50, 10, () =>
    timedFetch("POST", "/api/send-emergency-alert", {
      incident: { id: "demo-pine-ridge-fire", name: "Pine Ridge Fire", risk: "critical", lat: 37.2897, lon: -119.5272 },
    }),
  );
  if (alerts.errors > 0) hardFailures++;

  const signals = await runWave("POST /api/signals x100", 100, 20, (i) =>
    timedFetch("POST", "/api/signals", { lat: 37.2897 + (i % 10) * 0.01, lng: -119.5272 }),
  );
  if (signals.errors > 0) hardFailures++;
}

console.log("\n=== PHASE 4: sustained mixed load (20s, dashboard poll pattern x20 simulated clients) ===");
{
  const latencies = [];
  let errors = 0;
  const started = Date.now();
  const DURATION = 20_000;
  async function client(id) {
    while (Date.now() - started < DURATION) {
      const wave = await Promise.all([
        timedFetch("GET", "/api/fire-state"),
        timedFetch("GET", "/api/dispatch-responder"),
        timedFetch("GET", "/api/update-routes"),
        timedFetch("GET", `/api/vapi-webhook?since=${encodeURIComponent(new Date(Date.now() - 5000).toISOString())}`),
      ]);
      for (const r of wave) {
        latencies.push(r.ms);
        if (!r.ok) errors++;
      }
      // a subset of clients also do voice-agent + webhook writes
      if (id < 4) {
        const va = await timedFetch("POST", "/api/voice-agent", {
          utterance: "give me a status brief on pine ridge",
          source: "dashboard",
          clientRequestId: `sustained-${id}-${Date.now()}`,
        });
        latencies.push(va.ms);
        if (!va.ok) errors++;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  await Promise.all(Array.from({ length: 20 }, (_, i) => client(i)));
  const totalMs = Date.now() - started;
  const s = stats(latencies, errors, "sustained mixed load", totalMs);
  if (s.errors > 0) hardFailures++;
}

console.log("\n=== PHASE 5: post-load state consistency ===");
{
  const reset = await fetch(`${BASE}/api/demo/reset`, { method: "POST" }).then((r) => r.json());
  const ok1 = reset.success === true;
  console.log(`  reset after load: ${ok1 ? "PASS" : "FAIL"}`);
  if (!ok1) hardFailures++;

  const stats2 = await fetch(`${BASE}/api/dispatch-responder`).then((r) => r.json());
  const ok2 = stats2.totals.available === baseline.totals.available && stats2.totals.total === baseline.totals.total;
  console.log(`  responder pool restored to baseline: ${ok2 ? "PASS" : "FAIL"} (available=${stats2.totals.available}/${baseline.totals.available})`);
  if (!ok2) hardFailures++;

  const routes = await fetch(`${BASE}/api/update-routes`).then((r) => r.json());
  const stressLeakage = routes.routes.filter((r) => r.reason?.startsWith("stress-route")).length;
  const ok3 = stressLeakage === 0;
  console.log(`  stress routes cleared by reset: ${ok3 ? "PASS" : "FAIL"} (${stressLeakage} leaked)`);
  if (!ok3) hardFailures++;

  const queue = await fetch(`${BASE}/api/vapi-webhook`).then((r) => r.json());
  const ok4 = queue.count <= 100; // MAX_MESSAGES cap
  console.log(`  agent-message queue capped at 100: ${ok4 ? "PASS" : "FAIL"} (count=${queue.count})`);
  if (!ok4) hardFailures++;

  const fs = await fetch(`${BASE}/api/fire-state`).then((r) => r.json());
  const ok5 = fs.fires.length === 2 && fs.firestations.length === 3;
  console.log(`  fire state intact: ${ok5 ? "PASS" : "FAIL"}`);
  if (!ok5) hardFailures++;
}

console.log(`\n=== STRESS RESULT: ${hardFailures === 0 ? "ALL PHASES PASSED" : `${hardFailures} phase failures`} ===`);
process.exit(hardFailures === 0 ? 0 : 1);
