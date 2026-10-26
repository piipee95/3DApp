-- KultiApp V3.6: deleting a material or printer hides it for good; the row stays so past history keeps its source.
-- Reference of the deployment migration kultiapp_v36_resource_deleted_at; do not re-run.
alter table public.workspace_resources add column deleted_at timestamptz;
grant update(deleted_at) on public.workspace_resources to authenticated;
