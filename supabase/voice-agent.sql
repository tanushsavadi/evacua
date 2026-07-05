create table if not exists public.voice_sessions (
  id text primary key,
  vapi_call_id text,
  dashboard_session_id text,
  status text not null default 'active' check (status in ('active', 'ended')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_turns (
  id text primary key,
  session_id text not null references public.voice_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  source text not null check (source in ('vapi', 'dashboard', 'test', 'system')),
  transcript text not null,
  tool_call_id text,
  transcript_turn_id text,
  client_request_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.voice_run_events (
  id text primary key,
  session_id text not null references public.voice_sessions(id) on delete cascade,
  run_id text,
  type text not null check (
    type in (
      'intent',
      'context',
      'clarification',
      'brief',
      'mission',
      'pending_action',
      'safety_block',
      'out_of_scope',
      'error'
    )
  ),
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pending_actions (
  id text primary key,
  session_id text not null references public.voice_sessions(id) on delete cascade,
  run_id text,
  incident_id text,
  incident_name text,
  action_id text,
  action_type text not null check (
    action_type in ('dispatch', 'alert', 'route', 'evacuation', 'monitor', 'brief', 'mission')
  ),
  title text not null,
  rationale text not null,
  payload jsonb,
  status text not null default 'queued_for_operator' check (
    status in ('queued_for_operator', 'approved', 'executed', 'rejected', 'expired')
  ),
  approval_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.pending_clarifications (
  id text primary key,
  session_id text not null references public.voice_sessions(id) on delete cascade,
  intent text not null,
  question text not null,
  missing_fields jsonb not null default '[]'::jsonb,
  resume_payload jsonb not null default '{}'::jsonb,
  candidate_incidents jsonb,
  status text not null default 'open' check (status in ('open', 'answered', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.voice_call_reports (
  id text primary key,
  session_id text not null references public.voice_sessions(id) on delete cascade,
  vapi_call_id text,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.voice_eval_results (
  id text primary key,
  fixture_id text,
  utterance text not null,
  expected_intent text,
  actual_intent text,
  expected_incident text,
  actual_incident text,
  score numeric,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists voice_sessions_vapi_call_id_idx on public.voice_sessions(vapi_call_id);
create index if not exists voice_turns_session_created_idx on public.voice_turns(session_id, created_at desc);
create index if not exists voice_run_events_session_created_idx on public.voice_run_events(session_id, created_at desc);
create index if not exists pending_actions_session_status_idx on public.pending_actions(session_id, status, created_at desc);
create index if not exists pending_actions_token_idx on public.pending_actions(approval_token);
create index if not exists pending_clarifications_session_status_idx on public.pending_clarifications(session_id, status, created_at desc);
create index if not exists voice_call_reports_call_idx on public.voice_call_reports(vapi_call_id);
