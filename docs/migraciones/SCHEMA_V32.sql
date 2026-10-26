-- KultiApp V3.2: public order tracking links and public product catalog.
-- Reference of the deployment migration kultiapp_v32_public_pages; do not re-run.

-- Tracking: a 64-hex token per order, created or revoked only through order_tracking_link().
alter table public.production_orders add column tracking_token text unique check(tracking_token ~ '^[a-f0-9]{64}$');

-- Catalog: products opt in with their own public price; the workspace picks a public slug.
alter table public.products
 add column catalog_visible boolean not null default false,
 add column catalog_price numeric check(catalog_price between 0 and 100000000);
grant insert(catalog_visible, catalog_price), update(catalog_visible, catalog_price) on public.products to authenticated;
alter table public.workspace_settings
 add column catalog_slug text unique check(catalog_slug ~ '^[a-z0-9](-?[a-z0-9])*$' and length(catalog_slug) between 3 and 40),
 add column catalog_whatsapp text not null default '' check(catalog_whatsapp ~ '^[0-9]{0,15}$'),
 add column catalog_intro text not null default '' check(length(catalog_intro) <= 300);
grant insert(catalog_slug, catalog_whatsapp, catalog_intro), update(catalog_slug, catalog_whatsapp, catalog_intro)
 on public.workspace_settings to authenticated;

create function private.order_tracking_link(p_order uuid, p_action text) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.production_orders;
begin
 select * into o from public.production_orders where id = p_order for update;
 if not found or auth.uid() is null or not private.can_edit_workspace(o.workspace_id) then raise exception 'Sin permiso';end if;
 if p_action = 'create' then
  if o.kind = 'stock' then raise exception 'Las órdenes para stock no tienen seguimiento';end if;
  if o.tracking_token is null then
   update public.production_orders
    set tracking_token = replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')
    where id = o.id returning * into o;
  end if;
  return o.tracking_token;
 elsif p_action = 'revoke' then
  update public.production_orders set tracking_token = null where id = o.id;
  return null;
 end if;
 raise exception 'Operación no disponible';
end;$$;
revoke all on function private.order_tracking_link(uuid, text) from public, anon;
grant execute on function private.order_tracking_link(uuid, text) to authenticated;
create function public.order_tracking_link(p_order uuid, p_action text) returns text
language sql security invoker set search_path = '' as $$select private.order_tracking_link(p_order, p_action);$$;
revoke all on function public.order_tracking_link(uuid, text) from public, anon;
grant execute on function public.order_tracking_link(uuid, text) to authenticated;

-- Public read of one order by its token: only what the customer needs to see.
create function private.order_tracking(p_token text) returns jsonb
language plpgsql security definer stable set search_path = '' as $$
declare o public.production_orders;paid numeric;total numeric;s public.workspace_settings;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Enlace no disponible';end if;
 select * into o from public.production_orders where tracking_token = p_token;
 if not found then raise exception 'Enlace no disponible';end if;
 select coalesce(sum(amount), 0) into paid from public.order_payments where order_id = o.id;
 select * into s from public.workspace_settings where workspace_id = o.workspace_id;
 total := round(o.quantity * o.unit_price);
 return jsonb_build_object(
  'business', (select name from public.workspaces where id = o.workspace_id),
  'contact', coalesce(s.quote_contact, ''),
  'whatsapp', coalesce(s.catalog_whatsapp, ''),
  'order_no', o.order_no, 'title', o.title, 'quantity', o.quantity, 'status', o.status,
  'due_date', o.due_date, 'created_at', o.created_at, 'updated_at', o.updated_at,
  'total', total, 'paid', paid, 'balance', case when o.status = 'canceled' then 0 else greatest(0, total - paid) end,
  'photos_folder', o.workspace_id::text || '/orders/' || o.id::text);
end;$$;
grant usage on schema private to anon;
revoke all on function private.order_tracking(text) from public;
grant execute on function private.order_tracking(text) to anon, authenticated;
create function public.order_tracking(p_token text) returns jsonb
language sql security invoker stable set search_path = '' as $$select private.order_tracking(p_token);$$;
revoke all on function public.order_tracking(text) from public;
grant execute on function public.order_tracking(text) to anon, authenticated;

-- Public catalog by slug: active products marked visible, with their public price and availability.
create function private.public_catalog(p_slug text) returns jsonb
language plpgsql security definer stable set search_path = '' as $$
declare s public.workspace_settings;
begin
 if p_slug is null or p_slug !~ '^[a-z0-9-]{3,40}$' then raise exception 'Catálogo no disponible';end if;
 select * into s from public.workspace_settings where catalog_slug = p_slug;
 if not found then raise exception 'Catálogo no disponible';end if;
 return jsonb_build_object(
  'business', (select name from public.workspaces where id = s.workspace_id),
  'intro', s.catalog_intro, 'whatsapp', s.catalog_whatsapp,
  'items', coalesce((select jsonb_agg(jsonb_build_object(
     'id', p.id, 'name', p.name, 'description', p.description, 'price', p.catalog_price,
     'in_stock', coalesce(p.stock_qty, 0) - coalesce(p.stock_reserved, 0) > 0, 'photo_path', p.photo_path) order by p.name)
   from public.products p where p.workspace_id = s.workspace_id and p.catalog_visible and p.status = 'active'), '[]'::jsonb));
end;$$;
revoke all on function private.public_catalog(text) from public;
grant execute on function private.public_catalog(text) to anon, authenticated;
create function public.public_catalog(p_slug text) returns jsonb
language sql security invoker stable set search_path = '' as $$select private.public_catalog(p_slug);$$;
revoke all on function public.public_catalog(text) from public;
grant execute on function public.public_catalog(text) to anon, authenticated;

-- Anonymous read of photos: catalog product photos, and finished-work photos of orders with an active tracking link.
create function private.is_public_photo(p_name text) returns boolean
language sql security definer stable set search_path = '' as $$
 select exists(select 1 from public.products p join public.workspace_settings s on s.workspace_id = p.workspace_id
               where p.photo_path = p_name and p.catalog_visible and p.status = 'active' and s.catalog_slug is not null)
     or exists(select 1 from public.production_orders o
               where o.tracking_token is not null and p_name like o.workspace_id::text || '/orders/' || o.id::text || '/%');
$$;
revoke all on function private.is_public_photo(text) from public;
grant execute on function private.is_public_photo(text) to anon, authenticated;
create policy product_photos_public_read on storage.objects for select to anon
 using(bucket_id = 'product-photos' and private.is_public_photo(name));
