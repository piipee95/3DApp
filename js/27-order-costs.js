'use strict';
// ---------------------------------------------------------------------------
// V4.3: orders keep the product cost they were created with (history doesn't move on
// its own). When the product cost changes, open orders can take the new cost: offered
// after saving the product, and from each order.
// ---------------------------------------------------------------------------
function productUnitCost(productId) {
  if (S.product?.id === productId && typeof totals === 'function') return n(totals().unit);
  const p = S.products.find(x => x.id === productId);
  return p ? n(productNumbers(p).unit) : 0;
}
const orderCostFor = (o, unit) => Math.round(unit * n(o.quantity));
function staleOrders(productId, unit) {
  return (S.orders || []).filter(
    o =>
      o.product_id === productId &&
      orderIsOpen(o) &&
      unit > 0 &&
      Math.abs(orderCostFor(o, unit) - Math.round(n(o.estimated_cost))) >= 1
  );
}
async function updateOrderCosts(list, unit) {
  for (const o of list) {
    const { error } = await supabase
      .from('production_orders')
      .update({ estimated_cost: orderCostFor(o, unit), updated_at: new Date().toISOString() })
      .eq('id', o.id);
    if (error) throw error;
    o.estimated_cost = orderCostFor(o, unit);
  }
}
// After saving a product: offer to carry its new cost to the open orders that use it.
async function offerOrderCostRefresh(productId) {
  if (!canEdit()) return;
  if (!S.orders?.length) await loadOrders().catch(() => {});
  const unit = productUnitCost(productId),
    list = staleOrders(productId, unit);
  if (!list.length) return;
  const ok = await confirmDialog({
    title: 'Actualizar costo en pedidos abiertos',
    body:
      'El costo del producto ahora es ' +
      clp(unit) +
      ' por unidad. ' +
      (list.length === 1 ? 'Este pedido abierto usa' : 'Estos ' + list.length + ' pedidos abiertos usan') +
      ' el costo anterior: ' +
      list
        .map(
          o => 'PED-' + o.order_no + ' (' + clp(o.estimated_cost) + ' → ' + clp(orderCostFor(o, unit)) + ')'
        )
        .join(', ') +
      '. Los pedidos entregados o cancelados no cambian.',
    confirmLabel: 'Actualizar costo'
  });
  if (!ok) return;
  try {
    await updateOrderCosts(list, unit);
    toast(
      list.length === 1
        ? 'Costo del pedido actualizado.'
        : 'Costo actualizado en ' + list.length + ' pedidos.'
    );
  } catch (error) {
    toast(error.message, 'error');
  }
}
// In the order: a notice when its product costs something different now.
function mountOrderCostNotice(order, dialog) {
  if (!order.product_id || !orderIsOpen(order)) return;
  const unit = productUnitCost(order.product_id),
    next = orderCostFor(order, unit),
    now = Math.round(n(order.estimated_cost));
  if (!(unit > 0) || Math.abs(next - now) < 1) return;
  const box = document.createElement('div');
  box.className = 'notice small cost-notice';
  box.innerHTML =
    '<span>El costo del producto cambió: este pedido usa <b>' +
    clp(now) +
    '</b> y con el costo actual sería <b>' +
    clp(next) +
    '</b>.</span>' +
    (canEdit()
      ? '<button type="button" class="btn btn-secondary btn-sm" id="refreshOrderCost">' +
        icon('refresh-cw') +
        'Actualizar costo</button>'
      : '');
  (dialog.querySelector('.facts') || dialog.querySelector('.order-head')).after(box);
  box.querySelector('#refreshOrderCost')?.addEventListener('click', async () => {
    try {
      await updateOrderCosts([order], unit);
      toast('Costo del pedido actualizado a ' + clp(next) + '.');
      dialog.close();
      render();
      showOrder(S.orders.find(o => o.id === order.id) || order);
    } catch (error) {
      toast(error.message, 'error');
    }
  });
}
