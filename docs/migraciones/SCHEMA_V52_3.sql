-- Reference of deployed migration kultiapp_v523_inline_save_bundle_chain; do not re-run.
-- Repair save_product_bundle_v5 without changing its signature, ACL, invoker mode or RLS.
-- Inlined from the deployed v1-v5 bodies in their existing execution order.
CREATE OR REPLACE FUNCTION public.save_product_bundle_v5(p_product_id uuid, p_workspace_id uuid, p_name text, p_description text, p_quantity integer, p_iva_enabled boolean, p_iva_rate numeric, p_target_margin numeric, p_round_to integer, p_prints jsonb, p_costs jsonb, p_photo_path text, p_sale_price numeric, p_materials jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
declare
 v_product_id uuid;
 j jsonb; f jsonb; items jsonb; normalized jsonb := '[]'::jsonb; grams numeric; cost numeric;
 m jsonb; r public.workspace_resources; normalized_materials jsonb := '[]';
 costs jsonb := coalesce(p_costs,'[]'); i integer := 0;
begin

 if p_photo_path is not null and split_part(p_photo_path,'/',1)<>p_workspace_id::text then raise exception 'Foto fuera del equipo';end if;
 if auth.uid() is null or not private.can_edit_workspace(p_workspace_id) then raise exception 'Sin permiso de producto';end if;
 if jsonb_typeof(p_materials)<>'array' or jsonb_array_length(p_materials)>100 then raise exception 'Lista de materiales inválida';end if;
 for m in select value from jsonb_array_elements(p_materials) loop
  select * into r from public.workspace_resources where id=(m->>'resource_id')::uuid and workspace_id=p_workspace_id and kind='supply';
  if not found or not ((m->>'quantity')::numeric between 0 and 1000000000) or not ((m->>'unit_cost')::numeric between 0 and 1000000000) then raise exception 'Material o cantidad inválidos';end if;
  normalized_materials:=normalized_materials||jsonb_build_array(jsonb_build_object('resource_id',r.id,'name',r.name,'unit',r.unit,'quantity',(m->>'quantity')::numeric,'unit_cost',(m->>'unit_cost')::numeric));
  costs:=costs||jsonb_build_array(jsonb_build_object('name',r.name,'amount',round((m->>'quantity')::numeric*(m->>'unit_cost')::numeric,2),'category','direct','sort_order',100000+i));i:=i+1;
 end loop;
 for j in select value from jsonb_array_elements(p_prints) loop
  for f in select value from jsonb_array_elements(coalesce(j->'filaments','[]')) loop
   if nullif(f->>'resource_id','') is not null and not exists(select 1 from public.workspace_resources where id=(f->>'resource_id')::uuid and workspace_id=p_workspace_id and kind='filament') then raise exception 'Filamento fuera del equipo';end if;
  end loop;
 end loop;
 if p_sale_price<0 then raise exception 'Sale price cannot be negative';end if;
 if auth.uid() is null or not private.can_edit_workspace(p_workspace_id) then raise exception 'Insufficient workspace permissions'; end if;
 for j in select value from jsonb_array_elements(coalesce(p_prints,'[]'::jsonb)) loop
  items := coalesce(j->'filaments','[]'::jsonb);
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items)>7 then raise exception 'Maximum 7 filament colors per print'; end if;
  grams:=0;cost:=0;
  for f in select value from jsonb_array_elements(items) loop
   if coalesce((f->>'grams')::numeric,0)<0 or coalesce((f->>'purge_grams')::numeric,0)<0 or coalesce((f->>'price_per_kg')::numeric,0)<0 then raise exception 'Filament values cannot be negative'; end if;
   grams:=grams+coalesce((f->>'grams')::numeric,0)+coalesce((f->>'purge_grams')::numeric,0);
   cost:=cost+(coalesce((f->>'grams')::numeric,0)+coalesce((f->>'purge_grams')::numeric,0))*coalesce((f->>'price_per_kg')::numeric,0)/1000;
  end loop;
  if jsonb_array_length(items)>0 then j:=j || jsonb_build_object('grams',grams,'filament_cost',round(cost)); end if;
  normalized:=normalized || jsonb_build_array(j);
 end loop;
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not private.can_edit_workspace(p_workspace_id) then
    raise exception 'Insufficient workspace permissions';
  end if;

  if p_quantity is null or p_quantity < 1 then
    raise exception 'Quantity must be at least 1';
  end if;
  if p_iva_rate is null or p_iva_rate < 0 or p_iva_rate > 1 then
    raise exception 'Invalid IVA rate';
  end if;
  if p_target_margin is null or p_target_margin < 0 or p_target_margin >= 0.95 then
    raise exception 'Target margin must be between 0 and 0.95';
  end if;
  if p_round_to is null or p_round_to < 1 then
    raise exception 'Invalid rounding step';
  end if;

  if p_product_id is null then
    insert into public.products(
      workspace_id,name,description,quantity,iva_enabled,iva_rate,
      target_margin,round_to,status,created_by,updated_by
    )
    values(
      p_workspace_id,
      coalesce(nullif(trim(p_name),''),'Producto'),
      nullif(trim(p_description),''),
      p_quantity,
      coalesce(p_iva_enabled,true),
      p_iva_rate,
      p_target_margin,
      p_round_to,
      'active',
      auth.uid(),
      auth.uid()
    )
    returning id into v_product_id;
  else
    if not exists (
      select 1
      from public.products
      where id = p_product_id and workspace_id = p_workspace_id
    ) then
      raise exception 'Product not found in workspace';
    end if;

    update public.products
    set name = coalesce(nullif(trim(p_name),''),'Producto'),
        description = nullif(trim(p_description),''),
        quantity = p_quantity,
        iva_enabled = coalesce(p_iva_enabled,true),
        iva_rate = p_iva_rate,
        target_margin = p_target_margin,
        round_to = p_round_to,
        status = 'active',
        updated_by = auth.uid()
    where id = p_product_id;

    v_product_id := p_product_id;
  end if;

  delete from public.print_jobs where product_id = v_product_id;
  delete from public.cost_items where product_id = v_product_id;

  for j in
    select value from jsonb_array_elements(coalesce(normalized,'[]'::jsonb))
  loop
    insert into public.print_jobs(
      product_id,print_no,label,filament_cost,electricity_cost,
      other_print_cost,grams,hours,minutes,notes
    )
    values(
      v_product_id,
      coalesce((j->>'print_no')::integer,1),
      nullif(trim(j->>'label'),''),
      greatest(coalesce((j->>'filament_cost')::numeric,0),0),
      greatest(coalesce((j->>'electricity_cost')::numeric,0),0),
      greatest(coalesce((j->>'other_print_cost')::numeric,0),0),
      greatest(coalesce((j->>'grams')::numeric,0),0),
      greatest(coalesce((j->>'hours')::integer,0),0),
      least(greatest(coalesce((j->>'minutes')::integer,0),0),59),
      nullif(trim(j->>'notes'),'')
    );
  end loop;

  for j in
    select value from jsonb_array_elements(coalesce(costs,'[]'::jsonb))
  loop
    insert into public.cost_items(product_id,category,name,amount,sort_order)
    values(
      v_product_id,
      case when j->>'category' in ('direct','additional')
        then j->>'category' else 'direct' end,
      coalesce(nullif(trim(j->>'name'),''),'Costo'),
      greatest(coalesce((j->>'amount')::numeric,0),0),
      greatest(coalesce((j->>'sort_order')::integer,0),0)
    );
  end loop;

 update public.products set photo_data=null where id=v_product_id and workspace_id=p_workspace_id;
 for j in select value from jsonb_array_elements(normalized) loop
  update public.print_jobs set filaments=coalesce(j->'filaments','[]'::jsonb) where product_id=v_product_id and print_no=(j->>'print_no')::integer;
 end loop;
 update public.products set sale_price=p_sale_price where id=v_product_id and workspace_id=p_workspace_id;
 for j in select value from jsonb_array_elements(coalesce(p_prints,'[]'::jsonb)) loop
  update public.print_jobs set printer_name=nullif(j->>'printer_name',''),power_kw=nullif(j->>'power_kw','')::numeric where product_id=v_product_id and print_no=(j->>'print_no')::integer;
 end loop;
 update public.products set materials=normalized_materials where id=v_product_id;
 update public.cost_items set inventory_material=true where product_id=v_product_id and sort_order>=100000;
 update public.products set photo_path=p_photo_path,photo_data=null where id=v_product_id and workspace_id=p_workspace_id;

 return v_product_id;
end;
$function$;

