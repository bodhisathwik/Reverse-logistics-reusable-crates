create or replace function public.seed_demo()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from balance_ledger where id is not null; delete from balance_custody where custody_id is not null; delete from balance_depot where depot_id is not null;
  delete from custody_return_scans where id is not null; delete from custody_records where custody_id is not null;
  delete from event_bus where "offset" is not null; delete from crate_asset_crates where id is not null;
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
grant execute on function public.seed_demo() to service_role;