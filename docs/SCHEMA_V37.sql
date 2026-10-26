-- KultiApp V3.7: editors can remove orders that hold no reservation (cancel first to release it).
-- Reference of the deployment migration kultiapp_v37_order_removal; do not re-run.
grant delete on public.production_orders to authenticated;
create policy orders_remove on public.production_orders for delete to authenticated
 using(private.can_edit_workspace(workspace_id) and inventory_state <> 'reserved' and stock_state <> 'reserved');
