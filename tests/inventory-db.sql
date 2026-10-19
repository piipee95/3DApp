-- Runs with execute_sql as postgres. All fixtures are rolled back.
begin;
do $$ declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();z uuid:=gen_random_uuid();begin
 insert into auth.users(id) values(u),(v);
 insert into public.workspaces(id,name,owner_id) values(w,'Inventory rollback test',u),(z,'Other rollback test',v);
 insert into public.workspace_members(workspace_id,user_id,role) values(w,u,'owner'),(w,v,'viewer'),(z,v,'owner');
 perform set_config('test.owner',u::text,true);perform set_config('test.viewer',v::text,true);perform set_config('test.workspace',w::text,true);perform set_config('test.other',z::text,true);
 perform set_config('request.jwt.claim.sub',u::text,true);
end $$;
set local role authenticated;
do $$
declare w uuid:=current_setting('test.workspace')::uuid;f uuid;m uuid;p uuid;o uuid;c uuid;stock numeric;denied boolean;
begin
 insert into public.workspace_resources(workspace_id,kind,name,price_per_kg) values(w,'filament','Test PLA',10000) returning id into f;
 insert into public.workspace_resources(workspace_id,kind,name,unit,unit_cost) values(w,'supply','Test frame','un',100) returning id into m;
 insert into public.inventory_movements(workspace_id,resource_id,kind,quantity,unit_cost,note,request_key) values(w,f,'opening',1000,10,'initial',gen_random_uuid()),(w,m,'opening',20,100,'initial',gen_random_uuid());
 insert into public.inventory_movements(workspace_id,resource_id,kind,quantity,unit_cost,note,request_key) values(w,f,'purchase',1000,20,'purchase',gen_random_uuid());
 if (select unit_cost from public.workspace_resources where id=f)<>15 then raise exception 'weighted average failed';end if;
 p:=public.save_product_bundle_v4(null,w,'Test product','',2,true,.19,.3,1000,jsonb_build_array(jsonb_build_object('print_no',1,'grams',100,'filament_cost',1000,'filaments',jsonb_build_array(jsonb_build_object('resource_id',f,'grams',100,'purge_grams',0,'price_per_kg',10000)))),'[]',null,null,jsonb_build_array(jsonb_build_object('resource_id',m,'quantity',2,'unit_cost',100)));
 if (select count(*) from public.cost_items where product_id=p and inventory_material)<>1 then raise exception 'recipe cost row missing';end if;
 insert into public.production_orders(workspace_id,product_id,title,quantity,unit_price,estimated_cost) values(w,p,'Test order',4,3000,2400) returning id into o;
 if (select inventory_state from public.production_orders where id=o)<>'reserved' or (select reserved_qty from public.workspace_resources where id=f)<>200 then raise exception 'reservation failed';end if;
 if (select unit_cost from public.inventory_order_lines where order_id=o and resource_id=f)<>10 then raise exception 'snapshot cost changed';end if;
 denied:=false;begin
  insert into public.production_orders(workspace_id,product_id,title,quantity,unit_price,estimated_cost) values(w,p,'Overbook',1000,3000,1);
 exception when others then denied:=true;end;if not denied then raise exception 'overbooking allowed';end if;
 denied:=false;begin
  insert into public.inventory_movements(workspace_id,resource_id,kind,quantity,unit_cost,request_key) values(w,f,'loss',-1900,0,gen_random_uuid());
 exception when others then denied:=true;end;if not denied then raise exception 'reserved stock lost';end if;
 perform public.inventory_consume_order(o,jsonb_build_object(f::text,220,m::text,5));
 if (select stock_qty from public.workspace_resources where id=f)<>1780 or (select reserved_qty from public.workspace_resources where id=f)<>0 or (select actual_cost from public.production_orders where id=o)<>3800 then raise exception 'actual consumption/cost failed';end if;
 perform public.inventory_consume_order(o,'{}');
 if (select stock_qty from public.workspace_resources where id=f)<>1780 then raise exception 'double consumption';end if;
 insert into public.production_orders(workspace_id,product_id,title,quantity,unit_price,estimated_cost) values(w,p,'Cancel test',2,3000,1200) returning id into c;
 update public.production_orders set status='canceled' where id=c;
 if (select reserved_qty from public.workspace_resources where id=f)<>0 or (select stock_qty from public.workspace_resources where id=f)<>1780 then raise exception 'cancellation failed';end if;
 insert into public.production_orders(workspace_id,product_id,title,quantity,unit_price,estimated_cost) values(w,p,'Auto consume',2,3000,1200) returning id into c;
 update public.production_orders set status='ready' where id=c;
 update public.production_orders set status='delivered' where id=c;
 if (select stock_qty from public.workspace_resources where id=f)<>1680 then raise exception 'ready/delivered double or missing consumption';end if;
 denied:=false;begin update public.workspace_resources set stock_qty=999999 where id=f;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'direct balance edit allowed';end if;
 denied:=false;begin insert into public.inventory_movements(workspace_id,resource_id,kind,quantity,unit_cost,request_key) values(w,f,'consumption',-1,0,gen_random_uuid());exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'direct consumption allowed';end if;
 denied:=false;begin update public.inventory_order_lines set quantity=1 where order_id=o;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'reservation edit allowed';end if;
 denied:=false;begin insert into public.workspace_resources(workspace_id,kind,name) values(current_setting('test.other')::uuid,'supply','Cross team');exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'cross workspace insert allowed';end if;
 perform set_config('test.material',f::text,true);perform set_config('test.order',o::text,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.viewer'),true);
do $$ declare denied boolean:=false;begin
 if (select count(*) from public.inventory_movements where workspace_id=current_setting('test.workspace')::uuid)=0 then raise exception 'viewer cannot read';end if;
 begin insert into public.inventory_movements(workspace_id,resource_id,kind,quantity,unit_cost,request_key) values(current_setting('test.workspace')::uuid,current_setting('test.material')::uuid,'loss',-1,0,gen_random_uuid());exception when others then denied:=true;end;if not denied then raise exception 'viewer wrote movement';end if;
 denied:=false;begin perform public.inventory_consume_order(current_setting('test.order')::uuid,null);exception when others then denied:=true;end;if not denied then raise exception 'viewer consumed';end if;
end $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$ begin if exists(select 1 from public.inventory_movements) or exists(select 1 from public.inventory_order_lines) then raise exception 'outsider saw inventory';end if;end $$;
set local role anon;
do $$ declare denied boolean:=false;begin begin perform * from public.inventory_movements;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'anonymous inventory access';end if;end $$;
rollback;
select 'PASS: weighted costs, recipe snapshots, reservations, shortages, actual/automatic/idempotent consumption, cancellation and role isolation; all fixtures rolled back' as result;
