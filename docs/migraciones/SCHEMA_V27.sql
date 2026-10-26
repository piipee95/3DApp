-- KultiApp V2.7: client error log, so failures seen by any team member can be reviewed later.
-- Reference of the deployment migration kultiapp_v27_app_errors; do not re-run.
create table public.app_errors(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid references public.workspaces(id) on delete cascade,
 user_id uuid not null default auth.uid(),
 kind text not null check(kind in ('error','rejection','handled')),
 message text not null check(length(message) between 1 and 1000),
 stack text not null default '' check(length(stack) <= 4000),
 screen text not null default '' check(length(screen) <= 40),
 app_version text not null default '' check(length(app_version) <= 20),
 user_agent text not null default '' check(length(user_agent) <= 300),
 created_at timestamptz not null default now()
);
create index app_errors_workspace on public.app_errors(workspace_id, created_at desc);
alter table public.app_errors enable row level security;
revoke all on public.app_errors from anon, authenticated;
grant select on public.app_errors to authenticated;
grant insert(workspace_id, kind, message, stack, screen, app_version, user_agent) on public.app_errors to authenticated;
create policy app_errors_insert on public.app_errors for insert to authenticated
 with check(user_id = (select auth.uid()) and (workspace_id is null or private.is_workspace_member(workspace_id)));
create policy app_errors_read on public.app_errors for select to authenticated
 using(workspace_id is not null and private.is_workspace_member(workspace_id));
