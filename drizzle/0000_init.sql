create extension if not exists vector;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text not null,
  role text not null check (role in ('growth','brand','product','cx','ceo','ops')),
  created_at timestamptz default now()
);

create table requests (
  id text primary key,
  question text not null,
  reason text,
  belief text,
  area text,
  owner_id uuid references users(id),
  status text default 'draft' check (status in ('draft','open','closed','reused')),
  current_step text default 'question' check (current_step in ('question','people','talk','capture','decide')),
  context_areas jsonb default '[]',
  rating int,
  first_days int,
  created_at timestamptz default now(),
  closed_at timestamptz
);

create table people (
  id text primary key,
  request_id text references requests(id) on delete cascade,
  customer_number text,
  channel text,
  segment text,
  product text,
  first_order_days_ago int,
  status text default 'considered'
    check (status in ('considered','shortlisted','invited','scheduled','done','declined')),
  decline_reason text,
  consent_recorded boolean default false,
  scheduled_at timestamptz,
  completed_at timestamptz
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  person_id text references people(id) on delete cascade,
  request_id text references requests(id) on delete cascade,
  interviewer text,
  question_asked text,
  created_at timestamptz default now()
);

create table note_points (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references notes(id) on delete cascade,
  content text not null,
  kind text not null check (kind in ('words','interpretation')),
  position int default 0,
  ai_drafted boolean default false,
  approved boolean default false
);

create table findings (
  id uuid primary key default gen_random_uuid(),
  request_id text references requests(id) on delete set null,
  text text not null,
  source text,
  source_kind text default 'request'
    check (source_kind in ('request','import','study','support','unknown')),
  limits text,
  tags text[] default '{}',
  embedding vector(768),
  created_at timestamptz default now()
);

create index findings_embedding_idx on findings
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table finding_notes (
  finding_id uuid references findings(id) on delete cascade,
  note_id uuid references notes(id) on delete cascade,
  primary key (finding_id, note_id)
);

create table outcomes (
  id uuid primary key default gen_random_uuid(),
  request_id text references requests(id) on delete cascade,
  kind text not null check (kind in ('decision','experiment','follow_up','more_evidence')),
  description text not null,
  owner_name text not null,
  review_date date not null,
  reviewed boolean default false,
  posted_to_slack boolean default false,
  linear_ticket_url text,
  created_at timestamptz default now()
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  target text,
  metadata jsonb,
  created_at timestamptz default now()
);

create table context_areas (
  id uuid primary key default gen_random_uuid(),
  workspace_scope boolean default true,
  group_name text not null,
  value text not null,
  user_id uuid references users(id)
);

create table source_items (
  id uuid primary key default gen_random_uuid(),
  source_kind text,
  payload jsonb,
  embedding vector(768),
  created_at timestamptz default now()
);
create index source_items_embedding_idx on source_items
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table requests enable row level security;
create policy "owners see own requests" on requests for all using (
  auth.uid() = owner_id or
  (select role from users where id = auth.uid()) in ('ceo','ops')
);
