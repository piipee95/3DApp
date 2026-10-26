-- KultiApp 5.1: «Kit de marca». Reference of the deployment migration kultiapp_v51_brand_kit; do not re-run.
-- Official graphic resources of the team: originals in a private bucket, metadata in brand_assets.
-- Members read and download; owners and editors manage (same rules as the rest of the workspace).

create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category text not null check (category in ('logos', 'business_cards', 'thanks', 'social', 'labels', 'app_web', 'other')),
  name text not null check (length(trim(name)) between 1 and 160),
  description text not null default '' check (length(description) <= 1000),
  usage text not null default '' check (length(usage) <= 500),
  copy_text text not null default '' check (length(copy_text) <= 4000),
  background text check (background in ('light', 'dark', 'transparent')),
  object_path text not null unique check (object_path ~ '^[0-9a-f-]{36}/brand/[0-9a-f-]{36}\.(png|jpg|webp|svg|pdf|zip)$'),
  original_name text not null check (length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf', 'application/zip')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  width integer check (width > 0 and width <= 100000),
  height integer check (height > 0 and height <= 100000),
  official boolean not null default false,
  favorite boolean not null default false,
  group_id uuid not null default gen_random_uuid(),
  variant_label text not null default '' check (length(variant_label) <= 80),
  is_current boolean not null default true,
  archived_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The object must live in this workspace's folder.
  check (split_part(object_path, '/', 1) = workspace_id::text)
);
create index brand_assets_workspace on public.brand_assets(workspace_id, category);
create index brand_assets_group on public.brand_assets(group_id);
-- One current version per design.
create unique index brand_assets_one_current on public.brand_assets(group_id) where is_current;

alter table public.brand_assets enable row level security;
revoke all on public.brand_assets from anon, authenticated;
grant select, delete on public.brand_assets to authenticated;
grant insert (workspace_id, category, name, description, usage, copy_text, background, object_path, original_name, mime_type, byte_size, width, height, official, favorite, group_id, variant_label, is_current)
  on public.brand_assets to authenticated;
grant update (category, name, description, usage, copy_text, background, official, favorite, variant_label, is_current, archived_at, updated_at)
  on public.brand_assets to authenticated;
create policy brand_assets_read on public.brand_assets for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy brand_assets_insert on public.brand_assets for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and created_by = auth.uid());
create policy brand_assets_update on public.brand_assets for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));
create policy brand_assets_remove on public.brand_assets for delete to authenticated
  using (private.can_edit_workspace(workspace_id));

-- Originals, untouched (no transformation), up to the free plan's 50 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('brand-assets', 'brand-assets', false, 52428800,
    array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf', 'application/zip']);
create policy brand_assets_files_read on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets' and private.is_workspace_member(private.photo_workspace(name)));
create policy brand_assets_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets' and private.can_edit_workspace(private.photo_workspace(name)));
create policy brand_assets_files_remove on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets' and private.can_edit_workspace(private.photo_workspace(name)));

-- Real storage use, for the limits shown in the app: this team's kit and the whole project
-- (the free plan's 1 GB is shared by every bucket). Only totals, never file names.
create function private.brand_storage_usage(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_workspace_member(p_workspace) then raise exception 'Sin permiso';end if;
  return jsonb_build_object(
    'kit', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects
             where bucket_id = 'brand-assets' and private.photo_workspace(name) = p_workspace),
    'project', (select coalesce(sum((metadata->>'size')::bigint), 0) from storage.objects));
end;$$;
revoke all on function private.brand_storage_usage(uuid) from public, anon;
grant execute on function private.brand_storage_usage(uuid) to authenticated;
create function public.brand_storage_usage(p_workspace uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  return private.brand_storage_usage(p_workspace);
end;$$;
revoke all on function public.brand_storage_usage(uuid) from public, anon;
grant execute on function public.brand_storage_usage(uuid) to authenticated;
