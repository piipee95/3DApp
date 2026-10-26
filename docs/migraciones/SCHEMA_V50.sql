-- KultiApp 5.0. Reference of the deployment migrations kultiapp_v50_failure_indexes and
-- kultiapp_v50_retire_old_save_rpcs; do not re-run.
-- Foreign keys of print_failures get their indexes (Supabase performance advisor).
create index if not exists print_failures_printer on public.print_failures(printer_id);
create index if not exists print_failures_product on public.print_failures(product_id);
create index if not exists print_failures_resource on public.print_failures(resource_id);
-- The app only uses save_product_bundle_v5: the older versions can no longer be called (kept, not dropped).
revoke execute on function public.save_product_bundle(uuid, uuid, text, text, integer, boolean, numeric, numeric, integer, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.save_product_bundle_v2(uuid, uuid, text, text, integer, boolean, numeric, numeric, integer, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.save_product_bundle_v3(uuid, uuid, text, text, integer, boolean, numeric, numeric, integer, jsonb, jsonb, text, numeric) from public, anon, authenticated;
revoke execute on function public.save_product_bundle_v4(uuid, uuid, text, text, integer, boolean, numeric, numeric, integer, jsonb, jsonb, text, numeric, jsonb) from public, anon, authenticated;
