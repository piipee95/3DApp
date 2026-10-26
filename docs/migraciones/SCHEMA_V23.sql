-- V2.3: private customer originals, scoped anonymous upload capabilities.
create table public.customer_file_requests(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 order_id uuid references public.production_orders(id) on delete set null,
 label text not null check(length(trim(label)) between 1 and 160),
 access_token text not null unique default (replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')),
 expires_at timestamptz not null default now()+interval '48 hours',revoked boolean not null default false,
 submitted_at timestamptz,reviewed_at timestamptz,created_at timestamptz not null default now()
);
create index customer_file_requests_workspace on public.customer_file_requests(workspace_id,created_at desc);
create index customer_file_requests_order on public.customer_file_requests(order_id);
alter table public.customer_file_requests enable row level security;
revoke all on public.customer_file_requests from public,anon,authenticated;
grant select on public.customer_file_requests to authenticated;
grant insert(workspace_id,order_id,label),update(revoked,reviewed_at) on public.customer_file_requests to authenticated;
create policy customer_requests_read on public.customer_file_requests for select to authenticated using(private.is_workspace_member(workspace_id));
create policy customer_requests_insert on public.customer_file_requests for insert to authenticated with check(private.can_edit_workspace(workspace_id) and expires_at>now() and expires_at<=created_at+interval '48 hours' and (order_id is null or exists(select 1 from public.production_orders o where o.id=order_id and o.workspace_id=customer_file_requests.workspace_id)));
create policy customer_requests_update on public.customer_file_requests for update to authenticated using(private.can_edit_workspace(workspace_id)) with check(private.can_edit_workspace(workspace_id));
create table public.customer_files(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.customer_file_requests(id),
 workspace_id uuid not null references public.workspaces(id),object_path text not null unique,
 original_name text not null,customer_name text not null,note text not null default '',
 mime_type text not null,byte_size bigint not null check(byte_size between 1 and 52428800),
 received_at timestamptz,created_at timestamptz not null default now()
);
create index customer_files_workspace on public.customer_files(workspace_id);
create index customer_files_request on public.customer_files(request_id);
alter table public.customer_files enable row level security;
revoke all on public.customer_files from public,anon,authenticated;
grant select on public.customer_files to authenticated;
create policy customer_files_read on public.customer_files for select to authenticated using(private.is_workspace_member(workspace_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('customer-originals','customer-originals',false,52428800,array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif','image/tiff','image/bmp','image/gif']);

-- Private implementation; tokens authenticate this intentionally public submission flow.
grant usage on schema private to anon;
create function private.customer_upload(p_action text,p_token text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.customer_file_requests;f public.customer_files;meta jsonb;mime text;ext text;sz bigint;path text;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Enlace no disponible';end if;
 select * into r from public.customer_file_requests where access_token=p_token for update;
 if not found or r.revoked or r.expires_at<=now() then raise exception 'El enlace venció o fue desactivado. Pide uno nuevo a Kultiverso Pop.';end if;
 if p_action='info' then return jsonb_build_object('label',r.label,'received',r.submitted_at is not null,'expires_at',r.expires_at);end if;
 if r.submitted_at is not null then
  if p_action='complete' then return jsonb_build_object('received',true);end if;
  raise exception 'Las fotos de este enlace ya fueron recibidas';
 end if;
 if p_action='begin' then
  if (select count(*) from public.customer_files where request_id=r.id)>=5 then raise exception 'Este enlace admite hasta 5 fotos. Pide otro enlace si necesitas enviar más.';end if;
  if length(trim(coalesce(p_input->>'customer_name',''))) not between 1 and 120 or length(coalesce(p_input->>'note',''))>1500 or length(coalesce(p_input->>'name','')) not between 1 and 180 then raise exception 'Revisa tu nombre y los datos del archivo';end if;
  sz:=(p_input->>'size')::bigint;mime:=p_input->>'mime';
  if sz is null or sz not between 1 and 52428800 then raise exception 'Cada foto debe pesar entre 1 byte y 50 MB';end if;
  ext:=case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'image/heic' then 'heic' when 'image/heif' then 'heif' when 'image/avif' then 'avif' when 'image/tiff' then 'tif' when 'image/bmp' then 'bmp' when 'image/gif' then 'gif' else null end;
  if ext is null then raise exception 'Formato no permitido. Usa JPG, PNG, HEIC/HEIF, WebP, AVIF, TIFF, BMP o GIF.';end if;
  -- The random object path is a per-file upload capability, not the request token.
  path:=r.workspace_id::text||'/'||r.id::text||'/'||replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')||'.'||ext;
  insert into public.customer_files(request_id,workspace_id,object_path,original_name,customer_name,note,mime_type,byte_size) values(r.id,r.workspace_id,path,p_input->>'name',trim(p_input->>'customer_name'),coalesce(p_input->>'note',''),mime,sz) returning * into f;
  return jsonb_build_object('id',f.id,'path',f.object_path);
 elsif p_action='finalize' then
  select * into f from public.customer_files where id=(p_input->>'id')::uuid and request_id=r.id for update;
  if not found then raise exception 'Archivo no disponible';end if;
  select metadata into meta from storage.objects where bucket_id='customer-originals' and name=f.object_path;
  if meta is null or coalesce((meta->>'size')::bigint,0)<>f.byte_size or coalesce(meta->>'mimetype','')<>f.mime_type then raise exception 'El archivo no se terminó de cargar. Reintenta el envío.';end if;
  update public.customer_files set received_at=coalesce(received_at,now()) where id=f.id;
  return jsonb_build_object('received',true);
 elsif p_action='complete' then
  if not exists(select 1 from public.customer_files where request_id=r.id and received_at is not null) then raise exception 'Primero carga una foto';end if;
  update public.customer_file_requests set submitted_at=now() where id=r.id;
  return jsonb_build_object('received',true);
 end if;
 raise exception 'Operación no disponible';
end;$$;
revoke all on function private.customer_upload(text,text,jsonb) from public;
grant execute on function private.customer_upload(text,text,jsonb) to anon,authenticated;
create function public.customer_upload(p_action text,p_token text,p_input jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.customer_upload(p_action,p_token,p_input);$$;
revoke all on function public.customer_upload(text,text,jsonb) from public;
grant execute on function public.customer_upload(text,text,jsonb) to anon,authenticated;

create function private.can_upload_customer_original(p_path text) returns boolean language sql security definer stable set search_path='' as $$
 select exists(select 1 from public.customer_files f join public.customer_file_requests r on r.id=f.request_id where f.object_path=p_path and f.received_at is null and not r.revoked and r.submitted_at is null and r.expires_at>now());
$$;
revoke all on function private.can_upload_customer_original(text) from public;
grant execute on function private.can_upload_customer_original(text) to anon,authenticated;
create policy customer_original_upload on storage.objects for insert to anon,authenticated with check(bucket_id='customer-originals' and private.can_upload_customer_original(name));
create policy customer_original_read on storage.objects for select to authenticated using(bucket_id='customer-originals' and exists(select 1 from public.customer_files f where f.object_path=name and f.received_at is not null and private.is_workspace_member(f.workspace_id)));
