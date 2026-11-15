-- Prototype only: RLS off on every table. The app talks to Postgres through the
-- server-side DATABASE_URL and has no sign-in, so the policy in 0000_init.sql
-- (which stays defined, but inert) has no auth.uid() to check.
-- Re-enable before any real data: alter table <t> enable row level security;
alter table users disable row level security;
alter table context_areas disable row level security;
alter table requests disable row level security;
alter table people disable row level security;
alter table notes disable row level security;
alter table note_points disable row level security;
alter table findings disable row level security;
alter table finding_notes disable row level security;
alter table outcomes disable row level security;
alter table audit_log disable row level security;
alter table source_items disable row level security;
