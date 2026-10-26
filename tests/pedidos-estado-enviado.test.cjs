const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const{JSDOM}=require('jsdom');
const{boot}=require('./boot.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// 5.2: «Enviado» between «Listo» and «Entregado»: on its way, still open, never late, and the customer is told.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`S.customers=[{id:'c1',name:'Ana Pérez',phone:'+56 9 1234 5678'}];
  const base={customer_name:'Ana Pérez',customer_id:'c1',kind:'customer',quantity:1,unit_price:20000,iva_enabled:false,iva_rate:.19,estimated_cost:0,inventory_state:'none',created_at:new Date().toISOString()};
  S.orders=[{...base,id:'o1',order_no:31,title:'Cuadro Luna',status:'shipped',due_date:'2020-01-01'},
   {...base,id:'o2',order_no:32,title:'Llavero',status:'ready',due_date:'2020-01-01'},
   {...base,id:'o3',order_no:33,title:'Lote',kind:'stock',status:'printing'}];
  S.payments=[];loadOrders=async()=>{};loadResources=async()=>{};`);
 // Label, order of states and chip.
 assert.deepEqual(JSON.parse(run('JSON.stringify(Object.keys(ORDER_STATUSES))')),['pending','printing','assembly','ready','shipped','delivered','canceled']);
 assert.equal(run('ORDER_STATUSES.shipped'),'Enviado');
 assert.match(run('orderChip(S.orders[0])'),/c-ship.*Enviado/);
 // Still open (counts as in progress) but never late; a ready order past its date still is.
 assert.ok(run('orderIsOpen(S.orders[0])'));assert.ok(!run('orderIsLate(S.orders[0])'));assert.ok(run('orderIsLate(S.orders[1])'));
 assert.ok(!run('orderIsOpen({kind:"stock",status:"shipped"})'));
 // The orders list has an «Enviado» filter.
 run(`S.mode='production';render()`);await flush();
 assert.match(run('document.body.textContent'),/Enviado/);
 // The state select offers it for customer orders, not for a fabrication for stock.
 run(`showOrder(S.orders[0])`);await flush();
 assert.ok(run('!!q("#orderStatus option[value=shipped]")'));
 assert.match(run('statusMessage(S.orders[0])'),/Hola Ana, tu pedido PED-31 \(Cuadro Luna\) ya va en camino\. Saldo pendiente: \$20\.000\./);
 run(`document.querySelectorAll('dialog[open]').forEach(d=>d.close());showOrder(S.orders[2])`);await flush();
 assert.ok(run('!q("#orderStatus option[value=shipped]")'));
 // Inicio: shipped with a balance is a collection reminder.
 assert.match(run('JSON.stringify(reminders())'),/Enviado con saldo pendiente de \$20\.000/);
 dom.window.close();
 // Public tracking: «Enviado» is a step before «Entregado».
 const page=new JSDOM('<section id="tracking"></section>',{url:'https://kultiapp.vercel.app/seguimiento.html#'+'d'.repeat(64),runScripts:'outside-only'});
 page.window.mockClient={rpc:async()=>({data:{business:'Kultiverso Pop',whatsapp:'',order_no:31,title:'Cuadro Luna',quantity:1,status:'shipped',created_at:'2026-10-20T12:00:00Z',updated_at:'2026-10-23T12:00:00Z',total:20000,paid:20000,balance:0,photos_folder:null},error:null}),storage:{from:()=>({list:async()=>({data:[],error:null})})}};
 page.window.eval(fs.readFileSync(path.join(__dirname,'..','seguimiento.js'),'utf8').replace(/^import[^\n]+\n/,'').replace(/^const client\s*=\s*createClient\([\s\S]*?\}\s*\}\s*\);?\n/m,'const client=window.mockClient;\n'));
 await flush();
 const t=page.window.document;
 assert.match(t.querySelector('.track-steps li.now').textContent,/Enviado.*Tu pedido va en camino/);
 assert.equal(t.querySelectorAll('.track-steps li.done').length,4);
 page.window.close();
 console.log('PASS 5.2 estado Enviado: entre Listo y Entregado, sigue en curso sin atrasarse, aviso por WhatsApp, filtro, solo en pedidos de cliente, recordatorio de cobro y paso en el seguimiento.');
}
test().catch(e=>{console.error(e);process.exit(1)});
