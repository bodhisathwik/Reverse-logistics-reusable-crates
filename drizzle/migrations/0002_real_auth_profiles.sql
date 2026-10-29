create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create table public.agent_access_codes (
  code text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant all on public.agent_access_codes to service_role;
alter table public.agent_access_codes enable row level security;
insert into public.agent_access_codes (code) values ('AGENT-2026');

create or replace function public.list_depots()
returns table (id text, name text, city text) language sql stable security definer set search_path = public as $$
  select id, name, city from public.custody_depots order by id
$$;
grant execute on function public.list_depots() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _depot text;
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (new.id,
    left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)), 100),
    new.email,
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'))
  on conflict (id) do nothing;
  -- demo accounts are provisioned server-side with explicit roles
  if new.raw_app_meta_data->>'role' is null then
    select id into _depot from public.custody_depots where id = new.raw_user_meta_data->>'depot_id';
    insert into public.user_roles (user_id, role, depot_id) values (new.id, 'customerDepot', _depot)
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name, email)
select u.id, coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email,'@',1)), u.email from auth.users u
on conflict (id) do nothing;