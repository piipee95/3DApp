-- Product photos in Storage. Reference of the deployment migration; do not re-run.
alter table public.products add column photo_path text
 check(photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('product-photos','product-photos',false,1048576,array['image/jpeg']);

-- Objects live at <workspace_id>/<random uuid>.jpg; the first folder decides access.
create function private.photo_workspace(object_name text) returns uuid language plpgsql stable set search_path='' as $$
begin
 return (storage.foldername(object_name))[1]::uuid;
exception when others then return null;
end;$$;
revoke all on function private.photo_workspace(text) from public,anon;
grant execute on function private.photo_workspace(text) to authenticated;

create policy product_photos_read on storage.objects for select to authenticated
 using(bucket_id='product-photos' and private.is_workspace_member(private.photo_workspace(name)));
create policy product_photos_insert on storage.objects for insert to authenticated
 with check(bucket_id='product-photos' and private.can_edit_workspace(private.photo_workspace(name)));
create policy product_photos_update on storage.objects for update to authenticated
 using(bucket_id='product-photos' and private.can_edit_workspace(private.photo_workspace(name)))
 with check(bucket_id='product-photos' and private.can_edit_workspace(private.photo_workspace(name)));
create policy product_photos_delete on storage.objects for delete to authenticated
 using(bucket_id='product-photos' and private.can_edit_workspace(private.photo_workspace(name)));

-- Shared quotation defaults; the existing settings policies limit writes to editors.
alter table public.workspace_settings
 add column quote_contact text not null default '' check(length(quote_contact)<=300),
 add column quote_terms text not null default 'Valores en pesos chilenos. Despacho no incluido. Disponibilidad y plazo de producción sujetos a confirmación.' check(length(quote_terms)<=1000),
 add column quote_delivery text not null default '' check(length(quote_delivery)<=200),
 add column quote_validity_days integer not null default 15 check(quote_validity_days between 1 and 365);

-- V5 stores a Storage path and clears the legacy inline photo in the same transaction.
create function public.save_product_bundle_v5(p_product_id uuid,p_workspace_id uuid,p_name text,p_description text,p_quantity integer,p_iva_enabled boolean,p_iva_rate numeric,p_target_margin numeric,p_round_to integer,p_prints jsonb,p_costs jsonb,p_photo_path text,p_sale_price numeric,p_materials jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v uuid;
begin
 if p_photo_path is not null and split_part(p_photo_path,'/',1)<>p_workspace_id::text then raise exception 'Foto fuera del equipo';end if;
 v:=public.save_product_bundle_v4(p_product_id,p_workspace_id,p_name,p_description,p_quantity,p_iva_enabled,p_iva_rate,p_target_margin,p_round_to,p_prints,p_costs,null,p_sale_price,p_materials);
 update public.products set photo_path=p_photo_path,photo_data=null where id=v and workspace_id=p_workspace_id;
 return v;
end;$$;
revoke all on function public.save_product_bundle_v5(uuid,uuid,text,text,integer,boolean,numeric,numeric,integer,jsonb,jsonb,text,numeric,jsonb) from public,anon;
grant execute on function public.save_product_bundle_v5(uuid,uuid,text,text,integer,boolean,numeric,numeric,integer,jsonb,jsonb,text,numeric,jsonb) to authenticated;

-- Migration kultiapp_v15_quote_contact_default: official contact from the business card.
alter table public.workspace_settings alter column quote_contact set default 'kultiversopop.cl · WhatsApp +56 9 4840 6731 · @kultiversopop';
update public.workspace_settings set quote_contact='kultiversopop.cl · WhatsApp +56 9 4840 6731 · @kultiversopop' where quote_contact='';
