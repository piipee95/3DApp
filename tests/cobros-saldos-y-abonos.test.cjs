const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=4)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V2.0: deposits, balances, receivables and WhatsApp messages.
async function test(){
 let dom=boot(),run=s=>dom.window.run(s);
 run(`window.db={order_payments:[],production_orders:[],quotes:[],customers:[]};window.requests=[];let seq=0;
  supabase.from=table=>{let op='read',value={},filters=[];const result=()=>{requests.push({table,op,value,filters});let rows=db[table]||(db[table]=[]);
   if(op==='insert'){const row={id:table+'-'+(++seq),created_at:new Date().toISOString(),paid_on:new Date().toLocaleDateString('sv-SE'),method:'transfer',note:'',...(table==='production_orders'?{order_no:50+rows.length,status:'pending'}:{}),...(table==='quotes'?{quote_no:rows.length+1,status:'sent'}:{}),...value};rows.push(row);return{data:row,error:null}}
   let found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
   if(op==='update'){found.forEach(r=>Object.assign(r,value));return{data:found[0],error:null}}
   if(op==='delete'){db[table]=rows.filter(r=>!found.includes(r));return{data:null,error:null}}
   return{data:found,error:null}};
   const query={select(){return query},eq(k,v){filters.push([k,v]);return query},not(){return query},order(){return query},limit(){return query},insert(v){op='insert';value=v;return query},update(v){op='update';value=v;return query},delete(){op='delete';return query},single(){const r=result();return Promise.resolve({...r,data:Array.isArray(r.data)?r.data[0]:r.data})},then(a,b){return Promise.resolve(result()).then(a,b)}};return query};
  window.opened=[];window.open=(url)=>{opened.push(url);return url?null:{location:{set href(v){opened.push(v)}}}};
  S.customers=[{id:'c1',name:'Camila Rojas',phone:'9 1234 5678'}];
  S.orders=db.production_orders;
  db.production_orders.push({id:'o1',order_no:12,title:'Cuadro Iron Man',customer_id:'c1',customer_name:'Camila Rojas',kind:'customer',quantity:2,unit_price:20000,iva_enabled:true,iva_rate:.19,estimated_cost:18000,status:'ready',created_at:new Date().toISOString()},
   {id:'o2',order_no:13,title:'Llavero',customer_name:'Ana',kind:'customer',quantity:1,unit_price:5000,iva_enabled:false,iva_rate:.19,estimated_cost:1000,status:'canceled',created_at:new Date().toISOString()},
   {id:'o3',order_no:14,title:'Stock',kind:'stock',quantity:3,unit_price:0,estimated_cost:9000,status:'pending',created_at:new Date().toISOString()});
  S.mode='production';S.orderFilter='all';render()`);
 // Balance: total 40.000, nothing paid; canceled and stock orders owe nothing.
 assert.deepEqual(JSON.parse(run('JSON.stringify(orderBalance(S.orders[0]))')),{total:40000,paid:0,due:40000,state:'unpaid'});
 assert.equal(run('orderBalance(S.orders[1]).due'),0);assert.equal(run('orderBalance(S.orders[2]).due'),0);
 assert.match(run('q("[data-order=o1]").textContent'),/Saldo \$40\.000/);
 assert.match(run('q("[data-order-filter=unpaid]").textContent'),/Por cobrar\s*1/);
 // Register a 50% deposit from the order dialog.
 run(`showOrder(S.orders[0])`);
 assert.match(run('q("#orderPayments").textContent'),/Total\$40\.000.*Pagado\$0.*Saldo\$40\.000/);
 assert.match(run('q("#orderPayments .chip").textContent'),/Sin pago/);
 run(`q('[data-pay-fill=half]').click()`);
 assert.equal(run('q("#payAmount").value'),'20000');
 run(`q('#payMethod').value='cash';q('#payNote').value='Abono 50%';q('#payForm').requestSubmit()`);await flush();
 const pay=JSON.parse(run('JSON.stringify(db.order_payments[0])'));
 assert.equal(pay.amount,20000);assert.equal(pay.method,'cash');assert.equal(pay.order_id,'o1');assert.equal(pay.note,'Abono 50%');
 assert.match(run('q("#orderPayments").textContent'),/Pagado\$20\.000.*Saldo\$20\.000/);
 assert.match(run('q("#orderPayments .chip").textContent'),/Abonado/);
 assert.equal(run('q(".pay-bar i").style.width'),'50%');
 assert.equal(run('!!q("[data-pay-fill=half]")'),false);
 // WhatsApp: ready, balance and payment messages go to the customer's chat.
 run(`q('[data-wa=ready]').click();q('[data-wa=due]').click();q('[data-wa=paid]').click()`);
 const msgs=JSON.parse(run('JSON.stringify(opened)')).map(u=>[u.split('?')[0],decodeURIComponent(u.split('text=')[1])]);
 assert.equal(msgs[0][0],'https://wa.me/56912345678');
 assert.match(msgs[0][1],/^Hola Camila, tu pedido PED-12 \(Cuadro Iron Man\) ya está listo\. Saldo pendiente: \$20\.000\./);
 assert.match(msgs[1][1],/saldo de tu pedido PED-12.*\$20\.000 \(total \$40\.000, abonado \$20\.000\)/);
 assert.match(msgs[2][1],/recibimos tu pago de \$20\.000.*Saldo pendiente: \$20\.000/);
 // Pay the rest: paid in full, no form, list and filter update.
 run(`q('[data-pay-fill=due]').click();q('#payForm').requestSubmit()`);await flush();
 assert.equal(run('orderBalance(S.orders[0]).state'),'paid');
 assert.equal(run('!!q("#payForm")'),false);
 assert.match(run('q("#orderPayments .chip").textContent'),/Pagado/);
 // Deleting a payment brings the balance back.
 run(`q('[data-del-payment]').click()`);await flush();
 assert.equal(run('orderBalance(S.orders[0]).due'),20000);
 run(`q('#orderDialog').close()`);
 // Inicio shows receivables and jumps to the filter.
 run(`S.products=[];S.resources=[];S.mode='home';render()`);
 assert.match(run('q(".kpis").textContent'),/Por cobrar\$20\.000\$20 mil1 pedido con saldo/);
 run(`goMode=async m=>{S.mode=m;render()};q('#homeDue').click()`);await flush();
 assert.equal(run('S.orderFilter'),'unpaid');assert.equal(run('qa(".data-table tbody tr").length'),1);
 // Customer card shows what they owe.
 run(`S.quotes=[];showCustomer(S.customers[0])`);
 assert.match(run('q("#customerDialog .facts").textContent'),/Por cobrar\$20\.000/);
 run(`q('#customerDialog').close()`);
 // New customer order with an initial deposit.
 run(`ensureCustomer=async()=>'c1';refreshProductStock=async()=>{};loadResources=async()=>{};newProduct();S.product.id='p1';S.product.name='Lámpara';S.product.directCosts[0].amount=10000;S.dirty=false;S.mode='product';render();showNewOrder()`);
 run(`q('#orderCustomer').value='Camila Rojas';q('#orderDeposit').value='5000';q('#newOrderForm').requestSubmit()`);await flush(6);
 const dep=JSON.parse(run('JSON.stringify(db.order_payments.at(-1))'));
 assert.equal(dep.amount,5000);assert.equal(dep.note,'Abono inicial');assert.equal(dep.order_id,run('db.production_orders.at(-1).id'));
 // Quote WhatsApp: saves, then opens the customer's chat with the summary.
 run(`opened.length=0;S.customers.push({id:'c2',name:'Comercial Andes',phone:'+56 9 8765 4321'});S.mode='product';render();q('[data-editor-tab=summary]')?.click();showQuote();q('#quoteClient').value='Comercial Andes';q('#quoteClient').dispatchEvent(new Event('input'));q('#waQuote').click()`);await flush(6);
 const wa=JSON.parse(run('JSON.stringify(opened)')).filter(Boolean).at(-1);
 assert.match(wa,/^https:\/\/wa\.me\/56987654321\?text=/);
 const text=decodeURIComponent(wa.split('text=')[1]);
 assert.match(text,/^Hola Comercial, te envío la cotización COT-0001 de Kultiverso Pop:\n• Lámpara × 1\nTotal: \$[\d.]+ \(IVA incluido\)\nVálida hasta el /);
 // Viewers see balances but cannot register or delete payments.
 run(`q('#closeQuote').click();S.workspace.role='viewer';showOrder(S.orders[0])`);
 assert.ok(run('!!q("#orderPayments")'));
 assert.equal(run('!!q("#payForm")||!!q("[data-del-payment]")'),false);
 dom.window.close();
 console.log('PASS V2.0: balances (canceled/stock owe nothing), deposits 50%/saldo, delete, receivables KPI/filter, customer debt, initial deposit, WhatsApp order and quote messages, viewer limits.');
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1});
