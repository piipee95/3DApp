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

// ---- V4.3: «Mi perfil»: the name shown in the app and in the greeting. ----
function showProfile() {
  const user = S.session?.user || {};
  const dialog = showDialog(
    'profileDialog',
    '<div class="section-title"><h2>Mi perfil</h2><button class="btn btn-ghost" data-close>Volver</button></div><div class="profile-head"><span class="avatar avatar-lg">' +
      esc(userInitials()) +
      '</span><div><b>' +
      esc(displayName() || 'Sin nombre') +
      '</b><span class="small muted">' +
      esc(user.email || '') +
      ' · ' +
      roleName() +
      '</span></div></div><form id="profileForm" class="grid">' +
      fieldHtml(
        'Tu nombre',
        'profileName',
        displayName(),
        'text',
        'required maxlength="60" autocomplete="name" placeholder="Ej. Felipe Pino"'
      ) +
      fieldHtml('Email', 'profileEmail', user.email || '', 'email', 'readonly') +
      '<p class="small muted">Tu nombre aparece en el menú, en el saludo de Inicio y en las iniciales de tu avatar. El email es con el que entras y no se cambia aquí.</p><div id="profileFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Guardar</button></form>'
  );
  q('#profileForm').onsubmit = async e => {
    e.preventDefault();
    const b = e.submitter || e.target.querySelector('button[type=submit]');
    if (b.disabled) return;
    b.disabled = true;
    const name = q('#profileName').value.trim().slice(0, 60);
    try {
      const { data, error } = await supabase.auth.updateUser({ data: { name } });
      if (error) throw error;
      S.session.user = data?.user || { ...user, user_metadata: { ...(user.user_metadata || {}), name } };
      dialog.close();
      toast('Perfil guardado.');
      render();
    } catch (error) {
      q('#profileFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  return dialog;
}
