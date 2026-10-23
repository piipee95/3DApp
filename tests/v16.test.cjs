const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=()=>new Promise(r=>setTimeout(r,0));
// V1.6 redesign: Inicio indicators, product list, navigation and in-app dialogs.
async function test(){
 let dom=boot(),run=s=>dom.window.run(s);
 const now=new Date(),iso=(y,m,d)=>new Date(y,m,d,12).toISOString(),ym=[now.getFullYear(),now.getMonth()];
 const prev=new Date(ym[0],ym[1]-1,10);
 run(`S.session.user.email='felipe.pino@kultiversopop.cl';
  S.orders=[
   {id:'o1',order_no:1,title:'Cuadro',customer_name:'Andes',quantity:2,unit_price:11900,iva_enabled:true,iva_rate:.19,estimated_cost:8000,status:'printing',due_date:'2000-01-01',created_at:'${iso(ym[0],ym[1],2)}'},
   {id:'o2',order_no:2,title:'Lámpara',customer_name:'',quantity:1,unit_price:10000,iva_enabled:false,iva_rate:.19,estimated_cost:6000,actual_cost:5000,failures_cost:500,status:'delivered',due_date:'2999-01-01',created_at:'${iso(ym[0],ym[1],3)}'},
   {id:'o3',order_no:3,title:'Llavero',customer_name:'Otaku',quantity:10,unit_price:900,iva_enabled:false,iva_rate:.19,estimated_cost:5000,status:'pending',due_date:'2999-12-31',created_at:'${iso(ym[0],ym[1],4)}'},
   {id:'o4',order_no:4,title:'Cancelado',customer_name:'',quantity:1,unit_price:99999,iva_enabled:false,iva_rate:.19,estimated_cost:1,status:'canceled',created_at:'${iso(ym[0],ym[1],5)}'},
   {id:'o5',order_no:5,title:'Mes anterior',customer_name:'',quantity:1,unit_price:20000,iva_enabled:false,iva_rate:.19,estimated_cost:1,status:'delivered',created_at:'${prev.toISOString()}'}];
  S.resources=[{id:'f1',kind:'filament',name:'PLA Negro',unit:'g',unit_cost:16,stock_qty:180,reserved_qty:0,min_stock:500,counted:true,active:true},{id:'m1',kind:'supply',name:'Marco',unit:'un',unit_cost:3500,stock_qty:9,reserved_qty:0,min_stock:3,counted:true,active:true},{id:'p1',kind:'printer',name:'Cobra',power_kw:1.3,active:true}];
  S.mode='home';render()`);
 // Month totals exclude canceled orders and previous months.
 const t=JSON.parse(run(`JSON.stringify(monthTotals(${ym[0]},${ym[1]}))`));
 assert.equal(t.count,3);assert.equal(t.sales,2*11900+10000+9000);
 const net=2*11900/1.19+10000+9000;
 assert(Math.abs(t.profit-((2*11900/1.19-8000)+(10000-5500)+(9000-5000)))<1e-6);
 assert(Math.abs(t.margin-t.profit/net)<1e-9);
 assert.equal(run('q(".page-title").textContent'),'Inicio');
 assert.equal(run('q(".sidebar .nav-item.active").dataset.appMode'),'home');
 assert.match(run('q(".kpis").textContent'),/vs /);
 assert.match(run('q(".kpis").textContent'),/1 atrasado/);
 // Upcoming deliveries: open orders only, earliest first, late ones flagged.
 assert.deepEqual(JSON.parse(run('JSON.stringify(qa(".data-table tbody tr").map(r=>r.dataset.homeOrder))')),['o1','o3']);
 assert.equal(run('q(".data-table tbody tr .chip").textContent'),'Atrasado');
 // Low stock: below-minimum materials first, printers excluded.
 assert.deepEqual(JSON.parse(run('JSON.stringify(qa(".stock-row").map(r=>r.dataset.homeStock))')),['f1','m1']);
 run(`showOrder=o=>{window.opened=o.id};q('[data-home-order=o3]').click()`);
 assert.equal(run('window.opened'),'o3');
 // Product list: table on desktop + rows on phones, ⋯ menu actions, open on row click.
 run(`S.products=[{id:'a',name:'Cuadro',description:'Marco',quantity:1,target_margin:.4,iva_enabled:true,iva_rate:.19,round_to:1000,status:'active',updated_at:new Date().toISOString()},{id:'b',name:'Pérdida',quantity:1,target_margin:.4,iva_enabled:false,iva_rate:.19,round_to:100,status:'active',sale_price:500,updated_at:'2026-01-02T10:00:00Z'},{id:'c',name:'Viejo',quantity:1,target_margin:.4,status:'archived'}];
  S.summaries=new Map([['a',{total_cost:9800}],['b',{total_cost:800}]]);S.mode='dashboard';render()`);
 assert.equal(run('qa(".products-table tbody tr").length'),2);
 assert.equal(run('qa(".list-rows .product-row").length'),2);
 assert.match(run('q(".products-table tbody tr").textContent'),/hoy, /);
 assert.equal(run('q("[data-open=b] .chip").textContent'),'-60%');
 assert.match(run('q("#showArchived").textContent'),/Archivados\s*1/);
 run(`window.calls=[];duplicateProduct=id=>calls.push('dup:'+id);archiveProduct=id=>calls.push('arc:'+id);openProduct=id=>calls.push('open:'+id);render();
  q('.products-table [data-dup=a]').click();q('.products-table [data-arc=a]').click();q('.products-table [data-open=b] td').click()`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(calls)')),['dup:a','arc:a','open:b']);
 run(`S.search='zzz';render()`);
 assert.match(run('q(".panel-empty").textContent'),/Sin resultados/);
 // Phone "Más" sheet reaches Impresoras and account actions.
 run(`S.search='';goMode=m=>{window.went=m};render();q('#moreTab').click()`);
 assert.equal(run('qa("#moreSheet .menu-item").length'),8);
 run(`q('#moreSheet [data-more=resources]').click()`);
 assert.equal(run('window.went'),'resources');
 // In-app confirmation replaces window.confirm when deleting a product.
 run(`window.confirm=()=>{throw new Error('native confirm used')};window.deleted=0;supabase.from=()=>({delete:()=>({eq:async()=>{window.deleted++;return{error:null}}})});loadProducts=async()=>{};
  newProduct();S.product.id='a';render();deleteProduct()`);
 await flush();
 assert.equal(run('q("#confirmDialog h2").textContent'),'Eliminar producto');
 run(`q('#confirmDialog [data-cancel]').click()`);await flush();
 assert.equal(run('window.deleted'),0);
 run(`deleteProduct()`);await flush();run(`q('#confirmDialog [data-confirm]').click()`);await flush();await flush();
 assert.equal(run('window.deleted'),1);
 // The list ⋯ menu deletes any product too; reserved stock blocks it.
 run(`S.products=[{id:'z',name:'Lista',quantity:1,status:'active',stock_qty:2,stock_reserved:0},{id:'y',name:'Reservado',quantity:1,status:'active',stock_qty:2,stock_reserved:1}];S.mode='dashboard';render();q('.products-table [data-del=z]').click()`);await flush();
 assert.match(run('q("#confirmDialog").textContent'),/«Lista».*stock de 2 un\..*pedidos existentes se conservan/);
 run(`q('#confirmDialog [data-confirm]').click()`);await flush();await flush();
 assert.equal(run('window.deleted'),2);
 run(`q('.products-table [data-del=y]').click()`);await flush();
 assert.equal(run('!!q("#confirmDialog")'),false);
 assert.equal(run('window.deleted'),2);
 // Success messages show once as a toast.
 run(`qa('.toast').forEach(t=>t.remove());S.msg='Guardado.';S.mode='dashboard';render();render()`);
 assert.equal(run('qa(".toast").length'),1);
 dom.window.close();
 console.log('PASS V1.6: Inicio month totals and panels, product list table/rows and ⋯ actions, Más sheet, in-app delete confirmation and toasts.');
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1});
