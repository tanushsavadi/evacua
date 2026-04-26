/**
 * Lightweight Supabase REST client that matches the existing fire-ops pattern
 * (raw fetch against Supabase PostgREST) without requiring @supabase/supabase-js.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headers(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY!,
    authorization: `Bearer ${SUPABASE_KEY}`,
    "content-type": "application/json",
    prefer: "return=representation",
  };
}

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * SELECT rows from a Supabase table.
 * @param table - table name
 * @param params - PostgREST query parameters (select, order, etc.)
 */
export async function query<T = unknown>(
  table: string,
  params: Record<string, string> = {},
): Promise<{ data: T[] | null; error: string | null }> {
  if (!isConfigured()) {
    return { data: null, error: "Supabase not configured" };
  }

  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  try {
    const res = await fetch(url.toString(), { headers: headers(), cache: "no-store" });
    if (!res.ok) {
      const body = await res.text();
      return { data: null, error: `${res.status}: ${body}` };
    }
    const data = (await res.json()) as T[];
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Client-side fetch helper for use in React components.
 * Routes through the fire-state API to avoid exposing keys on the client.
 */
export async function fetchIncidents(): Promise<{
  data: Record<string, unknown>[] | null;
  error: string | null;
}> {
  try {
    const res = await fetch("/api/fire-state");
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}` };
    }
    const json = await res.json();
    return { data: json.fires ?? [], error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
