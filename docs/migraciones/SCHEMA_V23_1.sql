-- V2.3.1: archive/restore and retryable deletion of customer upload requests.
alter table public.customer_file_requests add column archived_at timestamptz,
 add column deleting_at timestamptz;

-- Keep archived/deleting links closed even if an older client updates revoked.
drop policy customer_requests_update on public.customer_file_requests;
create policy customer_requests_update on public.customer_file_requests for update to authenticated
 using(private.can_edit_workspace(workspace_id))
 with check(private.can_edit_workspace(workspace_id) and
   ((archived_at is null and deleting_at is null) or revoked));

create function private.manage_customer_file_request(p_id uuid,p_action text) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare r public.customer_file_requests; paths jsonb;
begin
 select * into r from public.customer_file_requests where id=p_id for update;
 if not found or auth.uid() is null or not coalesce(private.can_edit_workspace(r.workspace_id),false) then
  raise exception 'No tienes permisos para modificar esta solicitud';
 end if;
 if p_action='archive' and r.deleting_at is null then
  update public.customer_file_requests set archived_at=coalesce(archived_at,now()),revoked=true where id=r.id;
 elsif p_action='restore' and r.deleting_at is null then
  -- Restoring never reopens an old upload link.
  update public.customer_file_requests set archived_at=null where id=r.id;
 elsif p_action='delete_start' then
  update public.customer_file_requests set deleting_at=coalesce(deleting_at,now()),revoked=true where id=r.id;
  select coalesce(jsonb_agg(object_path),'[]'::jsonb) into paths from public.customer_files where request_id=r.id;
  return jsonb_build_object('paths',paths);
 elsif p_action='delete_finish' and r.deleting_at is not null then
  -- The browser must delete the actual blobs with the Storage API first.
  if exists(select 1 from storage.objects o join public.customer_files f on f.object_path=o.name
    where o.bucket_id='customer-originals' and f.request_id=r.id) then
   raise exception 'Quedan archivos por borrar. Reintenta la eliminación.';
  end if;
  delete from public.customer_files where request_id=r.id;
  delete from public.customer_file_requests where id=r.id;
 else
  raise exception 'Acción no disponible';
 end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function private.manage_customer_file_request(uuid,text) from public,anon,authenticated;
grant execute on function private.manage_customer_file_request(uuid,text) to authenticated;
create function public.manage_customer_file_request(p_id uuid,p_action text) returns jsonb
 language sql security invoker set search_path='' as $$
 select private.manage_customer_file_request(p_id,p_action);
$$;
revoke all on function public.manage_customer_file_request(uuid,text) from public,anon,authenticated;
grant execute on function public.manage_customer_file_request(uuid,text) to authenticated;

-- Includes unfinished upload slots so an interrupted upload can also be cleaned up.
create policy customer_original_delete_read on storage.objects for select to authenticated
 using(bucket_id='customer-originals' and exists(
  select 1 from public.customer_files f join public.customer_file_requests r on r.id=f.request_id
  where f.object_path=name and r.deleting_at is not null and private.can_edit_workspace(r.workspace_id)));
create policy customer_original_delete on storage.objects for delete to authenticated
 using(bucket_id='customer-originals' and exists(
  select 1 from public.customer_files f join public.customer_file_requests r on r.id=f.request_id
  where f.object_path=name and r.deleting_at is not null and private.can_edit_workspace(r.workspace_id)));
