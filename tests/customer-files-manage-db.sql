-- Isolated fixtures, rolled back. Never deletes real Storage objects via SQL.
begin;
do $$declare u uuid:=gen_random_uuid();v uuid:=gen_random_uuid();w uuid:=gen_random_uuid();begin
 insert into auth.users(id) values(u),(v);
 insert into public.workspaces(id,name,owner_id) values(w,'Archive deletion rollback test',u);
 insert into public.workspace_members(workspace_id,user_id,role) values(w,u,'owner'),(w,v,'viewer');
 perform set_config('test.owner',u::text,true);perform set_config('test.viewer',v::text,true);
 perform set_config('test.workspace',w::text,true);perform set_config('request.jwt.claim.sub',u::text,true);
end $$;
set local role authenticated;
do $$declare r public.customer_file_requests;begin
 insert into public.customer_file_requests(workspace_id,label) values(current_setting('test.workspace')::uuid,'Originals test') returning * into r;
 perform set_config('test.request',r.id::text,true);perform set_config('test.token',r.access_token,true);
end $$;
set local role anon;
do $$declare slot jsonb;denied boolean:=false;begin
 slot:=public.customer_upload('begin',current_setting('test.token'),'{"name":"original.HEIC","mime":"image/heic","size":100,"customer_name":"Test client"}');
 perform set_config('test.path',slot->>'path',true);
 insert into storage.objects(bucket_id,name,metadata) values('customer-originals',slot->>'path','{"size":100,"mimetype":"image/heic"}');
 -- Leave this slot unfinished: deletion must clean up interrupted submissions too.
 begin perform public.manage_customer_file_request(current_setting('test.request')::uuid,'delete_start');exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous management permitted';end if;
end $$;
set local role authenticated;
do $$declare denied boolean:=false;begin
 perform public.manage_customer_file_request(current_setting('test.request')::uuid,'archive');
 if not exists(select 1 from public.customer_file_requests where id=current_setting('test.request')::uuid and archived_at is not null and revoked) then raise exception 'Archive failed';end if;
 begin update public.customer_file_requests set revoked=false where id=current_setting('test.request')::uuid;exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Archived link reactivated';end if;
 if not exists(select 1 from public.customer_files where request_id=current_setting('test.request')::uuid) then raise exception 'Archive removed files';end if;
 perform public.manage_customer_file_request(current_setting('test.request')::uuid,'restore');
 if not exists(select 1 from public.customer_file_requests where id=current_setting('test.request')::uuid and archived_at is null and revoked) then raise exception 'Restore reopened link';end if;
end $$;
set local role anon;
do $$declare denied boolean:=false;begin
 begin perform public.customer_upload('info',current_setting('test.token'));exception when others then denied:=true;end;
 if not denied or private.can_upload_customer_original(current_setting('test.path')) then raise exception 'Archived/restored upload reopened';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.viewer'),true);
do $$declare action text;denied boolean;begin
 foreach action in array array['archive','restore','delete_start','delete_finish'] loop
  denied:=false;begin perform public.manage_customer_file_request(current_setting('test.request')::uuid,action);exception when others then denied:=true;end;
  if not denied then raise exception 'Viewer allowed %',action;end if;
 end loop;
end $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$declare denied boolean:=false;begin
 begin perform public.manage_customer_file_request(current_setting('test.request')::uuid,'delete_start');exception when others then denied:=true;end;
 if not denied then raise exception 'Outsider allowed deletion';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.owner'),true);
do $$declare result jsonb;denied boolean:=false;empty_id uuid;begin
 result:=public.manage_customer_file_request(current_setting('test.request')::uuid,'delete_start');
 if result->'paths'->>0<>current_setting('test.path') then raise exception 'Missing unfinished original path';end if;
 if not exists(select 1 from storage.objects where bucket_id='customer-originals' and name=current_setting('test.path')) then raise exception 'Cannot select pending original for Storage deletion';end if;
 begin perform public.manage_customer_file_request(current_setting('test.request')::uuid,'delete_finish');exception when others then denied:=true;end;
 if not denied then raise exception 'Metadata deleted while original remains';end if;
 perform public.manage_customer_file_request(current_setting('test.request')::uuid,'delete_start');
 insert into public.customer_file_requests(workspace_id,label) values(current_setting('test.workspace')::uuid,'Empty request') returning id into empty_id;
 perform public.manage_customer_file_request(empty_id,'delete_start');
 perform public.manage_customer_file_request(empty_id,'delete_finish');
 if exists(select 1 from public.customer_file_requests where id=empty_id) then raise exception 'Empty request not deleted';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.viewer'),true);
do $$begin
 if exists(select 1 from storage.objects where bucket_id='customer-originals' and name=current_setting('test.path')) then raise exception 'Viewer obtained pending original deletion access';end if;
end $$;
rollback;
select 'PASS: archive/restore preserve originals and close links; guest/viewer/outsider denied; pending originals cleanup access scoped to editor; cannot finish before Storage cleanup; empty request deletion and retry verified; rollback complete' as result;
