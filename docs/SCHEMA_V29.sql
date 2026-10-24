-- KultiApp V2.9: business expenses, partner accounts and VAT summary.
-- Reference of the deployment migration kultiapp_v29_finance; do not re-run.

-- Partners (name + profit share) live in the team settings; payments record who received them.
alter table public.workspace_settings
 add column partners jsonb not null default '[]'::jsonb check(jsonb_typeof(partners) = 'array' and jsonb_array_length(partners) <= 6);
grant insert(partners), update(partners) on public.workspace_settings to authenticated;
alter table public.order_payments add column received_by text not null default '' check(length(received_by) <= 60);
grant insert(received_by) on public.order_payments to authenticated;

create table public.expenses(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 spent_on date not null default current_date,
 category text not null check(category in ('arriendo','servicios','publicidad','herramientas','suscripciones','envios','materiales','otros')),
 description text not null default '' check(length(description) <= 200),
 amount numeric not null check(amount > 0 and amount <= 1000000000),
 has_invoice boolean not null default false,
 iva_amount numeric not null default 0 check(iva_amount >= 0 and iva_amount <= amount),
 paid_by text not null default '' check(length(paid_by) <= 60),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now()
);
create index expenses_workspace on public.expenses(workspace_id, spent_on desc);
alter table public.expenses enable row level security;
revoke all on public.expenses from anon, authenticated;
grant select, delete on public.expenses to authenticated;
grant insert(workspace_id, spent_on, category, description, amount, has_invoice, iva_amount, paid_by) on public.expenses to authenticated;
grant update(spent_on, category, description, amount, has_invoice, iva_amount, paid_by) on public.expenses to authenticated;
create policy expenses_read on public.expenses for select to authenticated using(private.is_workspace_member(workspace_id));
create policy expenses_insert on public.expenses for insert to authenticated with check(private.can_edit_workspace(workspace_id));
create policy expenses_update on public.expenses for update to authenticated
 using(private.can_edit_workspace(workspace_id)) with check(private.can_edit_workspace(workspace_id));
create policy expenses_delete on public.expenses for delete to authenticated using(private.can_edit_workspace(workspace_id));

-- Money moved between partners to settle accounts.
create table public.partner_transfers(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 from_name text not null check(length(trim(from_name)) between 1 and 60),
 to_name text not null check(length(trim(to_name)) between 1 and 60 and to_name <> from_name),
 amount numeric not null check(amount > 0 and amount <= 1000000000),
 transferred_on date not null default current_date,
 note text not null default '' check(length(note) <= 200),
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now()
);
create index partner_transfers_workspace on public.partner_transfers(workspace_id, transferred_on desc);
alter table public.partner_transfers enable row level security;
revoke all on public.partner_transfers from anon, authenticated;
grant select, delete on public.partner_transfers to authenticated;
grant insert(workspace_id, from_name, to_name, amount, transferred_on, note) on public.partner_transfers to authenticated;
create policy partner_transfers_read on public.partner_transfers for select to authenticated using(private.is_workspace_member(workspace_id));
create policy partner_transfers_insert on public.partner_transfers for insert to authenticated with check(private.can_edit_workspace(workspace_id));
create policy partner_transfers_delete on public.partner_transfers for delete to authenticated using(private.can_edit_workspace(workspace_id));
