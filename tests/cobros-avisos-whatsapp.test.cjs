const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=8)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.0: customer WhatsApp on orders and status updates.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.writes=[];supabase.from=t=>{const c={t};const q={insert(v){c.op='insert';c.v=v;return q},update(v){c.op='update';c.v=v;return q},eq(k,v){c.id=v;return q},select(){return q},single(){return q},order(){return q},
   then(a,b){writes.push(c);return Promise.resolve({data:c.op==='insert'?{id:'new-'+t,...c.v}:[],error:null}).then(a,b)}};return q};
  S.customers=[{id:'c1',name:'Ana Pérez',phone:'+56 9 1111 2222'},{id:'c2',name:'Luis',phone:''}];S.payments=[];S.products=[];S.summaries=new Map();
  S.orders=[{id:'o1',order_no:40,title:'Cuadro Luna',customer_name:'Ana Pérez',customer_id:'c1',kind:'customer',status:'printing',quantity:1,unit_price:20000,iva_enabled:true,iva_rate:.19,estimated_cost:0,due_date:'2026-11-05',created_at:new Date().toISOString(),tracking_token:'a'.repeat(64)},
   {id:'o2',order_no:41,title:'Llavero',customer_name:'Luis',customer_id:'c2',kind:'customer',status:'pending',quantity:1,unit_price:5000,iva_enabled:false,iva_rate:.19,estimated_cost:0,created_at:new Date().toISOString()}];
  loadOrders=async()=>{};loadResources=async()=>{};`);
 // Messages per state, with tracking link.
 assert.match(run('statusMessage(S.orders[0])'),/^Hola Ana, tu pedido PED-40 \(Cuadro Luna\) ya está en impresión\. Entrega estimada: 5 nov\.\nPuedes ver el avance aquí: .*seguimiento\.html#a{64}$/);
 assert.match(run(`statusMessage({...S.orders[0],status:'delivered'})`),/gracias por tu compra/);assert.doesNotMatch(run(`statusMessage({...S.orders[0],status:'delivered'})`),/seguimiento/);
 assert.equal(run(`statusMessage({...S.orders[0],status:'canceled'})`),'');
 // Order dialog: «Avisar al cliente» with the ready-to-send link.
 run(`S.mode='production';render();showOrder(S.orders[0])`);await flush();
 assert.match(run('q("#orderNotify").textContent'),/Avisar al cliente\+56 9 1111 2222/);
 assert.match(decodeURIComponent(run('q("#notifySend").href')),/^https:\/\/wa\.me\/56911112222\?text=Hola Ana, tu pedido PED-40/);
 // No phone: save it on the customer from the order.
 run(`q('#orderDialog').close();showOrder(S.orders[1])`);await flush();
 assert.ok(run('!!q("#notifyPhoneForm")'));
 run(`writes.length=0;q('#notifyPhone').value='+56 9 3333 4444';q('#notifyPhoneForm').requestSubmit()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(writes[0])')),{t:'customers',op:'update',v:{phone:'+56 9 3333 4444'},id:'c2'});
 assert.match(run('q("#notifySend").getAttribute("href")'),/wa\.me\/56933334444/);
 // Changing the state offers the message for the new state.
 run(`q('#orderDialog').close();S.orders[1].status='pending';showOrder(S.orders[1]);q('#orderStatus').value='ready';
  loadOrders=async()=>{S.orders[1]={...S.orders[1],status:'ready'}};q('#orderForm').requestSubmit()`);await flush(12);
 assert.match(run('q("#notifyDialog h2").textContent'),/¿Avisar a Luis\?/);
 assert.match(decodeURIComponent(run('q("#notifyNow").href')),/Hola Luis, tu pedido PED-41 \(Llavero\) ya está listo/);
 run(`q('#notifyDialog').close()`);
 // New order form: phone saved on a new customer; known customers fill it in.
 run(`showQuickJob('order');q('#qjClient').value='Ana Pérez';q('#qjClient').dispatchEvent(new Event('input'))`);
 assert.equal(run('q("#qjPhone").value'),'+56 9 1111 2222');
 run(`q('#quickJobDialog').close()`);
 run(`writes.length=0;ensureCustomer('Marta','+56 9 5555 6666').then(id=>window.newId=id)`);await flush();
 assert.equal(run('writes[0].t+":"+writes[0].op+":"+writes[0].v.phone'),'customers:insert:+56 9 5555 6666');
 // Stock fabrications have no customer card.
 run(`showOrder({...S.orders[0],id:'s',kind:'stock'})`);await flush();assert.equal(run('!!q("#orderNotify")'),false);
 dom.window.close();
 console.log('PASS V4.0: status messages with tracking link, «Avisar al cliente» in the order, save phone, offer message on state change, phone on new orders/customers, stock excluded.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
