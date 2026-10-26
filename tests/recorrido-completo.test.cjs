const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=20)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// 5.0: the whole business flow with a realistic workshop (material → product → stock → quote → order →
// payment → finance/reports): every screen must show the same figures for the same thing.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s),text=sel=>run(`[...qa('${sel}')].map(e=>e.textContent).join(' | ')`);
 run(`const now=new Date(),iso=d=>new Date(now.getFullYear(),now.getMonth(),d,12).toISOString();
  supabase.from=t=>{const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},contains(){return q},gte(){return q},lt(){return q},then(a,b){return Promise.resolve({data:[],error:null}).then(a,b)}};return q};
  loadOrders=loadResources=loadProducts=loadQuotes=loadCustomers=loadExpenses=loadTransfers=loadFailures=async()=>{};
  S.workspace={id:'w',role:'owner',name:'Kultiverso Pop'};S.settings={partners:[]};S.transfers=[];S.failures=[];
  S.resources=[
   {id:'pla',kind:'filament',name:'PLA Rojo',unit:'g',unit_cost:15.7,price_per_kg:15700,stock_qty:927.1,reserved_qty:0,min_stock:250,counted:true,active:true,counted_at:iso(1)},
   {id:'cuadro',kind:'supply',name:'Cuadro (Alto 4cm)',unit:'un',unit_cost:3000,stock_qty:12,reserved_qty:0,min_stock:5,counted:true,active:true,counted_at:iso(1)},
   {id:'caja',kind:'supply',name:'Caja Embalaje',unit:'un',unit_cost:380,stock_qty:43,reserved_qty:0,min_stock:0,counted:true,active:true,counted_at:iso(1)},
   {id:'imp',kind:'printer',name:'Anycubic Cobra X',active:true,power_kw:1.3,hours_used:16}];
  S.products=[
   {id:'spider',name:'Cuadro Spiderman',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,target_margin:.4,round_to:1000,stock_qty:1,stock_reserved:0,catalog_price:12990},
   {id:'f1',name:'Cuadro Formula 1',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,target_margin:.4,round_to:1000,sale_price:20000,stock_qty:0,stock_reserved:0}];
  S.summaries=new Map([['spider',{total_cost:6261}],['f1',{total_cost:5772}]]);
  S.customers=[{id:'c1',name:'Constanza',phone:''}];
  S.orders=[
   {id:'o22',order_no:22,title:'Cuadro Formula 1',product_id:'f1',customer_id:'c1',customer_name:'Constanza',kind:'customer',status:'assembly',inventory_state:'consumed',quantity:1,unit_price:20000,iva_enabled:true,iva_rate:.19,estimated_cost:5772,actual_cost:5772,failures_cost:0,due_date:iso(26).slice(0,10),created_at:iso(2)},
   {id:'o28',order_no:28,title:'Cuadro Spiderman',product_id:'spider',kind:'stock',status:'ready',inventory_state:'consumed',stock_state:'added',quantity:1,unit_price:0,estimated_cost:6261,actual_cost:6261,created_at:iso(2)}];
  S.payments=[{id:'p1',order_id:'o22',amount:10000,method:'transfer',paid_on:iso(2).slice(0,10)}];
  S.quotes=[{id:'q3',quote_no:3,client_name:'Constanza',customer_id:'c1',product_id:'f1',title:'Cuadro Formula 1',quantity:1,unit_price:20000,iva_enabled:true,iva_rate:.19,unit_cost:0,validity_days:15,status:'accepted',order_id:'o22',created_at:iso(1)}];
  S.expenses=[{id:'e1',spent_on:iso(2).slice(0,10),category:'publicidad',description:'Publicidad meta',amount:10000,has_invoice:false,iva_amount:0}];`);
 // Money in materials: Inventario, Inicio and Finanzas agree. 927,1 g × 15,7 + 12 × 3.000 + 43 × 380 = $66.895.
 const materials=run('clp(stockValuation().materials)');assert.equal(materials,'$66.895');
 run(`S.mode='inventory';render()`);assert.match(text('.summary-strip'),new RegExp('Valor materia prima\\'+materials));
 run(`S.mode='home';render()`);assert.match(text('.kpis'),new RegExp('Materia prima\\'+materials));
 run(`S.mode='finance';render()`);assert.match(text('.valuation'),new RegExp('\\'+materials));
 // Finished goods in stock: one Spiderman at its cost ($6.261), same on Inicio and Finanzas.
 run(`S.mode='home';render()`);assert.match(text('.kpis'),/Productos en stock\$6\.261/);
 run(`S.mode='finance';render()`);assert.match(text('.valuation'),/\$6\.261/);
 // Sales of the month: only the customer order counts (the fabrication is stock, not a sale).
 const month=JSON.parse(run('JSON.stringify(monthTotals(new Date().getFullYear(),new Date().getMonth()))'));
 const rep=JSON.parse(run('JSON.stringify((({total,net,profit})=>({total,net,profit}))(monthReport(new Date().getFullYear(),new Date().getMonth())))'));
 assert.equal(month.sales,20000);assert.equal(rep.total,month.sales);assert.equal(Math.round(rep.profit),Math.round(month.profit));
 // Real profit: net 16.807 − real cost 5.772 = 11.035 on Inicio, Reportes and Finanzas.
 assert.equal(Math.round(month.profit),11035);
 const fin=JSON.parse(run('JSON.stringify((({gross,overhead,real})=>({gross,overhead,real}))(financeMonth(new Date().getFullYear(),new Date().getMonth())))'));
 assert.equal(Math.round(fin.gross),11035);assert.equal(fin.overhead,10000);assert.equal(Math.round(fin.real),1035);
 // Still to collect: $10.000 of PED-22, the same on Inicio, the customer and Finanzas.
 assert.equal(run('receivables().reduce((s,o)=>s+orderBalance(o).due,0)'),10000);
 run(`S.mode='home';render()`);assert.match(text('.kpis'),/Por cobrar\$10\.000/);
 run(`showCustomer(S.customers[0])`);assert.match(text('#customerDialog .facts'),/Por cobrar\$10\.000/);
 // The quote saved without cost uses its product's cost: profit 16.807 − 5.772.
 assert.equal(Math.round(run('quoteSums(S.quotes[0]).profit')),11035);
 // Nothing to buy (all above minimum, nothing reserved) and nothing left uncounted this month.
 assert.equal(run('shoppingList(new Map()).length'),0);assert.equal(run('countDue().length'),0);
 // From the quote to its order and to the customer: same figures, one click away.
 run(`showOrder(S.orders[0])`);await flush();assert.equal(run('S.mode'),'order');
 assert.match(text('#orderDialog .facts'),/Venta\$20\.000/);assert.match(text('#orderDialog .pay-card'),/Saldo\$10\.000/);
 dom.window.close();
 console.log('PASS 5.0 recorrido: materia prima, productos en stock, ventas/utilidad del mes, utilidad real, por cobrar y cotización coinciden en Inicio, Inventario, Finanzas, Reportes, cliente y pedido.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
