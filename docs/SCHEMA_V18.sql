-- KultiApp V1.8: customers and saved quotes. Reference of the deployment migration; do not re-run.
create table public.customers(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 120),
 phone text not null default '' check(length(phone) <= 40),
 email text not null default '' check(length(email) <= 160),
 instagram text not null default '' check(length(instagram) <= 80),
 notes text not null default '' check(length(notes) <= 1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index customers_workspace_name on public.customers(workspace_id, lower(btrim(name)));
alter table public.customers enable row level security;
revoke all on public.customers from anon, authenticated;
grant select, delete on public.customers to authenticated;
grant insert(workspace_id, name, phone, email, instagram, notes) on public.customers to authenticated;
grant update(name, phone, email, instagram, notes, updated_at) on public.customers to authenticated;
create policy customers_read on public.customers for select to authenticated using(private.is_workspace_member(workspace_id));
create policy customers_insert on public.customers for insert to authenticated with check(private.can_edit_workspace(workspace_id));
create policy customers_update on public.customers for update to authenticated
 using(private.can_edit_workspace(workspace_id)) with check(private.can_edit_workspace(workspace_id));
create policy customers_delete on public.customers for delete to authenticated using(private.can_edit_workspace(workspace_id));

create table public.quotes(
 id uuid primary key default gen_random_uuid(),
 quote_no bigint generated always as identity,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 customer_id uuid references public.customers(id) on delete set null,
 client_name text not null default '' check(length(client_name) <= 120),
 product_id uuid references public.products(id) on delete set null,
 title text not null check(length(btrim(title)) between 1 and 200),
 description text not null default '' check(length(description) <= 2000),
 quantity integer not null check(quantity between 1 and 100000),
 unit_price numeric not null check(unit_price >= 0),
 iva_enabled boolean not null default true,
 iva_rate numeric not null default 0.19 check(iva_rate between 0 and 1),
 unit_cost numeric not null default 0 check(unit_cost >= 0),
 validity_days integer not null default 15 check(validity_days between 1 and 365),
 delivery text not null default '' check(length(delivery) <= 200),
 terms text not null default '' check(length(terms) <= 1000),
 contact text not null default '' check(length(contact) <= 300),
 status text not null default 'sent' check(status in ('sent','accepted','rejected')),
 order_id uuid references public.production_orders(id) on delete set null,
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index quotes_workspace on public.quotes(workspace_id, created_at desc);
create index quotes_customer on public.quotes(customer_id);
create index quotes_product on public.quotes(product_id);
create index quotes_order on public.quotes(order_id);
alter table public.quotes enable row level security;
revoke all on public.quotes from anon, authenticated;
grant select, delete on public.quotes to authenticated;
grant insert(workspace_id, customer_id, client_name, product_id, title, description, quantity, unit_price, iva_enabled,
 iva_rate, unit_cost, validity_days, delivery, terms, contact) on public.quotes to authenticated;
grant update(customer_id, client_name, quantity, unit_price, validity_days, delivery, terms, contact, status, order_id, updated_at)
 on public.quotes to authenticated;
create policy quotes_read on public.quotes for select to authenticated using(private.is_workspace_member(workspace_id));
create policy quotes_insert on public.quotes for insert to authenticated with check(private.can_edit_workspace(workspace_id));
create policy quotes_update on public.quotes for update to authenticated
 using(private.can_edit_workspace(workspace_id)) with check(private.can_edit_workspace(workspace_id));
create policy quotes_delete on public.quotes for delete to authenticated using(private.can_edit_workspace(workspace_id));

alter table public.production_orders add column customer_id uuid references public.customers(id) on delete set null;
create index production_orders_customer on public.production_orders(customer_id);
grant insert(customer_id) on public.production_orders to authenticated;

-- Linked rows must belong to the same workspace.
create function private.same_workspace_links() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.customer_id is not null and not exists(select 1 from public.customers where id = new.customer_id and workspace_id = new.workspace_id) then
  raise exception 'Cliente de otro equipo';
 end if;
 if TG_TABLE_NAME = 'quotes' then
  if new.product_id is not null and not exists(select 1 from public.products where id = new.product_id and workspace_id = new.workspace_id) then
   raise exception 'Producto de otro equipo';
  end if;
  if new.order_id is not null and not exists(select 1 from public.production_orders where id = new.order_id and workspace_id = new.workspace_id) then
   raise exception 'Pedido de otro equipo';
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.same_workspace_links() from public, anon, authenticated;
create trigger quotes_links before insert or update on public.quotes for each row execute function private.same_workspace_links();
create trigger orders_customer_link before insert or update of customer_id on public.production_orders
 for each row execute function private.same_workspace_links();
