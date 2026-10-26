-- KultiApp V4.6: an open order takes the product's current recipe (materials and cost).
-- Reference of the deployment migration kultiapp_v46_refresh_order_materials; do not re-run.
-- reserved: the old reservation is released and the new recipe reserved (with stock check).
-- consumed: stock moves only by the difference (extra consumption, or the surplus returns).
-- none: the recipe is reserved now (and consumed right away if the job is already finished).
create function private.refresh_order_materials(p_order uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.production_orders; p public.products; r public.workspace_resources; x record;
 unit numeric; amount numeric; old_qty numeric; diff numeric; old_cost numeric := 0; new_cost numeric := 0;
 lines integer := 0; was text; old jsonb;
begin
 select * into o from public.production_orders where id = p_order for update;
 if not found or auth.uid() is null or not private.can_edit_workspace(o.workspace_id) then raise exception 'Sin permiso de pedido';end if;
 if o.from_stock then raise exception 'Este pedido sale de productos en stock: no usa materiales';end if;
 if o.status = 'canceled' or o.inventory_state = 'released' then raise exception 'El pedido está cancelado';end if;
 select * into p from public.products where id = o.product_id and workspace_id = o.workspace_id;
 if not found then raise exception 'El pedido no tiene un producto vinculado';end if;
 was := o.inventory_state;
 unit := coalesce((select total_cost from public.product_cost_summary where product_id = p.id), 0) / greatest(1, p.quantity);
 -- The previous lines: {resource_id: {q: quantity used or reserved, c: unit cost}}.
 select coalesce(jsonb_object_agg(resource_id, jsonb_build_object('q', coalesce(consumed_qty, quantity), 'c', unit_cost)), '{}'),
  coalesce(sum(coalesce(consumed_qty, quantity) * unit_cost), 0)
  into old, old_cost from public.inventory_order_lines where order_id = o.id;
 -- Lock every resource involved (old and new recipe) in a stable order.
 perform 1 from public.workspace_resources where id in (
  select k::uuid from jsonb_object_keys(old) k
  union select (m->>'resource_id')::uuid from jsonb_array_elements(p.materials) m
  union select (f->>'resource_id')::uuid from public.print_jobs j cross join lateral jsonb_array_elements(j.filaments) f where j.product_id = p.id and nullif(f->>'resource_id','') is not null
 ) order by id for update;
 if was = 'reserved' then
  update public.workspace_resources w set reserved_qty = w.reserved_qty - (l.value->>'q')::numeric from jsonb_each(old) l where w.id = l.key::uuid;
 end if;
 delete from public.inventory_order_lines where order_id = o.id;
 for x in
  select resource_id, sum(qty) qty, sum(cost) / sum(qty) cost from (
   select (m->>'resource_id')::uuid resource_id, (m->>'quantity')::numeric qty, (m->>'quantity')::numeric * (m->>'unit_cost')::numeric cost from jsonb_array_elements(p.materials) m
   union all
   select (f->>'resource_id')::uuid, (coalesce((f->>'grams')::numeric,0) + coalesce((f->>'purge_grams')::numeric,0)), (coalesce((f->>'grams')::numeric,0) + coalesce((f->>'purge_grams')::numeric,0)) * coalesce((f->>'price_per_kg')::numeric,0) / 1000
    from public.print_jobs j cross join lateral jsonb_array_elements(j.filaments) f where j.product_id = p.id and nullif(f->>'resource_id','') is not null
  ) m group by resource_id having sum(qty) > 0 order by resource_id
 loop
  select * into r from public.workspace_resources where id = x.resource_id;
  if not found or r.workspace_id <> o.workspace_id or r.kind = 'printer' then raise exception 'Material no disponible en este equipo';end if;
  amount := x.qty * o.quantity / greatest(1, p.quantity);
  if was = 'consumed' then
   old_qty := coalesce((old->r.id::text->>'q')::numeric, 0);
   diff := amount - old_qty;
   if diff > 0 then
    insert into public.inventory_movements(workspace_id, resource_id, order_id, kind, quantity, unit_cost, note, request_key)
     values(o.workspace_id, r.id, o.id, 'consumption', -diff, x.cost, 'Ajuste de receta pedido #' || o.order_no, gen_random_uuid());
   elsif diff < 0 then
    insert into public.inventory_movements(workspace_id, resource_id, kind, quantity, unit_cost, note, request_key)
     values(o.workspace_id, r.id, 'adjustment', -diff, x.cost, 'Devolución por ajuste de receta pedido #' || o.order_no, gen_random_uuid());
   end if;
   insert into public.inventory_order_lines(order_id, resource_id, workspace_id, name, unit, quantity, consumed_qty, unit_cost)
    values(o.id, r.id, o.workspace_id, r.name, r.unit, amount, amount, x.cost);
  else
   if not r.active then raise exception 'Material no disponible en este equipo: %', r.name;end if;
   if not r.counted then raise exception 'Registra el stock inicial de % antes de actualizar el pedido', r.name;end if;
   if r.stock_qty - r.reserved_qty < amount then raise exception 'Stock insuficiente: % (disponible % %, requerido %)', r.name, r.stock_qty - r.reserved_qty, r.unit, amount;end if;
   insert into public.inventory_order_lines(order_id, resource_id, workspace_id, name, unit, quantity, unit_cost)
    values(o.id, r.id, o.workspace_id, r.name, r.unit, amount, x.cost);
   update public.workspace_resources set reserved_qty = reserved_qty + amount where id = r.id;
  end if;
  new_cost := new_cost + amount * x.cost;
  lines := lines + 1;
 end loop;
 -- Materials of the old recipe that are no longer used go back to stock.
 if was = 'consumed' then
  insert into public.inventory_movements(workspace_id, resource_id, kind, quantity, unit_cost, note, request_key)
   select o.workspace_id, l.key::uuid, 'adjustment', (l.value->>'q')::numeric, (l.value->>'c')::numeric, 'Devolución por ajuste de receta pedido #' || o.order_no, gen_random_uuid()
   from jsonb_each(old) l where (l.value->>'q')::numeric > 0 and not exists (select 1 from public.inventory_order_lines n where n.order_id = o.id and n.resource_id = l.key::uuid);
  update public.production_orders set estimated_cost = round(unit * o.quantity),
   actual_cost = case when actual_cost is null then null else greatest(0, round(actual_cost - old_cost + new_cost)) end, updated_at = now() where id = o.id;
 else
  update public.production_orders set estimated_cost = round(unit * o.quantity),
   inventory_state = case when lines > 0 then 'reserved' else 'none' end, updated_at = now() where id = o.id;
  if lines > 0 and o.status in ('ready', 'delivered') then perform private.inventory_consume(o.id, null);end if;
 end if;
 return jsonb_build_object('lines', lines, 'state', (select inventory_state from public.production_orders where id = o.id), 'estimated_cost', round(unit * o.quantity));
end;$$;
revoke all on function private.refresh_order_materials(uuid) from public, anon;
grant execute on function private.refresh_order_materials(uuid) to authenticated;
create function public.refresh_order_materials(p_order uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
 return private.refresh_order_materials(p_order);
end;$$;
revoke all on function public.refresh_order_materials(uuid) from public, anon;
grant execute on function public.refresh_order_materials(uuid) to authenticated;
