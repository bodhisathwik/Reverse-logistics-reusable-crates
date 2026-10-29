
create type public.app_role as enum ('deliveryAgent','customerDepot');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role public.app_role not null,
  depot_id text,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.user_depot(_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select depot_id from public.user_roles where user_id = _user_id and role = 'customerDepot' limit 1
$$;

-- ===== Platform: registry, gateway log, event bus =====
create table public.service_registry (
  name text primary key,
  instance_id text not null,
  url text not null,
  status text not null default 'UP' check (status in ('UP','DOWN')),
  last_heartbeat timestamptz not null default now()
);
create table public.gateway_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  method text not null,
  path text not null,
  role text,
  user_email text,
  target_service text,
  decision text not null check (decision in ('ALLOW','DENY')),
  status_code int not null,
  reason text,
  latency_ms int
);
create index gateway_log_created_idx on public.gateway_log(created_at desc);
create table public.event_bus (
  "offset" bigserial primary key,
  topic text not null default 'soa.s06.t06.events',
  key text not null,
  event_type text not null,
  payload jsonb not null,
  producer text not null,
  consumer text,
  status text not null default 'PUBLISHED' check (status in ('PUBLISHED','CONSUMED','FAILED')),
  error text,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index event_bus_status_idx on public.event_bus(status);
create index event_bus_key_idx on public.event_bus(key);
create index event_bus_created_idx on public.event_bus(created_at desc);

-- ===== CrateAsset service =====
create table public.crate_asset_types (code text primary key, label text not null, capacity_l int not null check (capacity_l > 0));
create table public.crate_asset_crates (
  id text primary key,
  crate_type text not null references public.crate_asset_types(code),
  condition text not null default 'GOOD' check (condition in ('GOOD','WORN','BROKEN')),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','ISSUED','DAMAGED')),
  holder_ref text,
  updated_at timestamptz not null default now()
);
create index crate_asset_crates_status_idx on public.crate_asset_crates(status, crate_type);
create index crate_asset_crates_holder_idx on public.crate_asset_crates(holder_ref);

-- ===== Custody service =====
create table public.custody_depots (id text primary key, name text not null, city text not null);
create table public.custody_agents (id text primary key, name text not null);
create table public.custody_records (
  custody_id text primary key,
  depot_id text not null references public.custody_depots(id),
  delivery_agent text not null references public.custody_agents(id),
  crate_type text not null,
  issued_qty int not null check (issued_qty > 0),
  returned_qty int not null default 0 check (returned_qty >= 0),
  status text not null default 'ISSUED' check (status in ('ISSUED','PARTIALLY_RETURNED','CLOSED')),
  issue_date date not null default current_date,
  due_date date not null,
  created_at timestamptz not null default now(),
  constraint returned_lte_issued check (returned_qty <= issued_qty)
);
create index custody_records_depot_idx on public.custody_records(depot_id);
create index custody_records_status_idx on public.custody_records(status);
create index custody_records_created_idx on public.custody_records(created_at desc);
create table public.custody_return_scans (
  id bigserial primary key,
  custody_id text not null references public.custody_records(custody_id) on delete cascade,
  qty int not null check (qty > 0),
  crate_ids text[] not null default '{}',
  scanned_by text not null,
  created_at timestamptz not null default now()
);
create index custody_return_scans_custody_idx on public.custody_return_scans(custody_id);

-- ===== ReturnBalance service =====
create table public.balance_custody (
  custody_id text primary key,
  depot_id text not null,
  crate_type text not null,
  issued int not null check (issued >= 0),
  returned int not null check (returned >= 0),
  outstanding int not null check (outstanding >= 0),
  due_date date not null,
  status text not null,
  last_event_offset bigint,
  updated_at timestamptz not null default now(),
  constraint bal_returned_lte check (returned <= issued)
);
create index balance_custody_depot_idx on public.balance_custody(depot_id);
create index balance_custody_status_idx on public.balance_custody(status);
create table public.balance_depot (
  depot_id text primary key,
  depot_name text not null,
  issued int not null default 0 check (issued >= 0),
  returned int not null default 0 check (returned >= 0),
  outstanding int not null default 0 check (outstanding >= 0),
  updated_at timestamptz not null default now()
);
create table public.balance_ledger (
  id bigserial primary key,
  event_offset bigint not null,
  event_type text not null,
  custody_id text not null,
  depot_id text not null,
  delta_issued int not null default 0,
  delta_returned int not null default 0,
  outstanding_after int not null check (outstanding_after >= 0),
  created_at timestamptz not null default now()
);
create index balance_ledger_custody_idx on public.balance_ledger(custody_id);
create index balance_ledger_depot_idx on public.balance_ledger(depot_id);
create index balance_ledger_created_idx on public.balance_ledger(created_at desc);

-- ===== Grants =====
grant select on public.service_registry, public.gateway_log, public.event_bus,
  public.crate_asset_types, public.crate_asset_crates, public.custody_depots, public.custody_agents,
  public.custody_records, public.custody_return_scans, public.balance_custody, public.balance_depot, public.balance_ledger
  to authenticated;
grant all on public.service_registry, public.gateway_log, public.event_bus,
  public.crate_asset_types, public.crate_asset_crates, public.custody_depots, public.custody_agents,
  public.custody_records, public.custody_return_scans, public.balance_custody, public.balance_depot, public.balance_ledger
  to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ===== RLS =====
alter table public.service_registry enable row level security;
alter table public.gateway_log enable row level security;
alter table public.event_bus enable row level security;
alter table public.crate_asset_types enable row level security;
alter table public.crate_asset_crates enable row level security;
alter table public.custody_depots enable row level security;
alter table public.custody_agents enable row level security;
alter table public.custody_records enable row level security;
alter table public.custody_return_scans enable row level security;
alter table public.balance_custody enable row level security;
alter table public.balance_depot enable row level security;
alter table public.balance_ledger enable row level security;

create policy "signed in read registry" on public.service_registry for select to authenticated using (true);
create policy "signed in read crate types" on public.crate_asset_types for select to authenticated using (true);
create policy "signed in read depots" on public.custody_depots for select to authenticated using (true);
create policy "signed in read agents" on public.custody_agents for select to authenticated using (true);
create policy "agent read gateway log" on public.gateway_log for select to authenticated using (public.has_role(auth.uid(),'deliveryAgent'));
create policy "agent read events" on public.event_bus for select to authenticated using (public.has_role(auth.uid(),'deliveryAgent'));
create policy "agent read crates" on public.crate_asset_crates for select to authenticated using (public.has_role(auth.uid(),'deliveryAgent'));
create policy "custody read" on public.custody_records for select to authenticated
  using (public.has_role(auth.uid(),'deliveryAgent') or depot_id = public.user_depot(auth.uid()));
create policy "scans read" on public.custody_return_scans for select to authenticated
  using (public.has_role(auth.uid(),'deliveryAgent') or exists (select 1 from public.custody_records r where r.custody_id = custody_return_scans.custody_id and r.depot_id = public.user_depot(auth.uid())));
create policy "bal custody read" on public.balance_custody for select to authenticated
  using (public.has_role(auth.uid(),'deliveryAgent') or depot_id = public.user_depot(auth.uid()));
create policy "bal depot read" on public.balance_depot for select to authenticated
  using (public.has_role(auth.uid(),'deliveryAgent') or depot_id = public.user_depot(auth.uid()));
create policy "ledger read" on public.balance_ledger for select to authenticated
  using (public.has_role(auth.uid(),'deliveryAgent') or depot_id = public.user_depot(auth.uid()));

alter publication supabase_realtime add table public.event_bus;
alter publication supabase_realtime add table public.gateway_log;
alter publication supabase_realtime add table public.balance_depot;
alter publication supabase_realtime add table public.service_registry;
alter publication supabase_realtime add table public.custody_records;

-- ===== Static reference data =====
insert into public.service_registry(name, instance_id, url) values
  ('crate-asset-service','crate-asset-7f3a','http://crate-asset:8081'),
  ('custody-service','custody-2b91','http://custody:8082'),
  ('return-balance-service','return-balance-c44e','http://return-balance:8083');
insert into public.crate_asset_types values ('BLUE40','Blue 40L',40),('GREEN25','Green 25L',25);
insert into public.custody_depots values
  ('DEP-001','FreshMart Central','Pune'),('DEP-002','Harbor Grocers','Mumbai'),('DEP-003','Hilltop Wholesale','Nashik');
insert into public.custody_agents values ('AGT-01','Ravi Kumar'),('AGT-02','Lena Ortiz');

-- ===== Seed routine (service role only) =====
create or replace function public.seed_demo_custody(_id text, _depot text, _agent text, _type text, _issued int, _returned int, _issue date, _due date)
returns void language plpgsql security definer set search_path = public as $$
declare _off bigint; _status text; _dname text;
begin
  _status := case when _returned = 0 then 'ISSUED' when _returned < _issued then 'PARTIALLY_RETURNED' else 'CLOSED' end;
  insert into custody_records(custody_id, depot_id, delivery_agent, crate_type, issued_qty, returned_qty, status, issue_date, due_date, created_at)
    values (_id, _depot, _agent, _type, _issued, _returned, _status, _issue, _due, _issue::timestamptz + interval '9 hours');
  update crate_asset_crates set status='ISSUED', holder_ref=_id, updated_at=now()
    where id in (select id from crate_asset_crates where crate_type=_type and status='AVAILABLE' order by id limit (_issued - _returned));
  insert into event_bus(key, event_type, payload, producer, consumer, status, created_at, consumed_at)
    values (_id, 'CustodyIssued', jsonb_build_object('eventId', gen_random_uuid(), 'eventType','CustodyIssued','occurredAt', _issue::timestamptz, 'custodyId', _id, 'depotId', _depot, 'crateType', _type, 'issuedQty', _issued, 'dueDate', _due, 'schemaVersion', 1),
      'custody-service', 'return-balance-service', 'CONSUMED', _issue::timestamptz, _issue::timestamptz)
    returning "offset" into _off;
  insert into balance_ledger(event_offset, event_type, custody_id, depot_id, delta_issued, outstanding_after) values (_off,'CustodyIssued',_id,_depot,_issued,_issued);
  if _returned > 0 then
    insert into custody_return_scans(custody_id, qty, scanned_by, created_at) values (_id, _returned, _agent, _issue::timestamptz + interval '1 day');
    insert into event_bus(key, event_type, payload, producer, consumer, status, created_at, consumed_at)
      values (_id, 'CrateReturned', jsonb_build_object('eventId', gen_random_uuid(), 'eventType','CrateReturned','occurredAt', _issue::timestamptz + interval '1 day', 'custodyId', _id, 'depotId', _depot, 'crateType', _type, 'issuedQty', _issued, 'returnedQty', _returned, 'outstandingQty', _issued - _returned, 'scannedBy', _agent, 'schemaVersion', 1),
        'custody-service', 'return-balance-service', 'CONSUMED', _issue::timestamptz + interval '1 day', _issue::timestamptz + interval '1 day')
      returning "offset" into _off;
    insert into balance_ledger(event_offset, event_type, custody_id, depot_id, delta_returned, outstanding_after) values (_off,'CrateReturned',_id,_depot,_returned,_issued-_returned);
  end if;
  insert into balance_custody(custody_id, depot_id, crate_type, issued, returned, outstanding, due_date, status, last_event_offset)
    values (_id, _depot, _type, _issued, _returned, _issued - _returned, _due, _status, _off);
end $$;

create or replace function public.balance_recompute_depots()
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into balance_depot(depot_id, depot_name, issued, returned, outstanding, updated_at)
  select d.id, d.name, coalesce(sum(b.issued),0), coalesce(sum(b.returned),0), coalesce(sum(b.outstanding),0), now()
  from custody_depots d left join balance_custody b on b.depot_id = d.id group by d.id, d.name
  on conflict (depot_id) do update set issued=excluded.issued, returned=excluded.returned, outstanding=excluded.outstanding, updated_at=now();
end $$;

create or replace function public.seed_demo()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from balance_ledger; delete from balance_custody; delete from balance_depot;
  delete from custody_return_scans; delete from custody_records;
  delete from event_bus; delete from crate_asset_crates;
  insert into crate_asset_crates(id, crate_type, condition)
    select 'B40-' || lpad(g::text,4,'0'), 'BLUE40', case when g % 23 = 0 then 'WORN' else 'GOOD' end from generate_series(1,300) g;
  insert into crate_asset_crates(id, crate_type, condition)
    select 'G25-' || lpad(g::text,4,'0'), 'GREEN25', case when g % 19 = 0 then 'WORN' else 'GOOD' end from generate_series(1,300) g;
  update crate_asset_crates set status='DAMAGED', condition='BROKEN' where id in ('B40-0299','B40-0300','G25-0300');
  perform seed_demo_custody('CUS-1001','DEP-001','AGT-01','BLUE40',60,60,current_date-20,current_date-10);
  perform seed_demo_custody('CUS-1002','DEP-001','AGT-01','GREEN25',40,31,current_date-14,current_date-4);
  perform seed_demo_custody('CUS-1003','DEP-002','AGT-02','BLUE40',80,50,current_date-6,current_date+4);
  perform seed_demo_custody('CUS-1004','DEP-002','AGT-02','GREEN25',30,0,current_date-12,current_date-2);
  perform seed_demo_custody('CUS-1005','DEP-003','AGT-01','BLUE40',45,0,current_date-2,current_date+8);
  perform seed_demo_custody('CUS-1006','DEP-003','AGT-02','GREEN25',25,25,current_date-9,current_date-1);
  perform balance_recompute_depots();
end $$;

revoke execute on function public.seed_demo() from public, anon, authenticated;
revoke execute on function public.seed_demo_custody(text,text,text,text,int,int,date,date) from public, anon, authenticated;
revoke execute on function public.balance_recompute_depots() from public, anon, authenticated;
grant execute on function public.seed_demo() to service_role;
grant execute on function public.seed_demo_custody(text,text,text,text,int,int,date,date) to service_role;
grant execute on function public.balance_recompute_depots() to service_role;

select public.seed_demo();
