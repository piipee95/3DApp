'use strict';
// Finanzas y reportes: gastos, cuentas entre socios, IVA, valor del inventario, reportes, exportación y respaldo.
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
    '</section></div><div class="home-cols">' +
    failuresPanelMarkup(y, m) +
    '</div><p class="footnote small muted">Ventas de pedidos de cliente creados en el mes (sin cancelados). La utilidad usa el costo real cuando está registrado y si no el estimado.</p></main>';
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
    if (!S.failures) await loadFailures();
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
        ['Fallas de impresión (cantidad)', failuresOfMonth(y, m).count],
        ['Costo de fallas', Math.round(failuresOfMonth(y, m).cost)],
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
  ['price_lists', 'Precios rápidos'],
  ['print_failures', 'Fallas']
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
// Real profit of a month: net sales − cost of what was sold − overhead expenses − failures not in an order's cost.
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
    ivaPurchases = expenses.reduce((s, e) => s + n(e.iva_amount), 0),
    waste = failureWaste(y, m);
  return {
    report: r,
    expenses,
    cogs,
    gross,
    grossMargin,
    overhead,
    purchases,
    waste,
    real: gross - overhead - waste,
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
    valuationPanel() +
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
    (f.waste ? line('− Fallas de impresión', clp(f.waste)) : '') +
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
// V3.8: what the business has today in money: raw materials, finished goods and what is expected to come in.
function stockValuation() {
  const items = (S.resources || []).filter(r => r.kind !== 'printer' && r.counted && !r.deleted_at),
    worth = list => list.reduce((s, r) => s + n(r.stock_qty) * n(r.unit_cost), 0),
    filament = worth(items.filter(r => r.kind === 'filament')),
    supplies = worth(items.filter(r => r.kind !== 'filament')),
    goods = (S.products || [])
      .filter(p => p.status !== 'archived' && productStock(p).qty > 0)
      .map(p => {
        const t = productNumbers(p),
          qty = productStock(p).qty;
        return {
          p,
          qty,
          cost: qty * t.unit,
          sale: qty * t.price,
          net: qty * (p.iva_enabled ? t.price / (1 + n(p.iva_rate)) : t.price)
        };
      }),
    goodsCost = goods.reduce((s, g) => s + g.cost, 0),
    goodsSale = goods.reduce((s, g) => s + g.sale, 0),
    goodsNet = goods.reduce((s, g) => s + g.net, 0),
    due = receivables().reduce((s, o) => s + orderBalance(o).due, 0);
  return {
    filament,
    supplies,
    materials: filament + supplies,
    goods,
    units: goods.reduce((s, g) => s + g.qty, 0),
    goodsCost,
    goodsSale,
    goodsProfit: goodsNet - goodsCost,
    due,
    invested: filament + supplies + goodsCost,
    expected: goodsSale + due
  };
}
function valuationPanel() {
  const v = stockValuation(),
    line = (k, val, cls = '') =>
      '<div class="fin-line ' + cls + '"><span>' + k + '</span><b class="num">' + val + '</b></div>';
  return (
    '<section class="panel report-panel valuation"><div class="panel-h"><h2>Tu dinero hoy</h2><span class="small muted">Al costo de compra y fabricación</span></div><div class="value-tiles"><div><span>Materias primas</span><b class="num">' +
    clp(v.materials) +
    '</b><small>Filamento ' +
    clp(v.filament) +
    ' · Insumos ' +
    clp(v.supplies) +
    '</small></div><div><span>Productos fabricados</span><b class="num">' +
    clp(v.goodsCost) +
    '</b><small>' +
    v.units +
    (v.units === 1 ? ' unidad en stock' : ' unidades en stock') +
    '</small></div><div class="total"><span>Invertido en stock</span><b class="num">' +
    clp(v.invested) +
    '</b><small>Materias primas + fabricados</small></div></div><div class="fin-lines">' +
    line('Si vendes lo fabricado (precio de venta)', clp(v.goodsSale)) +
    line('Utilidad proyectada de lo fabricado', clp(v.goodsProfit), v.goodsProfit < 0 ? 'down' : 'up') +
    line('Por cobrar de pedidos', clp(v.due)) +
    line('= Ingreso proyectado', clp(v.expected), 'total up') +
    '</div>' +
    (v.goods.length
      ? '<details class="value-detail"><summary>Ver productos en stock</summary>' +
        v.goods
          .sort((a, b) => b.sale - a.sale)
          .map(
            g =>
              '<div class="fin-line"><span>' +
              esc(g.p.name) +
              ' · ' +
              g.qty +
              ' un.</span><b class="num">' +
              clp(g.cost) +
              ' → ' +
              clp(g.sale) +
              '</b></div>'
          )
          .join('') +
        '</details>'
      : '') +
    '<p class="small muted fin-note">Las materias primas se valoran al costo promedio de compra; los productos, a su costo de fabricación. El ingreso proyectado no descuenta gastos ni IVA.</p></section>'
  );
}
