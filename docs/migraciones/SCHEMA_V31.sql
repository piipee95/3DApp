-- KultiApp V3.1: failed prints log, printer hours and maintenance.
-- Reference of the deployment migration kultiapp_v31_production; do not re-run.
create table public.print_failures(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 occurred_on date not null default current_date,
 order_id uuid references public.production_orders(id) on delete set null,
 product_id uuid references public.products(id) on delete set null,
 printer_id uuid references public.workspace_resources(id) on delete set null,
 resource_id uuid references public.workspace_resources(id) on delete set null,
 reason text not null check(reason in ('adherencia','spaghetti','atasco','corte_luz','diseno','calibracion','otro')),
 grams numeric not null default 0 check(grams between 0 and 100000),
 minutes numeric not null default 0 check(minutes between 0 and 100000),
 cost numeric not null default 0 check(cost between 0 and 100000000),
 deducted boolean not null default false,
 note text not null default '' check(length(note) <= 500),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now()
);
create index print_failures_workspace on public.print_failures(workspace_id, occurred_on desc);
create index print_failures_order on public.print_failures(order_id);
alter table public.print_failures enable row level security;
revoke all on public.print_failures from anon, authenticated;
grant select, delete on public.print_failures to authenticated;
grant insert(workspace_id, occurred_on, order_id, product_id, printer_id, resource_id, reason, grams, minutes, cost, deducted, note)
 on public.print_failures to authenticated;
create policy print_failures_read on public.print_failures for select to authenticated using(private.is_workspace_member(workspace_id));
create policy print_failures_insert on public.print_failures for insert to authenticated with check(private.can_edit_workspace(workspace_id));
create policy print_failures_delete on public.print_failures for delete to authenticated using(private.can_edit_workspace(workspace_id));

-- Printer usage: hours only change through printer_hours(); the interval is editable.
alter table public.workspace_resources
 add column hours_used numeric not null default 0 check(hours_used >= 0),
 add column maintenance_every_hours numeric not null default 0 check(maintenance_every_hours between 0 and 100000),
 add column hours_at_maintenance numeric not null default 0 check(hours_at_maintenance >= 0),
 add column last_maintenance_on date;
grant update(maintenance_every_hours) on public.workspace_resources to authenticated;

create function private.printer_hours(p_printer uuid, p_action text, p_hours numeric default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.workspace_resources;
begin
 select * into r from public.workspace_resources where id = p_printer for update;
 if not found or auth.uid() is null or not private.can_edit_workspace(r.workspace_id) then raise exception 'Sin permiso';end if;
 if r.kind <> 'printer' then raise exception 'Solo para impresoras';end if;
 if p_action = 'add' then
  if p_hours is null or p_hours <= 0 or p_hours > 1000 then raise exception 'Horas inválidas';end if;
  update public.workspace_resources set hours_used = hours_used + p_hours where id = r.id returning * into r;
 elsif p_action = 'maintenance' then
  update public.workspace_resources set hours_at_maintenance = hours_used, last_maintenance_on = current_date where id = r.id returning * into r;
 else raise exception 'Operación no disponible';
 end if;
 return jsonb_build_object('hours_used', r.hours_used, 'hours_at_maintenance', r.hours_at_maintenance, 'last_maintenance_on', r.last_maintenance_on);
end;$$;
revoke all on function private.printer_hours(uuid, text, numeric) from public, anon;
grant execute on function private.printer_hours(uuid, text, numeric) to authenticated;
create function public.printer_hours(p_printer uuid, p_action text, p_hours numeric default 0) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
 return private.printer_hours(p_printer, p_action, p_hours);
end;$$;
revoke all on function public.printer_hours(uuid, text, numeric) from public, anon;
grant execute on function public.printer_hours(uuid, text, numeric) to authenticated;
