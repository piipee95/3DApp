-- KultiApp V2.6: link a catalogue product to a custom-job order after it is costed, so the job
-- reserves (and, if already finished, consumes) its filament and supplies like any other order.
-- Reference of the deployment migration kultiapp_v26_link_order_product; do not re-run.
create function private.link_order_product(p_order uuid, p_product uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.production_orders; p public.products; r public.workspace_resources; x record;
 amount numeric; unit numeric; lines integer := 0;
begin
 select * into o from public.production_orders where id = p_order for update;
 if not found or auth.uid() is null or not private.can_edit_workspace(o.workspace_id) then raise exception 'Sin permiso de pedido';end if;
 if o.kind <> 'customer' or o.from_stock then raise exception 'Solo los pedidos de cliente a medida se pueden vincular';end if;
 if o.product_id is not null then raise exception 'Este pedido ya tiene un producto';end if;
 if o.status = 'canceled' then raise exception 'El pedido está cancelado';end if;
 if o.inventory_state <> 'none' then raise exception 'El pedido ya tiene materiales registrados';end if;
 select * into p from public.products where id = p_product and workspace_id = o.workspace_id;
 if not found then raise exception 'Producto no disponible en este equipo';end if;
 unit := coalesce((select total_cost from public.product_cost_summary where product_id = p.id), 0) / greatest(1, p.quantity);
 update public.production_orders set product_id = p.id, estimated_cost = round(unit * o.quantity), updated_at = now() where id = o.id;
 -- Same reservation as a new order (inventory_order_trigger), in a stable lock order.
 for x in
  select resource_id, sum(qty) qty, sum(cost) / sum(qty) cost from (
   select (m->>'resource_id')::uuid resource_id, (m->>'quantity')::numeric qty, (m->>'quantity')::numeric * (m->>'unit_cost')::numeric cost from jsonb_array_elements(p.materials) m
   union all
   select (f->>'resource_id')::uuid, (coalesce((f->>'grams')::numeric,0) + coalesce((f->>'purge_grams')::numeric,0)), (coalesce((f->>'grams')::numeric,0) + coalesce((f->>'purge_grams')::numeric,0)) * coalesce((f->>'price_per_kg')::numeric,0) / 1000
    from public.print_jobs j cross join lateral jsonb_array_elements(j.filaments) f where j.product_id = p.id and nullif(f->>'resource_id','') is not null
  ) m group by resource_id having sum(qty) > 0 order by resource_id
 loop
  select * into r from public.workspace_resources where id = x.resource_id for update;
  if not found or r.workspace_id <> o.workspace_id or r.kind = 'printer' or not r.active then raise exception 'Material no disponible en este equipo';end if;
  if not r.counted then raise exception 'Registra el stock inicial de % antes de vincular el producto', r.name;end if;
  amount := x.qty * o.quantity / greatest(1, p.quantity);
  if r.stock_qty - r.reserved_qty < amount then raise exception 'Stock insuficiente: % (disponible % %, requerido %)', r.name, r.stock_qty - r.reserved_qty, r.unit, amount;end if;
  insert into public.inventory_order_lines(order_id, resource_id, workspace_id, name, unit, quantity, unit_cost) values(o.id, r.id, o.workspace_id, r.name, r.unit, amount, x.cost);
  update public.workspace_resources set reserved_qty = reserved_qty + amount where id = r.id;
  lines := lines + 1;
 end loop;
 if lines > 0 then
  update public.production_orders set inventory_state = 'reserved' where id = o.id;
  -- A job already finished consumes its reservation right away.
  if o.status in ('ready', 'delivered') then perform private.inventory_consume(o.id, null);end if;
 end if;
 update public.quotes set product_id = p.id, updated_at = now() where order_id = o.id and product_id is null;
 return jsonb_build_object('lines', lines, 'consumed', lines > 0 and o.status in ('ready', 'delivered'), 'estimated_cost', round(unit * o.quantity));
end;$$;
revoke all on function private.link_order_product(uuid, uuid) from public, anon;
grant execute on function private.link_order_product(uuid, uuid) to authenticated;
create function public.link_order_product(p_order uuid, p_product uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
 return private.link_order_product(p_order, p_product);
end;$$;
revoke all on function public.link_order_product(uuid, uuid) from public, anon;
grant execute on function public.link_order_product(uuid, uuid) to authenticated;
