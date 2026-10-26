-- KultiApp V4.9: material sheet data. Reference of the deployment migration kultiapp_v49_material_sheet; do not re-run.
-- spool_net_g: grams of filament in a full spool; spool_tare_g: empty spool weight (to weigh what is left);
-- pack_size: units per pack for supplies bought in packs; notes: where to buy it, links, remarks.
alter table public.workspace_resources
 add column spool_net_g numeric not null default 1000 check (spool_net_g > 0 and spool_net_g <= 100000),
 add column spool_tare_g numeric not null default 0 check (spool_tare_g >= 0 and spool_tare_g <= 100000),
 add column pack_size numeric not null default 1 check (pack_size > 0 and pack_size <= 1000000),
 add column notes text not null default '' check (length(notes) <= 1000);
grant select (spool_net_g, spool_tare_g, pack_size, notes) on public.workspace_resources to authenticated;
grant insert (spool_net_g, spool_tare_g, pack_size, notes) on public.workspace_resources to authenticated;
grant update (spool_net_g, spool_tare_g, pack_size, notes) on public.workspace_resources to authenticated;

-- Second step (migration kultiapp_v49_counted_at): when each material was last physically counted,
-- for the «Modo conteo» reminder. Backfilled from the last first count or adjustment.
alter table public.workspace_resources add column counted_at timestamptz;
grant select (counted_at) on public.workspace_resources to authenticated;
grant insert (counted_at) on public.workspace_resources to authenticated;
grant update (counted_at) on public.workspace_resources to authenticated;
update public.workspace_resources w set counted_at = m.last
 from (select resource_id, max(created_at) last from public.inventory_movements where kind in ('opening', 'adjustment') group by resource_id) m
 where m.resource_id = w.id and w.counted;
