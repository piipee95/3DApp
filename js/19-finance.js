'use strict';
// ---------------------------------------------------------------------------
// V2.9: business expenses, real monthly profit, partner accounts and VAT summary.
// ---------------------------------------------------------------------------
const EXPENSE_CATEGORIES = {
  arriendo: 'Arriendo',
  servicios: 'Luz, agua e internet',
  publicidad: 'Publicidad',
  herramientas: 'Herramientas y repuestos',
  suscripciones: 'Suscripciones',
  envios: 'Envíos y transporte',
  materiales: 'Compra de materiales',
  otros: 'Otros'
};
const IVA_RATE = 0.19;
// Partners as configured in team settings: [{ name, share }] with shares adding up to 100.
function partners() {
  return Array.isArray(S.settings?.partners) ? S.settings.partners.filter(p => p?.name) : [];
}
const partnerKey = () => 'kultiapp_partner_' + (S.workspace?.id || '');
function currentPartner() {
  try {
    const name = localStorage.getItem(partnerKey()) || '';
    return partners().some(p => p.name === name) ? name : '';
  } catch {
    return '';
  }
}
// Remembers the partner chosen on this device and returns it.
function rememberPartner(name = '') {
  try {
    if (name) localStorage.setItem(partnerKey(), name);
  } catch {}
  return name || '';
}
function partnerField(id, label) {
  const list = partners();
  if (!list.length) return '';
  const current = currentPartner();
  return (
    '<div class="field"><label for="' +
    id +
    '">' +
    label +
    '</label><select id="' +
    id +
    '"><option value="">Sin indicar</option>' +
    list
      .map(
        p =>
          '<option value="' +
          esc(p.name) +
          '"' +
          (p.name === current ? ' selected' : '') +
          '>' +
          esc(p.name) +
          '</option>'
      )
      .join('') +
    '</select></div>'
  );
}
async function loadExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('spent_on', { ascending: false });
  if (error) throw error;
  S.expenses = data || [];
  S.expensesLoaded = true;
}
async function loadTransfers() {
  const { data, error } = await supabase
    .from('partner_transfers')
    .select('*')
    .eq('workspace_id', S.workspace.id)
    .order('transferred_on', { ascending: false });
  if (error) throw error;
  S.transfers = data || [];
}
const ivaOf = (total, rate = IVA_RATE) => Math.round(n(total) - n(total) / (1 + rate));
// Real profit of a month: net sales − cost of what was sold − overhead expenses.
function financeMonth(y, m) {
  const r = monthReport(y, m),
    cogs = r.sales.reduce((s, o) => s + (orderNumbers(o).actualCost ?? n(o.estimated_cost)), 0),
    expenses = (S.expenses || []).filter(e => inMonth(e.spent_on, y, m)),
    overhead = expenses.filter(e => e.category !== 'materiales').reduce((s, e) => s + n(e.amount), 0),
    purchases = expenses.filter(e => e.category === 'materiales').reduce((s, e) => s + n(e.amount), 0),
    gross = r.net - cogs,
    grossMargin = r.net > 0 ? gross / r.net : null,
    ivaSales = r.sales.reduce(
      (s, o) => s + (o.iva_enabled ? orderNumbers(o).sales - orderNumbers(o).net : 0),
      0
    ),
    ivaPurchases = expenses.reduce((s, e) => s + n(e.iva_amount), 0);
  return {
    report: r,
    expenses,
    cogs,
    gross,
    grossMargin,
    overhead,
    purchases,
    real: gross - overhead,
    // Sales needed to cover this month's overhead at the month's gross margin.
    breakEven: grossMargin > 0 ? overhead / grossMargin : null,
    ivaSales,
    ivaPurchases,
    ivaDue: ivaSales - ivaPurchases
  };
}
// Who holds the business money: received − paid − sent + received in transfers, vs. each share.
function partnerAccounts() {
  const list = partners(),
    rows = new Map(
      list.map(p => [
        p.name,
        { name: p.name, share: n(p.share) / 100, received: 0, paid: 0, sent: 0, got: 0 }
      ])
    ),
    row = name => rows.get(name);
  let unassigned = 0;
  for (const p of reportRows('payments')) {
    if (row(p.received_by)) row(p.received_by).received += n(p.amount);
    else unassigned += n(p.amount);
  }
  for (const e of S.expenses || []) if (row(e.paid_by)) row(e.paid_by).paid += n(e.amount);
  for (const t of S.transfers || []) {
    if (row(t.from_name)) row(t.from_name).sent += n(t.amount);
    if (row(t.to_name)) row(t.to_name).got += n(t.amount);
  }
  const all = [...rows.values()].map(r => ({ ...r, holds: r.received - r.paid - r.sent + r.got })),
    total = all.reduce((s, r) => s + r.holds, 0);
  for (const r of all) {
    r.fair = total * r.share;
    r.diff = Math.round(r.holds - r.fair);
  }
  // Settle with the fewest transfers: those holding more pay those holding less.
  const give = all.filter(r => r.diff > 0).map(r => ({ name: r.name, left: r.diff })),
    take = all.filter(r => r.diff < 0).map(r => ({ name: r.name, left: -r.diff })),
    moves = [];
  for (const g of give)
    for (const t of take) {
      const amount = Math.min(g.left, t.left);
      if (amount < 1) continue;
      moves.push({ from: g.name, to: t.name, amount });
      g.left -= amount;
      t.left -= amount;
    }
  return { rows: all, total, unassigned, moves };
}
function financeView() {
  const now = new Date(),
    [y, m] = S.financeMonth || [now.getFullYear(), now.getMonth()],
    isCurrent = y === now.getFullYear() && m === now.getMonth(),
    f = financeMonth(y, m),
    acc = partnerAccounts(),
    edit = canEdit(),
    label = MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1) + ' ' + y;
  const line = (k, v, cls = '') =>
    '<div class="fin-line ' + cls + '"><span>' + k + '</span><b class="num">' + v + '</b></div>';
  root.innerHTML =
    header(
      'Finanzas',
      edit
        ? '<button class="btn btn-primary" id="newExpense" type="button">' +
            icon('plus') +
            '<span>Gasto</span></button>'
        : ''
    ) +
    '<main class="shell">' +
    (S.err ? '<div class="error">' + esc(S.err) + '</div>' : '') +
    '<div class="month-nav"><button type="button" class="btn icon-btn" id="finPrev" aria-label="Mes anterior">' +
    icon('arrow-left') +
    '</button><b>' +
    label +
    '</b><button type="button" class="btn icon-btn flip" id="finNext" aria-label="Mes siguiente"' +
    (isCurrent ? ' disabled' : '') +
    '>' +
    icon('arrow-left') +
    '</button></div><div class="home-cols"><section class="panel report-panel"><div class="panel-h"><h2>Utilidad real del mes</h2></div><div class="fin-lines">' +
    line('Ventas netas (sin IVA)', clp(f.report.net)) +
    line('− Costo de lo vendido', clp(f.cogs)) +
    line(
      '= Margen bruto',
      clp(f.gross) + (f.grossMargin == null ? '' : ' · ' + pct(f.grossMargin)),
      'sub-total'
    ) +
    line('− Gastos del negocio', clp(f.overhead)) +
    line('= Utilidad real', clp(f.real), 'total ' + (f.real < 0 ? 'down' : 'up')) +
    '</div><p class="small muted fin-note">' +
    (f.breakEven == null
      ? 'Registra ventas y gastos para calcular el punto de equilibrio.'
      : 'Para cubrir los gastos del mes necesitas vender <b>' +
        clp(f.breakEven) +
        '</b> netos (' +
        clp(f.breakEven * (1 + IVA_RATE)) +
        ' con IVA) con el margen actual.') +
    (f.purchases
      ? ' Compras de materiales del mes: ' + clp(f.purchases) + ' (se reflejan en el costo de lo vendido).'
      : '') +
    '</p></section><section class="panel report-panel"><div class="panel-h"><h2>IVA del mes (estimado)</h2></div><div class="fin-lines">' +
    line('IVA de ventas (débito)', clp(f.ivaSales)) +
    line('− IVA de compras con factura (crédito)', clp(f.ivaPurchases)) +
    line(f.ivaDue >= 0 ? '= IVA a pagar' : '= Remanente a favor', clp(Math.abs(f.ivaDue)), 'total') +
    '</div><p class="small muted fin-note">Estimación con pedidos creados en el mes y gastos con factura. Confírmalo con tu contador antes de declarar.</p></section></div>' +
    '<section class="panel report-panel"><div class="panel-h"><h2>Cuentas entre socios</h2>' +
    (edit
      ? '<button type="button" class="link-btn" id="editPartners">' +
        (partners().length ? 'Editar socios' : 'Configurar socios') +
        '</button>'
      : '') +
    '</div>' +
    (partners().length
      ? '<table class="data-table report-table partner-table"><thead><tr><th>Socio</th><th class="r">Cobró</th><th class="r">Pagó</th><th class="r">Transf.</th><th class="r">Tiene</th><th class="r">Le corresponde</th></tr></thead><tbody>' +
        acc.rows
          .map(
            r =>
              '<tr><td><b>' +
              esc(r.name) +
              '</b><div class="sub">' +
              Math.round(r.share * 100) +
              '%</div></td><td class="r num">' +
              clp(r.received) +
              '</td><td class="r num">' +
              clp(r.paid) +
              '</td><td class="r num">' +
              clp(r.got - r.sent) +
              '</td><td class="r num"><b>' +
              clp(r.holds) +
              '</b></td><td class="r num">' +
              clp(r.fair) +
              '</td></tr>'
          )
          .join('') +
        '</tbody></table><div class="settle">' +
        (acc.moves.length
          ? acc.moves
              .map(
                mv =>
                  '<div class="settle-row"><span><b>' +
                  esc(mv.from) +
                  '</b> le debe <b>' +
                  clp(mv.amount) +
                  '</b> a <b>' +
                  esc(mv.to) +
                  '</b></span>' +
                  (edit
                    ? '<button type="button" class="btn btn-secondary btn-sm" data-settle="' +
                      esc(JSON.stringify(mv)) +
                      '">Registrar transferencia</button>'
                    : '') +
                  '</div>'
              )
              .join('')
          : '<p class="small muted">Las cuentas están cuadradas.</p>') +
        (acc.unassigned
          ? '<p class="small warn">' +
            clp(acc.unassigned) +
            ' en pagos sin indicar quién los recibió. Al registrar un pago, elige el socio en «Lo recibió».</p>'
          : '') +
        '<p class="small muted">«Tiene» = lo que cobró − lo que pagó del negocio ± transferencias entre socios. «Le corresponde» = el total según el porcentaje de cada uno.</p></div>'
      : '<p class="small muted report-empty">Agrega a los socios y su porcentaje para saber quién tiene la plata del negocio y cuánto se deben.</p>') +
    '</section><section class="panel report-panel"><div class="panel-h"><h2>Gastos de ' +
    MONTHS[m] +
    '</h2><span class="small muted">' +
    clp(f.expenses.reduce((s, e) => s + n(e.amount), 0)) +
    '</span></div>' +
    (f.expenses.length
      ? '<div class="list-rows always">' +
        f.expenses
          .map(
            e =>
              '<button type="button" class="list-row" data-expense="' +
              e.id +
              '"><span class="lr-main"><b>' +
              esc(e.description || EXPENSE_CATEGORIES[e.category]) +
              '</b><span>' +
              shortDate(e.spent_on) +
              ' · ' +
              EXPENSE_CATEGORIES[e.category] +
              (e.paid_by ? ' · pagó ' + esc(e.paid_by) : '') +
              (e.has_invoice ? ' · con factura' : '') +
              '</span></span><span class="lr-end"><b class="num">' +
              clp(e.amount) +
              '</b></span></button>'
          )
          .join('') +
        '</div>'
      : '<p class="small muted report-empty">Sin gastos registrados este mes.</p>') +
    (S.transfers?.length
      ? '<details class="fin-details"><summary>Transferencias entre socios (' +
        S.transfers.length +
        ')</summary>' +
        S.transfers
          .map(
            t =>
              '<div class="pay-row"><span><b>' +
              shortDate(t.transferred_on) +
              '</b> · ' +
              esc(t.from_name) +
              ' → ' +
              esc(t.to_name) +
              (t.note ? ' · ' + esc(t.note) : '') +
              '</span><b class="num">' +
              clp(t.amount) +
              '</b>' +
              (edit
                ? '<button type="button" class="btn icon-btn" data-del-transfer="' +
                  t.id +
                  '" aria-label="Eliminar transferencia">' +
                  icon('trash-2') +
                  '</button>'
                : '') +
              '</div>'
          )
          .join('') +
        '</details>'
      : '') +
    '</section></main>';
  common();
  q('#finPrev').onclick = async () => {
    S.financeMonth = m === 0 ? [y - 1, 11] : [y, m - 1];
    if (needsHistory(...S.financeMonth)) {
      try {
        await ensureHistory(...S.financeMonth);
      } catch (error) {
        toast('No se pudo cargar el historial: ' + error.message, 'error');
      }
    }
    financeView();
  };
  q('#finNext').onclick = () => {
    if (isCurrent) return;
    S.financeMonth = m === 11 ? [y + 1, 0] : [y, m + 1];
    financeView();
  };
  q('#newExpense')?.addEventListener('click', () => showExpense({}));
  q('#editPartners')?.addEventListener('click', showPartners);
  qa('[data-expense]').forEach(
    b => (b.onclick = () => showExpense(S.expenses.find(e => e.id === b.dataset.expense)))
  );
  qa('[data-settle]').forEach(b => (b.onclick = () => showTransfer(JSON.parse(b.dataset.settle))));
  qa('[data-del-transfer]').forEach(
    b =>
      (b.onclick = async () => {
        if (
          !(await confirmDialog({
            title: 'Eliminar transferencia',
            body: 'Se quitará de las cuentas entre socios.',
            confirmLabel: 'Eliminar',
            danger: true
          }))
        )
          return;
        const { error } = await supabase.from('partner_transfers').delete().eq('id', b.dataset.delTransfer);
        if (error) return toast(error.message, 'error');
        S.transfers = S.transfers.filter(t => t.id !== b.dataset.delTransfer);
        financeView();
      })
  );
}
function showExpense(e) {
  if (!canEdit() && !e.id) return;
  const edit = canEdit();
  const dialog = showDialog(
    'expenseDialog',
    '<div class="section-title"><h2>' +
      (e.id ? 'Gasto' : 'Nuevo gasto') +
      '</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><form id="expenseForm" class="grid"><div class="grid grid-2">' +
      fieldHtml(
        'Monto total pagado',
        'exAmount',
        e.amount ?? '',
        'number',
        'min="1" step="1" required' + (edit ? '' : ' readonly')
      ) +
      fieldHtml(
        'Fecha',
        'exDate',
        e.spent_on || new Date().toLocaleDateString('sv-SE'),
        'date',
        'required' + (edit ? '' : ' readonly')
      ) +
      '<div class="field"><label for="exCategory">Categoría</label><select id="exCategory"' +
      (edit ? '' : ' disabled') +
      '>' +
      Object.entries(EXPENSE_CATEGORIES)
        .map(
          ([k, v]) =>
            '<option value="' +
            k +
            '"' +
            (k === (e.category || 'otros') ? ' selected' : '') +
            '>' +
            v +
            '</option>'
        )
        .join('') +
      '</select></div>' +
      fieldHtml(
        'Detalle',
        'exDesc',
        e.description || '',
        'text',
        'maxlength="200" placeholder="Ej. Publicidad Instagram octubre"' + (edit ? '' : ' readonly')
      ) +
      partnerField('exPaidBy', 'Lo pagó') +
      '</div><label class="check-row"><input type="checkbox" id="exInvoice"' +
      (e.has_invoice ? ' checked' : '') +
      (edit ? '' : ' disabled') +
      '> <span><b>Con factura (IVA recuperable)</b><span class="small muted" id="exIva"></span></span></label><p class="small muted">«Compra de materiales» no cuenta como gasto del negocio en la utilidad: ese costo ya entra al vender. Sí cuenta para cuentas entre socios e IVA.</p><div id="exFeedback" class="small" role="status"></div>' +
      (edit
        ? '<div class="dialog-actions">' +
          (e.id
            ? '<button type="button" class="btn btn-ghost danger-text" id="exDelete">' +
              icon('trash-2') +
              'Eliminar</button>'
            : '') +
          '<button class="btn btn-primary" type="submit">Guardar gasto</button></div>'
        : '') +
      '</form>'
  );
  if (q('#exPaidBy') && e.id) q('#exPaidBy').value = e.paid_by || '';
  const ivaText = () => {
    q('#exIva').textContent = q('#exInvoice').checked
      ? 'IVA incluido: ' + clp(ivaOf(q('#exAmount').value))
      : '';
  };
  q('#exInvoice').onchange = ivaText;
  q('#exAmount').oninput = ivaText;
  ivaText();
  q('#expenseForm').onsubmit = async ev => {
    ev.preventDefault();
    if (!edit) return;
    const b = ev.submitter || ev.target.querySelector('button[type=submit]'),
      amount = Math.round(n(q('#exAmount').value)),
      invoice = q('#exInvoice').checked,
      v = {
        spent_on: q('#exDate').value,
        category: q('#exCategory').value,
        description: q('#exDesc').value.trim(),
        amount,
        has_invoice: invoice,
        iva_amount: invoice ? ivaOf(amount) : 0,
        paid_by: rememberPartner(q('#exPaidBy')?.value)
      };
    b.disabled = true;
    try {
      const { error } = e.id
        ? await supabase.from('expenses').update(v).eq('id', e.id)
        : await supabase.from('expenses').insert({ ...v, workspace_id: S.workspace.id });
      if (error) throw error;
      await loadExpenses();
      dialog.close();
      S.msg = 'Gasto guardado.';
      render();
    } catch (error) {
      q('#exFeedback').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  q('#exDelete')?.addEventListener('click', async () => {
    dialog.close();
    if (
      !(await confirmDialog({
        title: 'Eliminar gasto',
        body: 'Se quitará de la utilidad, el IVA y las cuentas entre socios.',
        confirmLabel: 'Eliminar',
        danger: true
      }))
    )
      return;
    const { error } = await supabase.from('expenses').delete().eq('id', e.id);
    if (error) return toast(error.message, 'error');
    S.expenses = S.expenses.filter(x => x.id !== e.id);
    render();
  });
  return dialog;
}
function showPartners() {
  if (!canEdit()) return;
  const list = partners().length
    ? partners()
    : [
        { name: '', share: 50 },
        { name: '', share: 50 }
      ];
  const dialog = showDialog(
    'partnersDialog',
    '<div class="section-title"><h2>Socios</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p class="small muted">Nombre y porcentaje de las utilidades de cada socio (deben sumar 100%). Se usan para «Lo recibió» y «Lo pagó».</p><form id="partnersForm" class="grid"><div id="partnerRows" class="grid"></div><button type="button" class="btn btn-ghost" id="addPartner">' +
      icon('plus') +
      'Agregar socio</button><div id="partnersFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Guardar socios</button></form>'
  );
  const rows = list.map(p => ({ ...p }));
  const draw = () => {
    q('#partnerRows').innerHTML = rows
      .map(
        (p, i) =>
          '<div class="partner-row"><input class="pName" aria-label="Nombre" maxlength="60" placeholder="Nombre" value="' +
          esc(p.name) +
          '"><input class="pShare" aria-label="Porcentaje" type="number" min="0" max="100" step="1" value="' +
          n(p.share) +
          '"><span>%</span><button type="button" class="btn icon-btn" data-rm-partner="' +
          i +
          '" aria-label="Quitar socio">' +
          icon('trash-2') +
          '</button></div>'
      )
      .join('');
    qa('[data-rm-partner]').forEach(
      b =>
        (b.onclick = () => {
          read();
          rows.splice(+b.dataset.rmPartner, 1);
          draw();
        })
    );
  };
  const read = () =>
    qa('.partner-row').forEach((el, i) => {
      rows[i].name = el.querySelector('.pName').value.trim();
      rows[i].share = n(el.querySelector('.pShare').value);
    });
  q('#addPartner').onclick = () => {
    read();
    if (rows.length < 6) rows.push({ name: '', share: 0 });
    draw();
  };
  draw();
  q('#partnersForm').onsubmit = async ev => {
    ev.preventDefault();
    read();
    const clean = rows
      .filter(p => p.name)
      .map(p => ({ name: p.name.slice(0, 60), share: Math.round(n(p.share)) }));
    const total = clean.reduce((s, p) => s + p.share, 0);
    if (clean.length && total !== 100)
      return (q('#partnersFeedback').textContent = 'Los porcentajes suman ' + total + '%. Deben sumar 100%.');
    if (new Set(clean.map(p => p.name.toLocaleLowerCase('es'))).size !== clean.length)
      return (q('#partnersFeedback').textContent = 'Hay nombres repetidos.');
    const { error } = await supabase
      .from('workspace_settings')
      .update({ partners: clean })
      .eq('workspace_id', S.workspace.id);
    if (error) return (q('#partnersFeedback').textContent = error.message);
    S.settings.partners = clean;
    dialog.close();
    S.msg = 'Socios guardados.';
    render();
  };
  return dialog;
}
function showTransfer(prefill = {}) {
  if (!canEdit()) return;
  const names = partners().map(p => p.name),
    options = sel =>
      names.map(nm => '<option' + (nm === sel ? ' selected' : '') + '>' + esc(nm) + '</option>').join('');
  const dialog = showDialog(
    'transferDialog',
    '<div class="section-title"><h2>Transferencia entre socios</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><form id="transferForm" class="grid"><div class="grid grid-2"><div class="field"><label for="trFrom">De</label><select id="trFrom">' +
      options(prefill.from) +
      '</select></div><div class="field"><label for="trTo">Para</label><select id="trTo">' +
      options(prefill.to) +
      '</select></div>' +
      fieldHtml('Monto', 'trAmount', prefill.amount || '', 'number', 'min="1" step="1" required') +
      fieldHtml('Fecha', 'trDate', new Date().toLocaleDateString('sv-SE'), 'date', 'required') +
      '</div>' +
      fieldHtml('Nota', 'trNote', '', 'text', 'maxlength="200" placeholder="Ej. reparto de octubre"') +
      '<div id="trFeedback" class="small" role="status"></div><button class="btn btn-primary" type="submit">Registrar transferencia</button></form>'
  );
  q('#transferForm').onsubmit = async ev => {
    ev.preventDefault();
    if (q('#trFrom').value === q('#trTo').value)
      return (q('#trFeedback').textContent = 'Elige dos socios distintos.');
    const { error } = await supabase.from('partner_transfers').insert({
      workspace_id: S.workspace.id,
      from_name: q('#trFrom').value,
      to_name: q('#trTo').value,
      amount: Math.round(n(q('#trAmount').value)),
      transferred_on: q('#trDate').value,
      note: q('#trNote').value.trim()
    });
    if (error) return (q('#trFeedback').textContent = error.message);
    await loadTransfers();
    dialog.close();
    S.msg = 'Transferencia registrada.';
    render();
  };
  return dialog;
}
