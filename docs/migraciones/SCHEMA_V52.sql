-- KultiApp 5.2: order state «Enviado» (shipped). Reference of the deployment migration
-- kultiapp_v52_shipped_status; do not re-run.
alter table public.production_orders drop constraint production_orders_status_check;
alter table public.production_orders add constraint production_orders_status_check
  check (status = any (array['pending','printing','assembly','ready','shipped','delivered','canceled']));
-- Inventory and finished-stock rules treat «shipped» like «ready» and «delivered» (materials consumed,
-- stock units delivered). The four functions were rewritten in place from their current definitions:
-- private.product_stock_order_trigger, private.inventory_order_trigger, private.link_order_product and
-- private.refresh_order_materials: every ('ready','delivered') became ('ready','shipped','delivered').
do $$
declare f record; def text;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in ('product_stock_order_trigger','inventory_order_trigger','link_order_product','refresh_order_materials')
  loop
    def := pg_get_functiondef(f.oid);
    def := replace(replace(def, $q$('ready','delivered')$q$, $q$('ready','shipped','delivered')$q$),
                   $q$('ready', 'delivered')$q$, $q$('ready', 'shipped', 'delivered')$q$);
    def := replace(def, 'Mantén el pedido listo o entregado', 'Mantén el pedido listo, enviado o entregado');
    execute def;
  end loop;
end $$;
