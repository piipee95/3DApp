'use strict';
// ---------------------------------------------------------------------------
// V2.1: monthly report, Excel export and data backup.
// ---------------------------------------------------------------------------
// Minimal .xlsx writer (uncompressed zip): sheets = [{ name, rows: [[cell…]…], widths? }].
// Numbers stay numeric in Excel; everything else is written as text.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder(),
    parts = [],
    central = [];
  let offset = 0;
  const u16 = v => [v & 0xff, (v >>> 8) & 0xff],
    u32 = v => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const [name, text] of files) {
    const data = enc.encode(text),
      nameBytes = enc.encode(name),
      crc = crc32(data),
      head = [
        ...u16(20),
        ...u16(0x0800),
        ...u16(0),
        ...u16(0),
        ...u16(0x21),
        ...u32(crc),
        ...u32(data.length),
        ...u32(data.length),
        ...u16(nameBytes.length),
        ...u16(0)
      ];
    parts.push(new Uint8Array([...u32(0x04034b50), ...head]), nameBytes, data);
    central.push(
      new Uint8Array([
        ...u32(0x02014b50),
        ...u16(20),
        ...head,
        ...u16(0),
        ...u16(0),
        ...u16(0),
        ...u32(0),
        ...u32(offset)
      ]),
      nameBytes
    );
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((s, p) => s + p.length, 0);
  return new Blob(
    [
      ...parts,
      ...central,
      new Uint8Array([
        ...u32(0x06054b50),
        ...u16(0),
        ...u16(0),
        ...u16(files.length),
        ...u16(files.length),
        ...u32(size),
        ...u32(offset),
        ...u16(0)
      ])
    ],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
  );
}
const xmlEsc = s =>
  String(s ?? '')
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
function colName(i) {
  let s = '';
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
}
function xlsxBlob(sheets) {
  const sheetXml = sh =>
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<cols>' +
    (sh.rows[0] || [])
      .map((_, i) => {
        const w = Math.min(
          60,
          Math.max(10, ...sh.rows.slice(0, 200).map(r => String(r[i] ?? '').length + 2))
        );
        return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>';
      })
      .join('') +
    '</cols><sheetData>' +
    sh.rows
      .map(
        (row, r) =>
          '<row r="' +
          (r + 1) +
          '">' +
          row
            .map((v, c) => {
              const ref = colName(c) + (r + 1),
                style = r === 0 ? ' s="1"' : typeof v === 'number' ? ' s="2"' : '';
              if (v == null || v === '') return '';
              return typeof v === 'number' && Number.isFinite(v)
                ? '<c r="' + ref + '"' + style + '><v>' + Math.round(v * 100) / 100 + '</v></c>'
                : '<c r="' +
                    ref +
                    '" t="inlineStr"' +
                    style +
                    '><is><t xml:space="preserve">' +
                    xmlEsc(v) +
                    '</t></is></c>';
            })
            .join('') +
          '</row>'
      )
      .join('') +
    '</sheetData></worksheet>';
  const names = sheets.map((s, i) =>
    xmlEsc(
      String(s.name)
        .replace(/[\\/?*[\]:]/g, ' ')
        .slice(0, 31) || 'Hoja ' + (i + 1)
    )
  );
  return zipStore([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              '<Override PartName="/xl/worksheets/sheet' +
              (i + 1) +
              '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          )
          .join('') +
        '</Types>'
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        names
          .map((nm, i) => '<sheet name="' + nm + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>')
          .join('') +
        '</sheets></workbook>'
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              '<Relationship Id="rId' +
              (i + 1) +
              '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' +
              (i + 1) +
              '.xml"/>'
          )
          .join('') +
        '<Relationship Id="rId' +
        (sheets.length + 1) +
        '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
    ],
    [
      'xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
    ],
    ...sheets.map((sh, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', sheetXml(sh)])
  ]);
}
// ---- Monthly report -------------------------------------------------------
const inMonth = (iso, y, m) => {
  if (!iso) return false;
  const d = new Date(String(iso).length === 10 ? iso + 'T12:00' : iso);
  return d.getFullYear() === y && d.getMonth() === m;
};
const uniqueById = rows => [...new Map(rows.map(x => [x.id, x])).values()];
// Recent data plus any older months fetched for Reportes.
function reportRows(kind) {
  return uniqueById([...(S[kind] || []), ...(S.older?.[kind] || [])]);
}
// Fetches the months before the startup window that the report (and its 6-month chart) needs.
function needsHistory(y, m) {
  const loadedFrom = S.older?.from || S.historyFrom;
  return !!loadedFrom && new Date(y, m - 5, 1).toISOString() < loadedFrom;
}
async function ensureHistory(y, m) {
  const start = new Date(y, m - 5, 1).toISOString(),
    loadedFrom = S.older?.from || S.historyFrom;
  if (!needsHistory(y, m)) return;
  const ws = S.workspace.id,
    range = (table, col) =>
      supabase
        .from(table)
        .select('*')
        .eq('workspace_id', ws)
        .gte(col, col === 'paid_on' ? start.slice(0, 10) : start)
        .lt(col, col === 'paid_on' ? loadedFrom.slice(0, 10) : loadedFrom);
  const [orders, quotes, payments] = await Promise.all([
    range('production_orders', 'created_at'),
    range('quotes', 'created_at'),
    range('order_payments', 'paid_on')
  ]);
  for (const r of [orders, quotes, payments]) if (r.error) throw r.error;
  S.older = {
    from: start,
    orders: uniqueById([...(S.older?.orders || []), ...(orders.data || [])]),
    quotes: uniqueById([...(S.older?.quotes || []), ...(quotes.data || [])]),
    payments: uniqueById([...(S.older?.payments || []), ...(payments.data || [])])
  };
}
function monthReport(y, m) {
  const allOrders = reportRows('orders'),
    sales = allOrders.filter(
      o => o.kind !== 'stock' && o.status !== 'canceled' && inMonth(o.created_at, y, m)
    ),
    made = allOrders.filter(
      o => o.kind === 'stock' && o.status !== 'canceled' && inMonth(o.created_at, y, m)
    ),
    payments = reportRows('payments').filter(p => inMonth(p.paid_on, y, m)),
    quotes = reportRows('quotes').filter(qt => inMonth(qt.created_at, y, m));
  let total = 0,
    net = 0,
    profit = 0,
    estCost = 0,
    realCost = 0,
    realCount = 0;
  const byProduct = new Map(),
    byCustomer = new Map();
  for (const o of sales) {
    const t = orderNumbers(o),
      p = t.actualProfit ?? t.estimatedProfit,
      b = orderBalance(o);
    total += t.sales;
    net += t.net;
    profit += p;
    if (t.actualCost != null) {
      estCost += n(o.estimated_cost);
      realCost += t.actualCost;
      realCount++;
    }
    const pk = o.product_id || 'title:' + o.title,
      pr = byProduct.get(pk) || { name: o.title, units: 0, sales: 0, net: 0, profit: 0, orders: 0 };
    Object.assign(pr, {
      units: pr.units + n(o.quantity),
      sales: pr.sales + t.sales,
      net: pr.net + t.net,
      profit: pr.profit + p,
      orders: pr.orders + 1
    });
    byProduct.set(pk, pr);
    const name = o.customer_name || 'Sin cliente',
      ck = o.customer_id || 'name:' + name.toLocaleLowerCase('es'),
      cu = byCustomer.get(ck) || { name, orders: 0, sales: 0, paid: 0, due: 0 };
    Object.assign(cu, {
      orders: cu.orders + 1,
      sales: cu.sales + t.sales,
      paid: cu.paid + b.paid,
      due: cu.due + b.due
    });
    byCustomer.set(ck, cu);
  }
  const decided = quotes.filter(qt => qt.status !== 'sent').length,
    accepted = quotes.filter(qt => qt.status === 'accepted').length;
  return {
    sales,
    made,
    payments,
    quotes,
    total,
    net,
    profit,
    margin: net > 0 ? profit / net : null,
    ticket: sales.length ? total / sales.length : 0,
    collected: payments.reduce((s, p) => s + n(p.amount), 0),
    madeUnits: made.reduce((s, o) => s + n(o.quantity), 0),
    madeCost: made.reduce((s, o) => s + n(o.estimated_cost), 0),
    estCost,
    realCost,
    realCount,
    closeRate: decided ? accepted / decided : null,
    accepted,
    products: [...byProduct.values()].sort((a, b) => b.sales - a.sales),
    customers: [...byCustomer.values()].sort((a, b) => b.sales - a.sales)
  };
}
function reportMonth() {
  const now = new Date(),
    [y, m] = S.reportMonth || [now.getFullYear(), now.getMonth()];
  return { y, m, label: MONTHS[m][0].toUpperCase() + MONTHS[m].slice(1) + ' ' + y };
}
function reportsView() {
  const { y, m, label } = reportMonth(),
    r = monthReport(y, m),
    pm = m === 0 ? [y - 1, 11] : [y, m - 1],
    prev = monthReport(...pm),
    delta = prev.total > 0 ? (r.total - prev.total) / prev.total : null,
    now = new Date(),
    isCurrent = y === now.getFullYear() && m === now.getMonth(),
    dueNow = receivables().reduce((s, o) => s + orderBalance(o).due, 0);
  // Last six months, oldest first, for the bar chart.
  const series = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(y, m - 5 + i, 1),
        t = monthReport(d.getFullYear(), d.getMonth());
      return { label: MONTHS[d.getMonth()].slice(0, 3), sales: t.total, profit: t.profit };
    }),
    max = Math.max(1, ...series.map(s => s.sales));
  const tile = (label, value, foot = '') =>
    '<div class="kpi"><div class="kpi-h"><span>' +
    label +
    '</span></div><div class="kpi-v num">' +
    value +
    '</div><div class="kpi-f">' +
    foot +
    '</div></div>';
  const table = (head, rows, empty) =>
    rows.length
      ? '<table class="data-table report-table"><thead><tr>' +
        head.map((h, i) => '<th' + (i ? ' class="r"' : '') + '>' + h + '</th>').join('') +
        '</tr></thead><tbody>' +
        rows
          .map(
            row =>
              '<tr>' +
              row.map((c, i) => '<td' + (i ? ' class="r num"' : '') + '>' + c + '</td>').join('') +
              '</tr>'
          )
          .join('') +
        '</tbody></table>'
      : '<p class="small muted report-empty">' + empty + '</p>';
  root.innerHTML =
    header(
      'Reportes',
      '<button class="btn btn-secondary" id="exportReport" type="button">' +
        icon('download') +
        '<span>Excel</span></button>'
    ) +
    '<main class="shell">' +
    '<div class="month-nav"><button type="button" class="btn icon-btn" id="prevMonth" aria-label="Mes anterior">' +
    icon('arrow-left') +
    '</button><b>' +
    label +
    '</b><button type="button" class="btn icon-btn flip" id="nextMonth" aria-label="Mes siguiente"' +
    (isCurrent ? ' disabled' : '') +
    '>' +
    icon('arrow-left') +
    '</button></div><div class="kpis report-kpis">' +
    tile(
      'Ventas',
      clp(r.total),
      delta == null
        ? '<span class="muted">' +
            r.sales.length +
            (r.sales.length === 1 ? ' pedido' : ' pedidos') +
            '</span>'
        : '<span class="' +
            (delta >= 0 ? 'up' : 'down') +
            '">' +
            (delta >= 0 ? '+' : '−') +
            Math.abs(Math.round(delta * 100)) +
            '% vs ' +
            MONTHS[pm[1]] +
            '</span>'
    ) +
    tile(
      'Utilidad',
      clp(r.profit),
      '<span class="muted">' + (r.margin == null ? 'Sin ventas' : 'Margen ' + pct(r.margin)) + '</span>'
    ) +
    tile(
      'Cobrado en el mes',
      clp(r.collected),
      '<span class="muted">' + r.payments.length + (r.payments.length === 1 ? ' pago' : ' pagos') + '</span>'
    ) +
    tile(
      'Ticket promedio',
      clp(r.ticket),
      '<span class="muted">' + r.sales.length + (r.sales.length === 1 ? ' pedido' : ' pedidos') + '</span>'
    ) +
    tile(
      'Cotizaciones',
      String(r.quotes.length),
      '<span class="muted">' +
        (r.closeRate == null ? 'Sin respuestas aún' : pct(r.closeRate) + ' aceptadas') +
        '</span>'
    ) +
    tile('Por cobrar hoy', clp(dueNow), '<span class="muted">' + receivables().length + ' con saldo</span>') +
    '</div><section class="panel report-panel"><div class="panel-h"><h2>Últimos 6 meses</h2><span class="legend"><i class="l-sales"></i>Ventas <i class="l-profit"></i>Utilidad</span></div><div class="bars">' +
    series
      .map(
        s =>
          '<div class="bar-col" title="' +
          esc(s.label + ': ventas ' + clp(s.sales) + ', utilidad ' + clp(s.profit)) +
          '"><div class="bar-pair"><i class="b-sales" style="height:' +
          Math.round((s.sales / max) * 100) +
          '%"></i><i class="b-profit" style="height:' +
          Math.max(0, Math.round((s.profit / max) * 100)) +
          '%"></i></div><span>' +
          s.label +
          '</span><b class="num">' +
          clpShort(s.sales) +
          '</b></div>'
      )
      .join('') +
    '</div></section><div class="home-cols"><section class="panel report-panel"><div class="panel-h"><h2>Por producto</h2></div>' +
    table(
      ['Producto', 'Un.', 'Ventas', 'Utilidad', 'Margen'],
      r.products.map(p => [
        esc(p.name),
        p.units,
        clp(p.sales),
        '<span class="' + (p.profit < 0 ? 'down' : '') + '">' + clp(p.profit) + '</span>',
        p.net > 0 ? pct(p.profit / p.net) : '—'
      ]),
      'Sin ventas este mes.'
    ) +
    '</section><section class="panel report-panel"><div class="panel-h"><h2>Por cliente</h2></div>' +
    table(
      ['Cliente', 'Pedidos', 'Ventas', 'Saldo'],
      r.customers.map(c => [
        esc(c.name),
        c.orders,
        clp(c.sales),
        '<span class="' + (c.due > 0 ? 'warn' : '') + '">' + clp(c.due) + '</span>'
      ]),
      'Sin ventas este mes.'
    ) +
    '</section></div><div class="home-cols"><section class="panel report-panel"><div class="panel-h"><h2>Costo estimado vs real</h2></div>' +
    (r.realCount
      ? '<dl class="facts"><div><dt>Pedidos con costo real</dt><dd>' +
        r.realCount +
        '</dd></div><div><dt>Estimado</dt><dd>' +
        clp(r.estCost) +
        '</dd></div><div><dt>Real</dt><dd class="' +
        (r.realCost > r.estCost ? 'down' : 'up') +
        '">' +
        clp(r.realCost) +
        (r.estCost > 0
          ? ' (' +
            (r.realCost >= r.estCost ? '+' : '−') +
            Math.abs(Math.round(((r.realCost - r.estCost) / r.estCost) * 100)) +
            '%)'
          : '') +
        '</dd></div></dl>'
      : '<p class="small muted report-empty">Registra los costos reales en cada pedido para comparar con lo estimado.</p>') +
    '</section><section class="panel report-panel"><div class="panel-h"><h2>Fabricación para stock</h2></div>' +
    (r.made.length
      ? '<dl class="facts"><div><dt>Órdenes</dt><dd>' +
        r.made.length +
        '</dd></div><div><dt>Unidades</dt><dd>' +
        r.madeUnits +
        '</dd></div><div><dt>Costo estimado</dt><dd>' +
        clp(r.madeCost) +
        '</dd></div></dl>'
      : '<p class="small muted report-empty">Sin fabricación para stock este mes.</p>') +
    '</section></div><p class="footnote small muted">Ventas de pedidos de cliente creados en el mes (sin cancelados). La utilidad usa el costo real cuando está registrado y si no el estimado.</p></main>';
  common();
  q('#prevMonth').onclick = async () => {
    S.reportMonth = m === 0 ? [y - 1, 11] : [y, m - 1];
    if (needsHistory(...S.reportMonth)) {
      q('#prevMonth').disabled = true;
      try {
        await ensureHistory(...S.reportMonth);
      } catch (error) {
        toast('No se pudo cargar el historial: ' + error.message, 'error');
      }
    }
    reportsView();
  };
  q('#nextMonth').onclick = () => {
    if (isCurrent) return;
    S.reportMonth = m === 11 ? [y + 1, 0] : [y, m + 1];
    reportsView();
  };
  q('#exportReport').onclick = () => exportReport(y, m);
}
async function exportReport(y, m) {
  // Expenses feed the real profit and VAT lines; the report still exports if they can't load.
  try {
    if (!S.expensesLoaded) await loadExpenses();
  } catch {}
  const fin = financeMonth(y, m),
    r = monthReport(y, m),
    { label } = reportMonth(),
    date = iso => (iso ? String(iso).slice(0, 10) : '');
  const sheets = [
    {
      name: 'Resumen',
      rows: [
        ['Indicador', 'Valor'],
        ['Mes', label],
        ['Ventas (con IVA)', Math.round(r.total)],
        ['Ventas netas', Math.round(r.net)],
        ['Utilidad', Math.round(r.profit)],
        ['Margen', r.margin == null ? '' : pct(r.margin)],
        ['Pedidos', r.sales.length],
        ['Ticket promedio', Math.round(r.ticket)],
        ['Cobrado en el mes', Math.round(r.collected)],
        ['Cotizaciones', r.quotes.length],
        ['Cotizaciones aceptadas', r.accepted],
        ['Unidades fabricadas para stock', r.madeUnits],
        ['Costo de lo vendido', Math.round(fin.cogs)],
        ['Gastos del negocio', Math.round(fin.overhead)],
        ['Utilidad real', Math.round(fin.real)],
        ['IVA de ventas', Math.round(fin.ivaSales)],
        ['IVA de compras con factura', Math.round(fin.ivaPurchases)],
        ['IVA estimado a pagar', Math.round(fin.ivaDue)]
      ]
    },
    {
      name: 'Pedidos',
      rows: [
        [
          'Pedido',
          'Fecha',
          'Cliente',
          'Producto',
          'Cantidad',
          'Precio unitario',
          'Total',
          'Costo estimado',
          'Costo real',
          'Utilidad',
          'Pagado',
          'Saldo',
          'Estado',
          'Entrega'
        ],
        ...r.sales.map(o => {
          const t = orderNumbers(o),
            b = orderBalance(o);
          return [
            'PED-' + o.order_no,
            date(o.created_at),
            o.customer_name || '',
            o.title,
            n(o.quantity),
            n(o.unit_price),
            t.sales,
            n(o.estimated_cost),
            t.actualCost ?? '',
            t.actualProfit ?? t.estimatedProfit,
            b.paid,
            b.due,
            ORDER_STATUSES[o.status] || o.status,
            date(o.due_date)
          ];
        })
      ]
    },
    {
      name: 'Por producto',
      rows: [
        ['Producto', 'Pedidos', 'Unidades', 'Ventas', 'Utilidad', 'Margen'],
        ...r.products.map(p => [
          p.name,
          p.orders,
          p.units,
          p.sales,
          p.profit,
          p.net > 0 ? pct(p.profit / p.net) : ''
        ])
      ]
    },
    {
      name: 'Por cliente',
      rows: [
        ['Cliente', 'Pedidos', 'Ventas', 'Pagado', 'Saldo'],
        ...r.customers.map(c => [c.name, c.orders, c.sales, c.paid, c.due])
      ]
    },
    {
      name: 'Pagos',
      rows: [
        ['Fecha', 'Pedido', 'Cliente', 'Monto', 'Medio', 'Nota'],
        ...r.payments.map(p => {
          const o = reportRows('orders').find(x => x.id === p.order_id);
          return [
            date(p.paid_on),
            o ? 'PED-' + o.order_no : '',
            o?.customer_name || '',
            n(p.amount),
            PAY_METHODS[p.method] || p.method,
            p.note || ''
          ];
        })
      ]
    },
    {
      name: 'Cotizaciones',
      rows: [
        ['Folio', 'Fecha', 'Cliente', 'Producto', 'Cantidad', 'Total', 'Estado'],
        ...r.quotes.map(qt => [
          quoteFolioNo(qt.quote_no),
          date(qt.created_at),
          qt.client_name,
          qt.title,
          qt.quantity,
          quoteSums(qt).total,
          QUOTE_STATUS[quoteState(qt)]
        ])
      ]
    }
  ];
  sheets.push({
    name: 'Gastos',
    rows: [
      ['Fecha', 'Categoría', 'Detalle', 'Monto', 'IVA', 'Pagó'],
      ...fin.expenses.map(e => [
        date(e.spent_on),
        EXPENSE_CATEGORIES[e.category],
        e.description,
        n(e.amount),
        n(e.iva_amount),
        e.paid_by
      ])
    ]
  });
  downloadBlob(xlsxBlob(sheets), 'KultiApp-reporte-' + y + '-' + String(m + 1).padStart(2, '0') + '.xlsx');
  toast('Reporte descargado.');
}
// ---- Backup -----------------------------------------------------------------
const BACKUP_TABLES = [
  ['workspace_settings', 'Ajustes'],
  ['products', 'Productos'],
  ['print_jobs', 'Impresiones'],
  ['cost_items', 'Costos'],
  ['workspace_resources', 'Inventario'],
  ['inventory_movements', 'Movimientos inventario'],
  ['production_orders', 'Pedidos'],
  ['inventory_order_lines', 'Materiales pedidos'],
  ['order_payments', 'Pagos'],
  ['product_stock_movements', 'Movimientos stock'],
  ['customers', 'Clientes'],
  ['quotes', 'Cotizaciones'],
  ['expenses', 'Gastos'],
  ['partner_transfers', 'Transferencias socios'],
  ['price_lists', 'Precios rápidos']
];
async function collectBackup() {
  const data = {},
    ws = S.workspace.id;
  for (const [table] of BACKUP_TABLES) {
    // Prints and cost items hang from products, not from the workspace.
    const ids = (data.products || []).map(p => p.id),
      query =
        table === 'print_jobs' || table === 'cost_items'
          ? ids.length
            ? supabase.from(table).select('*').in('product_id', ids)
            : null
          : supabase.from(table).select('*').eq('workspace_id', ws);
    if (!query) {
      data[table] = [];
      continue;
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(table + ': ' + error.message);
    data[table] = rows || [];
  }
  return {
    app: 'KultiApp',
    version: 1,
    exported_at: new Date().toISOString(),
    workspace: { id: ws, name: S.workspace.name },
    tables: data
  };
}
const backupKey = () => 'kultiapp_backup_' + (S.workspace?.id || '');
function lastBackup() {
  try {
    return localStorage.getItem(backupKey());
  } catch {
    return null;
  }
}
function showBackup() {
  const last = lastBackup();
  const dialog = showDialog(
    'backupDialog',
    '<div class="section-title"><h2>Respaldo de datos</h2><button class="btn btn-ghost" data-close>Cerrar</button></div><p class="small muted">Descarga una copia completa de productos, costos, inventario, pedidos, pagos, clientes y cotizaciones. Guárdala en tu computador, Drive o correo.</p><p class="notice small">' +
      (last
        ? 'Último respaldo desde este equipo: <b>' +
          new Date(last).toLocaleDateString('es-CL') +
          '</b> (' +
          relativeDate(last) +
          ').'
        : 'Aún no has descargado un respaldo desde este equipo.') +
      '</p><div class="backup-actions"><button type="button" class="btn btn-primary" data-backup="xlsx">' +
      icon('download') +
      'Excel (para revisar)</button><button type="button" class="btn btn-secondary" data-backup="json">' +
      icon('download') +
      'JSON (copia exacta)</button></div><p class="small muted">Las fotos de los productos se mantienen en el almacenamiento de la app; el respaldo guarda sus referencias.</p><div id="backupFeedback" class="small" role="status"></div>'
  );
  dialog.querySelectorAll('[data-backup]').forEach(
    b =>
      (b.onclick = async () => {
        dialog.querySelectorAll('[data-backup]').forEach(x => (x.disabled = true));
        q('#backupFeedback').textContent = 'Preparando respaldo…';
        try {
          const backup = await collectBackup(),
            stamp = new Date().toLocaleDateString('sv-SE'),
            base = 'KultiApp-respaldo-' + stamp;
          if (b.dataset.backup === 'json')
            downloadBlob(
              new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' }),
              base + '.json'
            );
          else
            downloadBlob(
              xlsxBlob(
                BACKUP_TABLES.map(([table, name]) => {
                  const rows = backup.tables[table],
                    cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
                  return {
                    name,
                    rows: [
                      cols.length ? cols : ['(sin datos)'],
                      ...rows.map(r =>
                        cols.map(c =>
                          r[c] != null && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c]
                        )
                      )
                    ]
                  };
                })
              ),
              base + '.xlsx'
            );
          try {
            localStorage.setItem(backupKey(), backup.exported_at);
          } catch {}
          const count = Object.values(backup.tables).reduce((s, rows) => s + rows.length, 0);
          q('#backupFeedback').textContent = 'Respaldo descargado: ' + count + ' registros.';
        } catch (error) {
          q('#backupFeedback').textContent = 'No se pudo crear el respaldo: ' + error.message;
        } finally {
          dialog.querySelectorAll('[data-backup]').forEach(x => (x.disabled = false));
        }
      })
  );
  return dialog;
}
