-- Isolated role/capability tests. No files or customer records persist.
begin;
do $$declare u uuid:=gen_random_uuid();w uuid:=gen_random_uuid();r uuid;t text;begin
 insert into auth.users(id) values(u);insert into public.workspaces(id,name,owner_id) values(w,'Customer files rollback test',u);insert into public.workspace_members(workspace_id,user_id,role) values(w,u,'owner');
 perform set_config('test.workspace',w::text,true);perform set_config('test.owner',u::text,true);perform set_config('request.jwt.claim.sub',u::text,true);
end $$;
set local role authenticated;
do $$declare r public.customer_file_requests;begin
 insert into public.customer_file_requests(workspace_id,label) values(current_setting('test.workspace')::uuid,'Private upload') returning * into r;
 if r.expires_at-r.created_at<>interval '48 hours' then raise exception 'Not 48 hours';end if;
 perform set_config('test.token',r.access_token,true);perform set_config('test.request',r.id::text,true);
end $$;
set local role anon;
do $$declare t text:=current_setting('test.token');slot jsonb;denied boolean:=false;begin
 if public.customer_upload('info',t)->>'label'<>'Private upload' then raise exception 'Missing metadata';end if;
 begin perform public.customer_upload('info',repeat('0',64));exception when others then denied:=true;end;if not denied then raise exception 'Guessed token accepted';end if;
 denied:=false;begin perform * from public.customer_file_requests;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Anonymous request listing';end if;
 slot:=public.customer_upload('begin',t,'{"name":"original.HEIC","mime":"image/heic","size":100,"customer_name":"Test client","note":"Keep original"}');
 perform set_config('test.path',slot->>'path',true);
 if not private.can_upload_customer_original(slot->>'path') or private.can_upload_customer_original('guess.jpg') then raise exception 'Upload path capability failed';end if;
 insert into storage.objects(bucket_id,name,metadata) values('customer-originals',slot->>'path','{"size":100,"mimetype":"image/heic"}');
 perform public.customer_upload('finalize',t,jsonb_build_object('id',slot->>'id'));
 perform public.customer_upload('complete',t);
 perform public.customer_upload('complete',t);
 if not (public.customer_upload('info',t)->>'received')::boolean then raise exception 'Not closed';end if;
 denied:=false;begin perform public.customer_upload('begin',t,'{"name":"another.jpg","mime":"image/jpeg","size":100,"customer_name":"Test"}');exception when others then denied:=true;end;if not denied then raise exception 'Reused link';end if;
 if private.can_upload_customer_original(slot->>'path') then raise exception 'Upload after completion';end if;
 denied:=false;begin perform * from public.customer_files;exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Anonymous file listing';end if;
 if exists(select 1 from storage.objects where bucket_id='customer-originals' and name=slot->>'path') then raise exception 'Anonymous download';end if;
end $$;
set local role authenticated;
do $$begin if not exists(select 1 from public.customer_files where request_id=current_setting('test.request')::uuid and received_at is not null) or not exists(select 1 from storage.objects where bucket_id='customer-originals' and name=current_setting('test.path')) then raise exception 'Owner cannot download original';end if;end $$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$begin if exists(select 1 from public.customer_files) or exists(select 1 from public.customer_file_requests) or exists(select 1 from storage.objects where bucket_id='customer-originals') then raise exception 'Cross workspace leak';end if;end $$;
reset role;
update public.customer_file_requests set expires_at=now()-interval '1 second' where id=current_setting('test.request')::uuid;
set local role anon;
do $$declare denied boolean:=false;begin begin perform public.customer_upload('info',current_setting('test.token'));exception when others then denied:=true;end;if not denied then raise exception 'Expired link allowed';end if;end $$;
rollback;
select 'PASS: server-enforced 48 hours, token/path capabilities, original metadata, single submission, expiry, private downloads and workspace isolation; rollback complete' as result;
