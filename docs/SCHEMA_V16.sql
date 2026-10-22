-- KultiApp V1.7: finished-goods stock per product, fabrication-for-stock orders and customer
-- orders served from stock. Reference of the deployment migration; do not re-run.
alter table public.products
 add column stock_qty integer not null default 0 check(stock_qty >= 0),
 add column stock_reserved integer not null default 0 check(stock_reserved >= 0 and stock_reserved <= stock_qty);

alter table public.production_orders
 add column kind text not null default 'customer' check(kind in ('customer','stock')),
 add column from_stock boolean not null default false,
 add column stock_state text not null default 'none' check(stock_state in ('none','reserved','delivered','released','added')),
 add constraint production_orders_stock_kind check(not (kind = 'stock' and from_stock));
grant insert(kind, from_stock) on public.production_orders to authenticated;

create table public.product_stock_movements(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete cascade,
 order_id uuid references public.production_orders(id) on delete set null,
 kind text not null check(kind in ('production','sale','adjustment')),
 quantity integer not null check(quantity <> 0 and quantity between -100000 and 100000),
 note text not null default '' check(length(note) <= 500),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now()
);
create index product_stock_movements_product on public.product_stock_movements(product_id, created_at desc);
create index product_stock_movements_workspace on public.product_stock_movements(workspace_id);
create index product_stock_movements_order on public.product_stock_movements(order_id);
alter table public.product_stock_movements enable row level security;
revoke all on public.product_stock_movements from anon, authenticated;
grant select on public.product_stock_movements to authenticated;
create policy product_stock_movements_read on public.product_stock_movements for select to authenticated
 using(private.is_workspace_member(workspace_id));

-- Stock columns change only through the privileged functions below, never from the Data API.
create function private.product_stock_guard() returns trigger language plpgsql set search_path = '' as $$
begin
 if current_user = 'authenticated' then
  if TG_OP = 'INSERT' then
   new.stock_qty := 0; new.stock_reserved := 0;
  elsif new.stock_qty is distinct from old.stock_qty or new.stock_reserved is distinct from old.stock_reserved then
   raise exception 'El stock del producto cambia solo con pedidos o ajustes';
  end if;
 end if;
 return new;
end;$$;
create trigger product_stock_guard before insert or update on public.products
 for each row execute function private.product_stock_guard();

-- Orders served from stock reserve finished units instead of materials.
create or replace function private.inventory_order_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.products;r public.workspace_resources; x record;amount numeric;
begin
 if auth.uid() is null or not private.can_edit_workspace(new.workspace_id) then raise exception 'Sin permiso de producción';end if;
 if TG_OP='INSERT' then
  if new.from_stock then return new;end if;
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

-- Finished-goods stock: fabrication orders add units when ready; orders from stock reserve and deliver units.
create function private.product_stock_order_trigger() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.products;
begin
 if auth.uid() is null or not private.can_edit_workspace(new.workspace_id) then raise exception 'Sin permiso de producción';end if;
 if TG_OP = 'INSERT' then
  if new.from_stock then
   select * into p from public.products where id = new.product_id and workspace_id = new.workspace_id for update;
   if not found then raise exception 'Elige un producto para entregar desde stock';end if;
   if p.stock_qty - p.stock_reserved < new.quantity then
    raise exception 'Stock insuficiente de %: disponible % un.', p.name, p.stock_qty - p.stock_reserved;
   end if;
   update public.products set stock_reserved = stock_reserved + new.quantity where id = p.id;
   update public.production_orders set stock_state = 'reserved' where id = new.id;
  elsif new.kind = 'stock' and not exists(select 1 from public.products where id = new.product_id and workspace_id = new.workspace_id) then
   raise exception 'La fabricación para stock necesita un producto del equipo';
  end if;
  return new;
 end if;
 if new.status is not distinct from old.status then return new;end if;
 if old.from_stock then
  if old.stock_state = 'reserved' and new.status in ('ready','delivered') then
   update public.products set stock_qty = stock_qty - new.quantity, stock_reserved = stock_reserved - new.quantity where id = new.product_id;
   insert into public.product_stock_movements(workspace_id, product_id, order_id, kind, quantity, note)
    values(new.workspace_id, new.product_id, new.id, 'sale', -new.quantity, 'Pedido PED-' || new.order_no);
   update public.production_orders set stock_state = 'delivered' where id = new.id;
  elsif old.stock_state = 'reserved' and new.status = 'canceled' then
   update public.products set stock_reserved = stock_reserved - new.quantity where id = new.product_id;
   update public.production_orders set stock_state = 'released' where id = new.id;
  elsif old.stock_state = 'delivered' and new.status in ('pending','printing','assembly','canceled') then
   raise exception 'La entrega desde stock ya se registró; corrige con un ajuste de stock del producto.';
  end if;
 elsif old.kind = 'stock' then
  if old.stock_state = 'none' and new.status in ('ready','delivered') then
   update public.products set stock_qty = stock_qty + new.quantity where id = new.product_id;
   insert into public.product_stock_movements(workspace_id, product_id, order_id, kind, quantity, note)
    values(new.workspace_id, new.product_id, new.id, 'production', new.quantity, 'Fabricación PED-' || new.order_no);
   update public.production_orders set stock_state = 'added' where id = new.id;
  elsif old.stock_state = 'added' and new.status in ('pending','printing','assembly','canceled') then
   raise exception 'Estas unidades ya se sumaron al stock; corrige con un ajuste de stock del producto.';
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.product_stock_order_trigger() from public, anon, authenticated;
create trigger product_stock_order_trigger after insert or update of status on public.production_orders
 for each row execute function private.product_stock_order_trigger();

-- Count finished units without touching materials (e.g. stock found on a shelf).
create function public.adjust_product_stock(p_product uuid, p_count integer, p_note text default '')
returns integer language plpgsql security definer set search_path = '' as $$
declare p public.products; delta integer;
begin
 select * into p from public.products where id = p_product for update;
 if not found or auth.uid() is null or not private.can_edit_workspace(p.workspace_id) then raise exception 'Sin permiso';end if;
 if p_count is null or p_count < p.stock_reserved or p_count > 100000 then
  raise exception 'El conteo no puede ser menor a lo reservado (% un.)', p.stock_reserved;
 end if;
 delta := p_count - p.stock_qty;
 if delta = 0 then return p.stock_qty;end if;
 update public.products set stock_qty = p_count where id = p.id;
 insert into public.product_stock_movements(workspace_id, product_id, kind, quantity, note)
  values(p.workspace_id, p.id, 'adjustment', delta, left(coalesce(p_note, ''), 500));
 return p_count;
end;$$;
revoke all on function public.adjust_product_stock(uuid, integer, text) from public, anon;
grant execute on function public.adjust_product_stock(uuid, integer, text) to authenticated;

-- Migration kultiapp_v17_adjust_stock_invoker: same pattern as inventory_consume_order
-- (privileged logic in private, security invoker wrapper in public).
alter function public.adjust_product_stock(uuid, integer, text) set schema private;
revoke all on function private.adjust_product_stock(uuid, integer, text) from public, anon;
grant execute on function private.adjust_product_stock(uuid, integer, text) to authenticated;
create function public.adjust_product_stock(p_product uuid, p_count integer, p_note text default '') returns integer
language plpgsql security invoker set search_path = '' as $$
begin
 return private.adjust_product_stock(p_product, p_count, p_note);
end;$$;
revoke all on function public.adjust_product_stock(uuid, integer, text) from public, anon;
grant execute on function public.adjust_product_stock(uuid, integer, text) to authenticated;
