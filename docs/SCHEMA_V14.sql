-- Inventory integration. Reference of the deployment migration; do not re-run.
alter table public.workspace_resources drop constraint workspace_resources_kind_check;
alter table public.workspace_resources add check(kind in ('filament','printer','supply')),
 add column unit text not null default 'un' check(unit in ('un','hoja','m','g','kg','l')),
 add column unit_cost numeric not null default 0 check(unit_cost between 0 and 1000000000),
 add column min_stock numeric not null default 0 check(min_stock between 0 and 1000000000),
 add column stock_qty numeric not null default 0 check(stock_qty between 0 and 1000000000),
 add column reserved_qty numeric not null default 0 check(reserved_qty between 0 and stock_qty),
 add column counted boolean not null default false;
update public.workspace_resources set unit='g',unit_cost=price_per_kg/1000 where kind='filament';
alter table public.products add column materials jsonb not null default '[]' check(jsonb_typeof(materials)='array' and jsonb_array_length(materials)<=100);
alter table public.cost_items add column inventory_material boolean not null default false;
alter table public.production_orders add column inventory_state text not null default 'none' check(inventory_state in ('none','reserved','consumed','released'));

create table public.inventory_movements(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 resource_id uuid not null references public.workspace_resources(id),
 order_id uuid references public.production_orders(id) on delete set null,
 kind text not null check(kind in ('opening','purchase','adjustment','loss','consumption')),
 quantity numeric not null check(quantity between -1000000000 and 1000000000),
 unit_cost numeric not null check(unit_cost between 0 and 1000000000),
 note text not null default '',request_key uuid not null unique,
 created_at timestamptz not null default now(),created_by uuid not null default auth.uid()
);
create index inventory_movements_resource on public.inventory_movements(resource_id,created_at desc);
create index inventory_movements_workspace on public.inventory_movements(workspace_id,created_at desc);
create index inventory_movements_order on public.inventory_movements(order_id);
alter table public.inventory_movements enable row level security;
revoke all on public.inventory_movements from anon,authenticated;
grant select,insert on public.inventory_movements to authenticated;
create policy inventory_movements_read on public.inventory_movements for select to authenticated using(private.is_workspace_member(workspace_id));
create policy inventory_movements_insert on public.inventory_movements for insert to authenticated with check(private.can_edit_workspace(workspace_id) and created_by=auth.uid() and kind<>'consumption' and order_id is null);

create table public.inventory_order_lines(
 order_id uuid not null references public.production_orders(id) on delete cascade,
 resource_id uuid not null references public.workspace_resources(id),workspace_id uuid not null references public.workspaces(id),
 name text not null,unit text not null,quantity numeric not null check(quantity>0 and quantity<=1000000000),
 consumed_qty numeric check(consumed_qty between 0 and 1000000000),unit_cost numeric not null check(unit_cost between 0 and 1000000000),
 primary key(order_id,resource_id)
);
create index inventory_lines_workspace on public.inventory_order_lines(workspace_id);
create index inventory_lines_resource on public.inventory_order_lines(resource_id);
alter table public.inventory_order_lines enable row level security;
revoke all on public.inventory_order_lines from anon,authenticated;
grant select on public.inventory_order_lines to authenticated;
create policy inventory_lines_read on public.inventory_order_lines for select to authenticated using(private.is_workspace_member(workspace_id));

-- Stock and reservation balances cannot be edited through the Data API.
revoke insert,update on public.workspace_resources from authenticated;
grant insert(workspace_id,kind,name,material,color,price_per_kg,power_kw,active,unit,unit_cost,min_stock),
 update(name,material,color,price_per_kg,power_kw,active,unit,unit_cost,min_stock) on public.workspace_resources to authenticated;
revoke insert,update on public.production_orders from authenticated;
grant insert(workspace_id,product_id,title,customer_name,quantity,unit_price,iva_enabled,iva_rate,estimated_cost,estimated_grams,estimated_minutes,due_date,notes),
 update(status,due_date,notes,actual_cost,actual_grams,actual_minutes,failures_cost,updated_at) on public.production_orders to authenticated;

create function private.inventory_resource_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.unit<>old.unit and exists(select 1 from public.inventory_movements where resource_id=old.id) then raise exception 'No puedes cambiar la unidad después de registrar movimientos.';end if;
 if new.kind='filament' then new.unit:='g';new.unit_cost:=new.price_per_kg/1000;end if;
 return new;
end;$$;
create trigger inventory_resource_guard before insert or update on public.workspace_resources for each row execute function private.inventory_resource_guard();

-- Private privileged triggers are needed to maintain non-editable balances.
-- Every entry point checks auth.uid() and editor membership before touching stock.
create function private.inventory_apply_movement() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.workspace_resources; q numeric;
begin
 if auth.uid() is null or not private.can_edit_workspace(new.workspace_id) then raise exception 'Sin permiso de inventario';end if;
 select * into r from public.workspace_resources where id=new.resource_id for update;
 if not found or r.workspace_id<>new.workspace_id or r.kind='printer' then raise exception 'Material inválido';end if;
 if new.created_by<>auth.uid() then raise exception 'Autor inválido';end if;
 if new.kind='opening' and r.counted then raise exception 'El conteo inicial ya fue registrado';end if;
 if new.kind<>'opening' and not r.counted then raise exception 'Registra primero el stock inicial';end if;
 if new.kind in ('opening','purchase') and new.quantity<0 or new.kind in ('loss','consumption') and new.quantity>=0 or new.kind in ('purchase','adjustment') and new.quantity=0 then raise exception 'Cantidad inválida';end if;
 if new.kind<>'consumption' and new.order_id is not null then raise exception 'Movimiento de pedido inválido';end if;
 q:=r.stock_qty+new.quantity;
 if q<r.reserved_qty then raise exception 'Stock insuficiente: % (disponible % %)',r.name,r.stock_qty-r.reserved_qty,r.unit;end if;
 if new.kind='purchase' then
  update public.workspace_resources set unit_cost=(r.stock_qty*r.unit_cost+new.quantity*new.unit_cost)/nullif(q,0),price_per_kg=case when r.kind='filament' then (r.stock_qty*r.unit_cost+new.quantity*new.unit_cost)/nullif(q,0)*1000 else price_per_kg end where id=r.id;
 elsif new.kind='opening' then
  update public.workspace_resources set unit_cost=new.unit_cost,price_per_kg=case when r.kind='filament' then new.unit_cost*1000 else price_per_kg end where id=r.id;
 else new.unit_cost:=r.unit_cost;
 end if;
 update public.workspace_resources set stock_qty=q,counted=true where id=r.id;
 return new;
end;$$;
revoke all on function private.inventory_apply_movement() from public,anon,authenticated;
create trigger inventory_apply_movement before insert on public.inventory_movements for each row execute function private.inventory_apply_movement();

create function private.inventory_consume(p_order uuid,p_actual jsonb) returns void language plpgsql security definer set search_path='' as $$
declare o public.production_orders;l public.inventory_order_lines;a numeric;vcost numeric:=0;ecost numeric:=0;
begin
 select * into o from public.production_orders where id=p_order for update;
 if not found or auth.uid() is null or not private.can_edit_workspace(o.workspace_id) then raise exception 'Sin permiso de pedido';end if;
 if o.inventory_state='consumed' then return;end if;
 if o.inventory_state<>'reserved' or o.status='canceled' then raise exception 'El pedido no tiene una reserva activa';end if;
 if p_actual is not null and (jsonb_typeof(p_actual)<>'object' or (select count(*) from jsonb_object_keys(p_actual))<>(select count(*) from public.inventory_order_lines where order_id=p_order)) then raise exception 'Completa el consumo de todos los materiales';end if;
 perform 1 from public.workspace_resources where id in(select resource_id from public.inventory_order_lines where order_id=p_order) order by id for update;
 for l in select * from public.inventory_order_lines where order_id=p_order order by resource_id loop
  a:=case when p_actual is null then l.quantity else (p_actual->>l.resource_id::text)::numeric end;
  if a is null or not (a between 0 and 1000000000) then raise exception 'Consumo inválido';end if;
  update public.workspace_resources set reserved_qty=reserved_qty-l.quantity where id=l.resource_id;
  if a>0 then
   insert into public.inventory_movements(workspace_id,resource_id,order_id,kind,quantity,unit_cost,note,request_key)
    values(o.workspace_id,l.resource_id,p_order,'consumption',-a,l.unit_cost,'Consumo pedido #'||o.order_no,gen_random_uuid());
  end if;
  update public.inventory_order_lines set consumed_qty=a where order_id=p_order and resource_id=l.resource_id;
  -- Actual use is valued at the current average cost; the estimate it replaces uses the reserved snapshot cost.
  vcost:=vcost+a*(select unit_cost from public.workspace_resources where id=l.resource_id);ecost:=ecost+l.quantity*l.unit_cost;
 end loop;
 update public.production_orders set inventory_state='consumed',actual_cost=coalesce(actual_cost,greatest(0,estimated_cost-ecost)+vcost),updated_at=now() where id=p_order;
end;$$;
revoke all on function private.inventory_consume(uuid,jsonb) from public,anon,authenticated;
create function public.inventory_consume_order(p_order uuid,p_actual jsonb default null) returns void language plpgsql security invoker set search_path='' as $$
begin
 -- The private function grants only a narrowly scoped, checked operation.
 perform private.inventory_consume(p_order,p_actual);
end;$$;
grant execute on function private.inventory_consume(uuid,jsonb) to authenticated;
revoke all on function public.inventory_consume_order(uuid,jsonb) from public,anon;
grant execute on function public.inventory_consume_order(uuid,jsonb) to authenticated;

create function private.inventory_order_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.products;r public.workspace_resources; x record;amount numeric;
begin
 if auth.uid() is null or not private.can_edit_workspace(new.workspace_id) then raise exception 'Sin permiso de producción';end if;
 if TG_OP='INSERT' then
  select * into p from public.products where id=new.product_id and workspace_id=new.workspace_id;
  if not found then return new;end if;
  -- Lock resources in a stable order to serialize simultaneous reservations.
  for x in
   select resource_id,sum(qty) qty,sum(cost)/sum(qty) cost from (
    select (m->>'resource_id')::uuid resource_id,(m->>'quantity')::numeric qty,(m->>'quantity')::numeric*(m->>'unit_cost')::numeric cost from jsonb_array_elements(p.materials) m
    union all
    select (f->>'resource_id')::uuid,(coalesce((f->>'grams')::numeric,0)+coalesce((f->>'purge_grams')::numeric,0)),(coalesce((f->>'grams')::numeric,0)+coalesce((f->>'purge_grams')::numeric,0))*coalesce((f->>'price_per_kg')::numeric,0)/1000 from public.print_jobs j cross join lateral jsonb_array_elements(j.filaments) f where j.product_id=p.id and nullif(f->>'resource_id','') is not null
   ) m group by resource_id having sum(qty)>0 order by resource_id
  loop
   select * into r from public.workspace_resources where id=x.resource_id for update;
   if not found or r.workspace_id<>new.workspace_id or r.kind='printer' or not r.active then raise exception 'Material no disponible en este equipo';end if;
   if not r.counted then raise exception 'Registra el stock inicial de % antes de crear el pedido',r.name;end if;
   amount:=x.qty*new.quantity/p.quantity;
   if r.stock_qty-r.reserved_qty<amount then raise exception 'Stock insuficiente: % (disponible % %, requerido %)',r.name,r.stock_qty-r.reserved_qty,r.unit,amount;end if;
   insert into public.inventory_order_lines(order_id,resource_id,workspace_id,name,unit,quantity,unit_cost) values(new.id,r.id,new.workspace_id,r.name,r.unit,amount,x.cost);
   update public.workspace_resources set reserved_qty=reserved_qty+amount where id=r.id;
  end loop;
  if exists(select 1 from public.inventory_order_lines where order_id=new.id) then update public.production_orders set inventory_state='reserved' where id=new.id;end if;
 elsif new.status is distinct from old.status then
  if old.inventory_state='consumed' and new.status in ('pending','canceled') then raise exception 'El consumo ya está registrado. Mantén el pedido listo o entregado; corrige existencias con un movimiento.';end if;
  if new.status='canceled' and old.inventory_state='reserved' then
   perform 1 from public.workspace_resources where id in(select resource_id from public.inventory_order_lines where order_id=new.id) order by id for update;
   for x in select * from public.inventory_order_lines where order_id=new.id loop update public.workspace_resources set reserved_qty=reserved_qty-x.quantity where id=x.resource_id;end loop;
   update public.production_orders set inventory_state='released' where id=new.id;
  elsif old.status='canceled' and new.status<>'canceled' then raise exception 'Crea otro pedido para volver a reservar los materiales';
  elsif new.status in ('ready','delivered') and old.inventory_state='reserved' then perform private.inventory_consume(new.id,null);
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.inventory_order_trigger() from public,anon,authenticated;
create trigger inventory_order_trigger after insert or update of status on public.production_orders for each row execute function private.inventory_order_trigger();

create function public.save_product_bundle_v4(p_product_id uuid,p_workspace_id uuid,p_name text,p_description text,p_quantity integer,p_iva_enabled boolean,p_iva_rate numeric,p_target_margin numeric,p_round_to integer,p_prints jsonb,p_costs jsonb,p_photo_data text,p_sale_price numeric,p_materials jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v uuid;m jsonb;r public.workspace_resources;normalized_materials jsonb:='[]';costs jsonb:=coalesce(p_costs,'[]');i integer:=0;j jsonb;f jsonb;
begin
 if auth.uid() is null or not private.can_edit_workspace(p_workspace_id) then raise exception 'Sin permiso de producto';end if;
 if jsonb_typeof(p_materials)<>'array' or jsonb_array_length(p_materials)>100 then raise exception 'Lista de materiales inválida';end if;
 for m in select value from jsonb_array_elements(p_materials) loop
  select * into r from public.workspace_resources where id=(m->>'resource_id')::uuid and workspace_id=p_workspace_id and kind='supply';
  if not found or not ((m->>'quantity')::numeric between 0 and 1000000000) or not ((m->>'unit_cost')::numeric between 0 and 1000000000) then raise exception 'Material o cantidad inválidos';end if;
  normalized_materials:=normalized_materials||jsonb_build_array(jsonb_build_object('resource_id',r.id,'name',r.name,'unit',r.unit,'quantity',(m->>'quantity')::numeric,'unit_cost',(m->>'unit_cost')::numeric));
  costs:=costs||jsonb_build_array(jsonb_build_object('name',r.name,'amount',round((m->>'quantity')::numeric*(m->>'unit_cost')::numeric,2),'category','direct','sort_order',100000+i));i:=i+1;
 end loop;
 for j in select value from jsonb_array_elements(p_prints) loop
  for f in select value from jsonb_array_elements(coalesce(j->'filaments','[]')) loop
   if nullif(f->>'resource_id','') is not null and not exists(select 1 from public.workspace_resources where id=(f->>'resource_id')::uuid and workspace_id=p_workspace_id and kind='filament') then raise exception 'Filamento fuera del equipo';end if;
  end loop;
 end loop;
 v:=public.save_product_bundle_v3(p_product_id,p_workspace_id,p_name,p_description,p_quantity,p_iva_enabled,p_iva_rate,p_target_margin,p_round_to,p_prints,costs,p_photo_data,p_sale_price);
 update public.products set materials=normalized_materials where id=v;
 update public.cost_items set inventory_material=true where product_id=v and sort_order>=100000;
 return v;
end;$$;
revoke all on function public.save_product_bundle_v4(uuid,uuid,text,text,integer,boolean,numeric,numeric,integer,jsonb,jsonb,text,numeric,jsonb) from public,anon;
grant execute on function public.save_product_bundle_v4(uuid,uuid,text,text,integer,boolean,numeric,numeric,integer,jsonb,jsonb,text,numeric,jsonb) to authenticated;
