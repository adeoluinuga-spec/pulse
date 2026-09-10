-- STRATEGY CASCADE: strategic objective -> KRA -> OKR -> key result
--
-- Pulse could hold individual goals and KPIs but nothing above them, so there
-- was no way to say what any of it was for. An organisation that plans by
-- strategic objectives and key result areas had to flatten all of it into a
-- list of personal goals and lose the reasoning on the way in.
--
-- One table with a `kind` discriminator and a self-referencing parent, rather
-- than four tables. Two reasons: an organisation with a level Pulse did not
-- anticipate is not blocked by a missing table, and rollup is one recursive
-- query instead of four joins that have to be rewritten whenever the shape
-- changes.
--
-- NOTHING HERE IS REQUIRED. Every parent link is nullable and every goal and
-- KPI keeps working with no node above it. An organisation that just wants a
-- list of objectives never sees a key result area; one that plans four levels
-- deep gets all of them. The cascade is an option, not a gate.

create table if not exists public.strategy_nodes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  parent_id uuid references public.strategy_nodes(id) on delete cascade,

  -- 'custom' exists so a client whose planning language does not match ours is
  -- not forced into a label that misdescribes their work.
  kind text not null check (kind in ('strategic_objective','kra','objective','key_result','custom')),
  custom_kind_label text,

  title text not null,
  description text,
  /** Who is accountable for the node as a whole. */
  owner_id uuid references public.employees(id) on delete set null,

  -- The measure. Only a key result normally carries one, but nothing stops a
  -- KRA being measured directly where that is how the organisation works.
  measure text,
  measure_type text not null default 'number'
    check (measure_type in ('number','percentage','currency','ratio','milestone','boolean')),
  measure_direction text not null default 'higher' check (measure_direction in ('higher','lower')),
  baseline_value numeric,
  target_value numeric,
  current_value numeric,
  unit text,

  -- Strategies 1..n. A repeating group rather than a table because the count is
  -- open-ended and the rows are only ever read with their parent node. Each
  -- entry: { statement, expectedOutcome, responsibleId, resources, startDate, dueDate }.
  strategies jsonb not null default '[]'::jsonb,

  start_date date,
  due_date date,
  /** Relative weight among siblings. Renormalised on rollup, never enforced to 100. */
  weight integer not null default 0 check (weight >= 0 and weight <= 100),
  status text not null default 'on_track' check (status in ('on_track','at_risk','behind','completed','draft')),
  period_label text,
  sort_order integer not null default 0,

  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint strategy_nodes_strategies_is_array check (jsonb_typeof(strategies) = 'array'),
  constraint strategy_nodes_custom_label check (kind <> 'custom' or nullif(trim(custom_kind_label), '') is not null)
);

create index if not exists strategy_nodes_org_kind_idx on public.strategy_nodes(org_id, kind);
create index if not exists strategy_nodes_parent_idx on public.strategy_nodes(parent_id, sort_order);
create index if not exists strategy_nodes_owner_idx on public.strategy_nodes(owner_id);

-- Goals and KPIs hang off the cascade, or off nothing. Nullable on purpose:
-- an existing goal keeps working untouched, and the appraisal engine continues
-- to read goals and kpis by appraisal_cycle_id exactly as before.
alter table public.goals add column if not exists strategy_node_id uuid references public.strategy_nodes(id) on delete set null;
alter table public.kpis add column if not exists strategy_node_id uuid references public.strategy_nodes(id) on delete set null;

create index if not exists goals_strategy_node_idx on public.goals(strategy_node_id);
create index if not exists kpis_strategy_node_idx on public.kpis(strategy_node_id);

-- KPIs could not be authored at all, and lacked the fields needed to say what
-- "good" looks like: a baseline to improve from, how often it is read, and
-- whether it is still live.
alter table public.kpis
  add column if not exists baseline_value numeric,
  add column if not exists frequency text not null default 'monthly',
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kpis_frequency_check') then
    alter table public.kpis add constraint kpis_frequency_check
      check (frequency in ('daily','weekly','monthly','quarterly','annual'));
  end if;
end $$;

-- A node's depth is bounded so a cycle introduced by a bad parent update cannot
-- make rollup recurse forever. Checked on write rather than trusted from the UI.
create or replace function public.strategy_node_guard() returns trigger
language plpgsql set search_path = public as $$
declare
  cursor_id uuid := new.parent_id;
  depth integer := 0;
  parent_org uuid;
begin
  if new.parent_id is not null then
    select org_id into parent_org from public.strategy_nodes where id = new.parent_id;
    if parent_org is null or parent_org <> new.org_id then
      raise exception 'A strategy node cannot report into another organisation.' using errcode = '42501';
    end if;
  end if;

  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'That parent would create a loop in the strategy tree.' using errcode = '22023';
    end if;
    depth := depth + 1;
    if depth > 12 then
      raise exception 'The strategy tree cannot nest more than 12 levels deep.' using errcode = '22023';
    end if;
    select parent_id into cursor_id from public.strategy_nodes where id = cursor_id;
  end loop;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists strategy_nodes_guard on public.strategy_nodes;
create trigger strategy_nodes_guard before insert or update on public.strategy_nodes
for each row execute function public.strategy_node_guard();

-- Read is org-wide because a strategy everyone is working towards is of no use
-- hidden. Writes go through the authenticated API, which is where the
-- owner/manager/HR rules are enforced — a row policy cannot express "may edit a
-- node only while no appraisal has scored the goals beneath it".
alter table public.strategy_nodes enable row level security;

drop policy if exists "strategy_nodes_read_same_org" on public.strategy_nodes;
create policy "strategy_nodes_read_same_org" on public.strategy_nodes
  for select using (org_id = public.auth_org_id());

revoke insert, update, delete on public.strategy_nodes from anon, authenticated;
grant all on public.strategy_nodes to service_role;
