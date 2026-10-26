const assert = require('node:assert/strict');
const fs = require('node:fs'),
  os = require('node:os'),
  path = require('node:path'),
  { execFileSync } = require('node:child_process');
const { boot } = require('./boot.cjs');
const flush = async (k = 4) => {
  for (let i = 0; i < k; i++) await new Promise(r => setTimeout(r, 0));
};
// Unzips a stored (uncompressed) xlsx and checks every CRC.
function readZip(buf) {
  const files = {};
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const crc = buf.readUInt32LE(i + 14),
      size = buf.readUInt32LE(i + 18),
      nl = buf.readUInt16LE(i + 26),
      xl = buf.readUInt16LE(i + 28);
    const name = buf.slice(i + 30, i + 30 + nl).toString(),
      data = buf.slice(i + 30 + nl + xl, i + 30 + nl + xl + size);
    assert.equal(require('node:zlib').crc32 ? require('node:zlib').crc32(data) : crc, crc, 'crc ' + name);
    files[name] = data.toString();
    i += 30 + nl + xl + size;
  }
  assert.equal(buf.readUInt32LE(i), 0x02014b50, 'central directory');
  return files;
}
// V2.1: monthly report, Excel export and backup.
async function test() {
  let dom = boot(),
    run = s => dom.window.run(s);
  dom.window.TextEncoder = TextEncoder;
  dom.window.Blob = Blob;
  run(`window.files=[];downloadBlob=(blob,name)=>files.push({blob,name});
  S.customers=[{id:'c1',name:'Camila'}];
  S.orders=[
   {id:'o1',order_no:1,title:'Cuadro',product_id:'p1',customer_id:'c1',customer_name:'Camila',kind:'customer',quantity:2,unit_price:11900,iva_enabled:true,iva_rate:.19,estimated_cost:8000,actual_cost:9000,failures_cost:0,status:'delivered',created_at:'2026-10-05T12:00:00Z',due_date:'2026-10-10'},
   {id:'o2',order_no:2,title:'Cuadro',product_id:'p1',customer_name:'Ana & <Co>',kind:'customer',quantity:1,unit_price:10000,iva_enabled:false,iva_rate:.19,estimated_cost:4000,status:'pending',created_at:'2026-10-20T12:00:00Z'},
   {id:'o3',order_no:3,title:'Llavero',product_id:'p2',customer_name:'Camila',customer_id:'c1',kind:'customer',quantity:10,unit_price:900,iva_enabled:false,iva_rate:.19,estimated_cost:3000,status:'canceled',created_at:'2026-10-21T12:00:00Z'},
   {id:'o4',order_no:4,title:'Cuadro',product_id:'p1',kind:'stock',quantity:3,unit_price:0,estimated_cost:12000,status:'ready',created_at:'2026-10-22T12:00:00Z'},
   {id:'o5',order_no:5,title:'Lámpara',product_id:'p3',customer_name:'Luis',kind:'customer',quantity:1,unit_price:20000,iva_enabled:false,iva_rate:.19,estimated_cost:8000,status:'delivered',created_at:'2026-09-15T12:00:00Z'}];
  S.payments=[{id:'pa1',order_id:'o1',amount:23800,method:'transfer',paid_on:'2026-10-06',note:''},{id:'pa2',order_id:'o2',amount:5000,method:'cash',paid_on:'2026-10-20',note:'Abono'},{id:'pa3',order_id:'o5',amount:20000,method:'cash',paid_on:'2026-09-15',note:''}];
  S.quotes=[{id:'q1',quote_no:1,title:'Cuadro',client_name:'Camila',quantity:2,unit_price:11900,iva_enabled:true,iva_rate:.19,validity_days:15,status:'accepted',created_at:'2026-10-01T12:00:00Z'},{id:'q2',quote_no:2,title:'Llavero',client_name:'X',quantity:1,unit_price:900,iva_enabled:false,iva_rate:.19,validity_days:15,status:'rejected',created_at:'2026-10-02T12:00:00Z'},{id:'q3',quote_no:3,title:'Llavero',client_name:'Y',quantity:1,unit_price:900,iva_enabled:false,iva_rate:.19,validity_days:15,status:'sent',created_at:'2026-10-03T12:00:00Z'}];
  S.reportMonth=[2026,9];S.mode='reports';render()`);
  // Month totals: canceled and stock orders excluded, real cost when present.
  const r = JSON.parse(run('JSON.stringify(monthReport(2026,9))'));
  assert.equal(r.total, 33800);
  assert.equal(r.sales.length, 2);
  assert(Math.abs(r.net - (23800 / 1.19 + 10000)) < 1e-6);
  assert(Math.abs(r.profit - (20000 - 9000 + (10000 - 4000))) < 1e-6);
  assert.equal(r.collected, 28800);
  assert.equal(r.madeUnits, 3);
  assert.equal(r.madeCost, 12000);
  assert.equal(r.closeRate, 0.5);
  assert.equal(r.realCount, 1);
  assert.equal(r.estCost, 8000);
  assert.equal(r.realCost, 9000);
  assert.deepEqual(
    r.products.map(p => [p.name, p.units, p.sales]),
    [['Cuadro', 3, 33800]]
  );
  assert.deepEqual(
    r.customers.map(c => [c.name, c.orders, c.due]),
    [
      ['Camila', 1, 0],
      ['Ana & <Co>', 1, 5000]
    ]
  );
  // View: month label, comparison with September, tables and chart.
  assert.equal(run('q(".page-title").textContent'), 'Reportes');
  assert.equal(run('q(".month-nav b").textContent'), 'Octubre 2026');
  assert.match(run('q(".report-kpis").textContent'), /Ventas\$33\.800\+69% vs septiembre/);
  assert.match(run('q(".report-kpis").textContent'), /Cobrado en el mes\$28\.8002 pagos/);
  assert.match(run('q(".report-kpis").textContent'), /Cotizaciones350% aceptadas/);
  assert.equal(run('qa(".bar-col").length'), 6);
  assert.match(run('qa(".report-table")[1].textContent'), /Ana &amp;|Ana & <Co>/);
  assert.match(run('document.body.innerHTML'), /Ana &amp; &lt;Co&gt;/);
  assert.match(run('qa(".report-panel")[3].textContent'), /\$8\.000.*\$9\.000 \(\+13%\)/);
  run(`q('#prevMonth').click()`);
  assert.equal(run('q(".month-nav b").textContent'), 'Septiembre 2026');
  assert.match(run('q(".report-kpis").textContent'), /Ventas\$20\.000/);
  run(`q('#nextMonth').click()`);
  // Excel export opens as a valid workbook with the expected sheets and numbers.
  run(`q('#exportReport').click()`);
  await flush();
  assert.equal(run('files[0].name'), 'KultiApp-reporte-2026-10.xlsx');
  const bytes = await dom.window.eval(`files[0].blob.arrayBuffer()`);
  const zip = readZip(Buffer.from(bytes));
  assert.match(
    zip['xl/workbook.xml'],
    /name="Resumen".*name="Pedidos".*name="Por producto".*name="Por cliente".*name="Pagos".*name="Cotizaciones"/
  );
  assert.match(
    zip['xl/worksheets/sheet1.xml'],
    /Ventas \(con IVA\)<\/t><\/is><\/c><c r="B3" s="2"><v>33800<\/v>/
  );
  assert.match(zip['xl/worksheets/sheet2.xml'], /Ana &amp; &lt;Co&gt;/);
  assert.match(zip['xl/worksheets/sheet5.xml'], /Abono/);
  const tmp = path.join(os.tmpdir(), 'kulti-report.xlsx');
  fs.writeFileSync(tmp, Buffer.from(bytes));
  try {
    const out = execFileSync('python3', [
      '-c',
      "import sys,openpyxl;wb=openpyxl.load_workbook(sys.argv[1]);print(wb.sheetnames, wb['Resumen']['B3'].value, wb['Pedidos'].max_row)",
      tmp
    ]).toString();
    assert.match(
      out,
      /\['Resumen', 'Pedidos', 'Por producto', 'Por cliente', 'Pagos', 'Cotizaciones', 'Gastos'\] 33800 3/
    );
  } catch (e) {
    if (!/No module named|ENOENT/.test(String(e.stderr || e.message))) throw e;
  }
  // Backup: every table of the workspace, prints and costs by product ids.
  run(`window.calls=[];supabase.from=table=>{const q={_t:table,select(){return q},eq(k,v){calls.push(table+':'+k+'='+v);return q},in(k,v){calls.push(table+':'+k+' in '+v.join(','));return q},then(a,b){const rows=table==='products'?[{id:'p1',name:'Cuadro',materials:[{a:1}]}]:table==='print_jobs'?[{id:'j1',product_id:'p1',filaments:[{name:'Negro'}]}]:[];return Promise.resolve({data:rows,error:null}).then(a,b)}};return q};
  files.length=0;showBackup()`);
  assert.match(run('q("#backupDialog").textContent'), /Aún no has descargado un respaldo/);
  run(`q('[data-backup=json]').click()`);
  await flush(30);
  const calls = JSON.parse(run('JSON.stringify(calls)'));
  assert.ok(calls.includes('print_jobs:product_id in p1'));
  assert.ok(calls.includes('quotes:workspace_id=' + run('S.workspace.id')));
  assert.equal(calls.length, 16);
  const json = JSON.parse(await dom.window.eval(`files[0].blob.text()`));
  assert.equal(json.app, 'KultiApp');
  assert.equal(json.tables.products[0].name, 'Cuadro');
  assert.equal(json.tables.print_jobs[0].filaments[0].name, 'Negro');
  assert.match(run('files[0].name'), /^KultiApp-respaldo-\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(run('q("#backupFeedback").textContent'), /Respaldo descargado: 2 registros/);
  run(`q('[data-backup=xlsx]').click()`);
  await flush(30);
  const bz = readZip(Buffer.from(await dom.window.eval(`files[1].blob.arrayBuffer()`)));
  assert.match(bz['xl/workbook.xml'], /name="Productos"/);
  assert.match(bz['xl/worksheets/sheet3.xml'], /\[\{&quot;name&quot;:&quot;Negro&quot;\}\]/);
  run(`q('#backupDialog').close();showBackup()`);
  assert.match(run('q("#backupDialog").textContent'), /Último respaldo desde este equipo/);
  run(`q('#backupDialog').close()`);
  // Reachable from the phone "Más" sheet.
  run(`S.mode='dashboard';render();q('#moreTab').click()`);
  assert.ok(run('!!q("#moreSheet [data-more=reports]")'));
  dom.window.close();
  console.log(
    'PASS V2.1: monthly report (sales, profit real/estimated, collected, quotes, stock fabrication, by product/customer, 6-month chart, month navigation), valid Excel export and full backup (JSON/Excel).'
  );
}
if (require.main === module)
  test().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
