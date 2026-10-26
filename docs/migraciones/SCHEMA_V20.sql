-- KultiApp V2.0: payments (deposits and balances) per customer order. Reference of the deployment
-- migration kultiapp_v20_order_payments; do not re-run.
create table public.order_payments(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 order_id uuid not null references public.production_orders(id) on delete cascade,
 amount numeric not null check(amount <> 0 and amount between -100000000 and 100000000),
 method text not null default 'transfer' check(method in ('transfer','cash','card','other')),
 paid_on date not null default current_date,
 note text not null default '' check(length(note) <= 300),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now()
);
create index order_payments_order on public.order_payments(order_id);
create index order_payments_workspace on public.order_payments(workspace_id, paid_on desc);
alter table public.order_payments enable row level security;
revoke all on public.order_payments from anon, authenticated;
grant select, delete on public.order_payments to authenticated;
grant insert(workspace_id, order_id, amount, method, paid_on, note) on public.order_payments to authenticated;
create policy order_payments_read on public.order_payments for select to authenticated
 using(private.is_workspace_member(workspace_id));
create policy order_payments_insert on public.order_payments for insert to authenticated
 with check(private.can_edit_workspace(workspace_id)
  and exists(select 1 from public.production_orders o where o.id = order_id and o.workspace_id = order_payments.workspace_id));
create policy order_payments_delete on public.order_payments for delete to authenticated
 using(private.can_edit_workspace(workspace_id));
