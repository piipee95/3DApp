-- KultiApp V3.0: quick price lists for custom work (sizes + extras).
-- Reference of the deployment migration kultiapp_v30_price_lists; do not re-run.
create table public.price_lists(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 80),
 iva_enabled boolean not null default true,
 sizes jsonb not null default '[]'::jsonb check(jsonb_typeof(sizes) = 'array' and jsonb_array_length(sizes) between 1 and 20),
 extras jsonb not null default '[]'::jsonb check(jsonb_typeof(extras) = 'array' and jsonb_array_length(extras) <= 20),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index price_lists_workspace on public.price_lists(workspace_id, name);
alter table public.price_lists enable row level security;
revoke all on public.price_lists from anon, authenticated;
grant select, delete on public.price_lists to authenticated;
grant insert(workspace_id, name, iva_enabled, sizes, extras, active) on public.price_lists to authenticated;
grant update(name, iva_enabled, sizes, extras, active, updated_at) on public.price_lists to authenticated;
create policy price_lists_read on public.price_lists for select to authenticated using(private.is_workspace_member(workspace_id));
create policy price_lists_insert on public.price_lists for insert to authenticated with check(private.can_edit_workspace(workspace_id));
create policy price_lists_update on public.price_lists for update to authenticated
 using(private.can_edit_workspace(workspace_id)) with check(private.can_edit_workspace(workspace_id));
create policy price_lists_delete on public.price_lists for delete to authenticated using(private.can_edit_workspace(workspace_id));
