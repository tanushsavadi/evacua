export type AgentMessage = {
  id: string;
  action: "route_update" | "evacuation" | "dispatch" | "scan" | "alert";
  message: string;
  timestamp: string;
  data?: unknown;
};

const MAX_MESSAGES = 100;

const g = globalThis as typeof globalThis & {
  __evacuaAgentMessages?: AgentMessage[];
};

function messageStore() {
  if (!g.__evacuaAgentMessages) g.__evacuaAgentMessages = [];
  return g.__evacuaAgentMessages;
}

export function enqueueAgentMessage(input: Omit<AgentMessage, "id" | "timestamp">) {
  const store = messageStore();
  const timestamp = new Date().toISOString();
  const item: AgentMessage = {
    ...input,
    id: `${timestamp}-${store.length}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp,
  };
  store.push(item);
  if (store.length > MAX_MESSAGES) {
    g.__evacuaAgentMessages = store.slice(-MAX_MESSAGES);
  }
  return item;
}

export function listAgentMessages(since?: string | null) {
  const store = messageStore();
  if (!since) return store.slice();
  const sinceTs = Date.parse(since);
  if (!Number.isFinite(sinceTs)) return store.slice();
  return store.filter((msg) => Date.parse(msg.timestamp) > sinceTs);
}

export function resetAgentMessages() {
  g.__evacuaAgentMessages = [];
}
