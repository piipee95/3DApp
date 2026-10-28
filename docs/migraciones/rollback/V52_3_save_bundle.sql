-- Reference only: original production v5 definition captured before the proposed repair.
-- Reversion reference only. Do not execute automatically: this restores the broken legacy dependency.
CREATE OR REPLACE FUNCTION public.save_product_bundle_v5(p_product_id uuid, p_workspace_id uuid, p_name text, p_description text, p_quantity integer, p_iva_enabled boolean, p_iva_rate numeric, p_target_margin numeric, p_round_to integer, p_prints jsonb, p_costs jsonb, p_photo_path text, p_sale_price numeric, p_materials jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v uuid;
begin
 if p_photo_path is not null and split_part(p_photo_path,'/',1)<>p_workspace_id::text then raise exception 'Foto fuera del equipo';end if;
 v:=public.save_product_bundle_v4(p_product_id,p_workspace_id,p_name,p_description,p_quantity,p_iva_enabled,p_iva_rate,p_target_margin,p_round_to,p_prints,p_costs,null,p_sale_price,p_materials);
 update public.products set photo_path=p_photo_path,photo_data=null where id=v and workspace_id=p_workspace_id;
 return v;
end;$function$;
