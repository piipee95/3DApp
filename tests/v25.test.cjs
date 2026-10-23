const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V2.5: quick quotes and orders for custom jobs without a product.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.db={production_orders:[],quotes:[],customers:[],order_payments:[]};let seq=0;
  supabase.from=table=>{let op='read',value={},filters=[];const result=()=>{let rows=db[table]||(db[table]=[]);
   if(op==='insert'){const row={id:table+'-'+(++seq),created_at:new Date().toISOString(),paid_on:new Date().toLocaleDateString('sv-SE'),...(table==='production_orders'?{order_no:70+rows.length,status:'pending',kind:'customer'}:{}),...(table==='quotes'?{quote_no:30+rows.length,status:'sent'}:{}),...value};rows.push(row);return{data:row,error:null}}
   let found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));return{data:found,error:null}};
   const query={select(){return query},eq(k,v){filters.push([k,v]);return query},order(){return query},limit(){return query},insert(v){op='insert';value=v;return query},single(){const r=result();return Promise.resolve({...r,data:Array.isArray(r.data)?r.data[0]:r.data})},then(a,b){return Promise.resolve(result()).then(a,b)}};return query};
  loadResources=async()=>{};S.mode='home';render()`);
 // "Nuevo" in the sidebar and on Inicio opens the create menu.
 assert.ok(run('!!q(".sidebar [data-open-create]")'));
 run(`q('#homeNew').click()`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(qa("#createMenu [data-create]").map(b=>b.dataset.create))')),['quote','order','product']);
 // Quick order: agreed price, IVA, 50% deposit, no product.
 run(`q('#createMenu [data-create=order]').click()`);
 assert.equal(run('q("#quickJobDialog h2").textContent'),'Nuevo pedido');
 run(`q('#qjClient').value='Camila Rojas';q('#qjTitle').value='Cuadro mascota personalizado';q('#qjQty').value=2;q('#qjPrice').value=25000;q('#qjPrice').dispatchEvent(new Event('input'));q('#qjHalf').click()`);
 assert.match(run('q("#qjTotal").textContent'),/Total: \$50\.000 \(neto \$42\.017 \+ IVA\) · 50% = \$25\.000/);
 assert.equal(run('q("#qjDeposit").value'),'25000');
 run(`q('#qjMethod').value='cash';q('#quickJobForm').requestSubmit()`);await flush(10);
 const order=JSON.parse(run('JSON.stringify(db.production_orders[0])'));
 assert.equal(order.product_id,null);assert.equal(order.title,'Cuadro mascota personalizado');assert.equal(order.quantity,2);
 assert.equal(order.unit_price,25000);assert.equal(order.iva_enabled,true);assert.equal(order.kind,'customer');assert.ok(order.customer_id);
 assert.deepEqual(JSON.parse(run('JSON.stringify(db.order_payments.map(p=>[p.amount,p.method,p.note]))')),[[25000,'cash','Abono inicial']]);
 assert.equal(run('db.customers[0].name'),'Camila Rojas');
 // The order opens with its balance and the custom-job notice to cost it later.
 assert.ok(run('!!q("#orderDialog")'));
 assert.match(run('q("#orderPayments").textContent'),/Pagado\$25\.000.*Saldo\$25\.000/);
 assert.match(run('q(".job-notice").textContent'),/Trabajo a medida/);
 run(`q('#jobToProduct').click()`);
 assert.equal(run('S.mode'),'product');assert.equal(run('S.product.name'),'Cuadro mascota personalizado');assert.equal(run('S.product.sale_price'),25000);
 // Deposit can't exceed the total.
 run(`showQuickJob('order');q('#qjClient').value='Ana';q('#qjTitle').value='Llavero';q('#qjPrice').value=1000;q('#qjDeposit').value=5000;q('#quickJobForm').requestSubmit()`);await flush();
 assert.match(run('q("#qjFeedback").textContent'),/no puede superar/);
 run(`q('#quickJobDialog').close()`);
 // Quick quote: saved with folio, no product, then opened to share.
 run(`S.mode='quotes';render();q('#newJobQuote').click();q('#qjClient').value='Comercial Andes';q('#qjTitle').value='Trofeo 3D';q('#qjDetail').value='Base negra con logo';q('#qjPrice').value=18000;q('#qjIva').checked=false;q('#quickJobForm').requestSubmit()`);await flush(10);
 const quote=JSON.parse(run('JSON.stringify(db.quotes[0])'));
 assert.equal(quote.product_id,null);assert.equal(quote.title,'Trofeo 3D');assert.equal(quote.description,'Base negra con logo');assert.equal(quote.iva_enabled,false);assert.equal(quote.unit_cost,0);
 assert.ok(run('!!q("#quoteDialog")'));
 assert.match(run('q("#quoteSheet").textContent'),/COT-0030.*Comercial Andes.*Trofeo 3D/);
 run(`q('#closeQuote').click()`);
 // Accepting a product-less quote offers 50% and explains the custom job.
 run(`showQuoteToOrder(S.quotes[0])`);
 assert.match(run('q("#quoteOrderDialog").textContent'),/Trabajo a medida/);
 run(`q('[data-deposit-half]').click()`);
 assert.equal(run('q("#orderDeposit").value'),'9000');
 run(`q('#quoteOrderDialog').close()`);
 // From a customer card.
 run(`S.customers=db.customers;showCustomer(S.customers[0]);q('[data-customer-new=quote]').click()`);
 assert.equal(run('q("#qjClient").value'),'Camila Rojas');
 run(`q('#quickJobDialog').close()`);
 // Viewers don't get create actions.
 run(`S.workspace.role='viewer';S.mode='home';render()`);
 assert.equal(run('!!q("[data-open-create]")||!!q("#homeNew")'),false);
 dom.window.close();
 console.log('PASS V2.5: create menu, quick order (agreed price, IVA, 50% deposit, custom job), cost later as product, quick quote with folio, product-less quote → order, customer shortcuts, viewer limits.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
