-- Schema reference for the applied kultiapp_v13_catalogs_pricing_production migration.
-- Prerequisite: V1.2 schema. Do not re-run against the already migrated project.
alter table public.products add column sale_price numeric check (sale_price>=0);
alter table public.print_jobs add column printer_name text, add column power_kw numeric check(power_kw>=0 and power_kw<=100);
create table public.workspace_resources(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 kind text not null check(kind in ('filament','printer')), name text not null check(length(trim(name)) between 1 and 160),
 material text not null default '',color text not null default '#303030' check(color ~ '^#[0-9A-Fa-f]{6}$'),
 price_per_kg numeric not null default 0 check(price_per_kg>=0),
 power_kw numeric not null default 0 check(power_kw>=0 and power_kw<=100), active boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.workspace_resources enable row level security;
revoke all on public.workspace_resources from anon,authenticated;
grant select,insert,update on public.workspace_resources to authenticated;
create policy resources_read on public.workspace_resources for select to authenticated using(private.is_workspace_member(workspace_id));
create policy resources_insert on public.workspace_resources for insert to authenticated with check(private.can_edit_workspace(workspace_id));
create policy resources_update on public.workspace_resources for update to authenticated using(private.can_edit_workspace(workspace_id)) with check(private.can_edit_workspace(workspace_id));
create index resources_workspace on public.workspace_resources(workspace_id);
create table public.production_orders(
 id uuid primary key default gen_random_uuid(),order_no bigint generated always as identity unique,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 product_id uuid references public.products(id) on delete set null,
 title text not null check(length(trim(title))>0),customer_name text not null default '',
 quantity integer not null check(quantity>=1),unit_price numeric not null check(unit_price>=0),
 iva_enabled boolean not null default true,iva_rate numeric not null default .19 check(iva_rate between 0 and 1),
 estimated_cost numeric not null check(estimated_cost>=0),estimated_grams numeric not null default 0 check(estimated_grams>=0),
 estimated_minutes numeric not null default 0 check(estimated_minutes>=0),
 actual_cost numeric check(actual_cost>=0),actual_grams numeric check(actual_grams>=0),actual_minutes numeric check(actual_minutes>=0),
 failures_cost numeric not null default 0 check(failures_cost>=0),
 status text not null default 'pending' check(status in ('pending','printing','assembly','ready','delivered','canceled')),
 due_date date,notes text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.production_orders enable row level security;
revoke all on public.production_orders from anon,authenticated;
grant select,insert,update on public.production_orders to authenticated;
grant usage on sequence public.production_orders_order_no_seq to authenticated;
create policy orders_read on public.production_orders for select to authenticated using(private.is_workspace_member(workspace_id));
create policy orders_insert on public.production_orders for insert to authenticated with check(private.can_edit_workspace(workspace_id) and (product_id is null or exists(select 1 from public.products p where p.id=product_id and p.workspace_id=production_orders.workspace_id)));
create policy orders_update on public.production_orders for update to authenticated using(private.can_edit_workspace(workspace_id)) with check(private.can_edit_workspace(workspace_id) and (product_id is null or exists(select 1 from public.products p where p.id=product_id and p.workspace_id=production_orders.workspace_id)));
create index orders_workspace_status on public.production_orders(workspace_id,status,created_at desc);
create index orders_product on public.production_orders(product_id);
create function public.save_product_bundle_v3(p_product_id uuid,p_workspace_id uuid,p_name text,p_description text,p_quantity integer,p_iva_enabled boolean,p_iva_rate numeric,p_target_margin numeric,p_round_to integer,p_prints jsonb,p_costs jsonb,p_photo_data text,p_sale_price numeric)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid;j jsonb;
begin
 if p_sale_price<0 then raise exception 'Sale price cannot be negative';end if;
 v_id:=public.save_product_bundle_v2(p_product_id,p_workspace_id,p_name,p_description,p_quantity,p_iva_enabled,p_iva_rate,p_target_margin,p_round_to,p_prints,p_costs,p_photo_data);
 update public.products set sale_price=p_sale_price where id=v_id and workspace_id=p_workspace_id;
 for j in select value from jsonb_array_elements(coalesce(p_prints,'[]'::jsonb)) loop
  update public.print_jobs set printer_name=nullif(j->>'printer_name',''),power_kw=nullif(j->>'power_kw','')::numeric where product_id=v_id and print_no=(j->>'print_no')::integer;
 end loop;
 return v_id;
end;$$;
revoke all on function public.save_product_bundle_v3(uuid,uuid,text,text,integer,boolean,numeric,numeric,integer,jsonb,jsonb,text,numeric) from public,anon;
grant execute on function public.save_product_bundle_v3(uuid,uuid,text,text,integer,boolean,numeric,numeric,integer,jsonb,jsonb,text,numeric) to authenticated;

