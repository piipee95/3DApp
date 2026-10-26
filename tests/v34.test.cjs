const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V3.4: Pendientes on Inicio and the once-a-day summary.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`const day=k=>addDays(localToday(),k),ago=d=>new Date(Date.now()-d*864e5).toISOString();
  window.calls=[];showOrder=o=>calls.push(['order',o.id]);showSavedQuote=q=>calls.push(['quote',q.id]);goMode=m=>calls.push(['go',m]);
  S.products=[];S.summaries=new Map();
  S.orders=[
   {id:'late',order_no:1,title:'Cuadro A',kind:'customer',status:'printing',due_date:day(-2),quantity:1,unit_price:10000,created_at:ago(5)},
   {id:'today',order_no:2,title:'Cuadro B',kind:'customer',status:'assembly',due_date:day(0),quantity:1,unit_price:10000,created_at:ago(5)},
   {id:'tom',order_no:3,title:'Cuadro C',kind:'customer',status:'pending',due_date:day(1),quantity:1,unit_price:10000,created_at:ago(5)},
   {id:'later',order_no:4,title:'Cuadro D',kind:'customer',status:'pending',due_date:day(9),quantity:1,unit_price:10000,created_at:ago(5)},
   {id:'ready',order_no:5,title:'Cuadro E',kind:'customer',status:'ready',due_date:day(5),quantity:2,unit_price:10000,created_at:ago(5)},
   {id:'owed',order_no:6,title:'Cuadro F',kind:'customer',status:'delivered',due_date:day(-9),quantity:1,unit_price:15000,created_at:ago(20)},
   {id:'paid',order_no:7,title:'Cuadro G',kind:'customer',status:'delivered',due_date:day(-9),quantity:1,unit_price:5000,created_at:ago(20)},
   {id:'stk',order_no:8,title:'Stock',kind:'stock',status:'ready',due_date:day(3),quantity:5,unit_price:0,created_at:ago(5)}];
  S.payments=[{id:'p1',order_id:'ready',amount:10000},{id:'p2',order_id:'paid',amount:5000}];
  S.quotes=[{id:'q1',title:'Llavero',client_name:'Ana',status:'sent',validity_days:15,created_at:ago(14)},
   {id:'q2',title:'Maceta',client_name:'Luis',status:'sent',validity_days:15,created_at:ago(2)},
   {id:'q3',title:'Viejo',status:'sent',validity_days:5,created_at:ago(9)}];
  S.resources=[{id:'pr',kind:'printer',name:'Bambu A1',active:true,hours_used:250,hours_at_maintenance:0,maintenance_every_hours:200},
   {id:'m1',kind:'supply',name:'Marco 30x40',unit:'un',active:true,counted:true,stock_qty:1,reserved_qty:0,min_stock:3,counted_at:ago(1)}];`);
 const list=JSON.parse(run('JSON.stringify(reminders())'));
 assert.deepEqual(list.map(r=>r.order||r.quote||r.go),['late','today','tom','ready','owed','q1','resources','inventory']);
 assert.match(list[0].sub,/^Atrasado: era para el/);assert.equal(list[1].sub,'Se entrega hoy · Armado');assert.equal(list[2].sub,'Se entrega mañana · Pendiente');
 assert.equal(list[3].sub,'Listo: coordina la entrega y cobra el saldo de $10.000');
 assert.equal(list[4].sub,'Entregado con saldo pendiente de $15.000');
 assert.match(list[5].sub,/vence el .*haz seguimiento/);assert.match(list[6].sub,/Toca mantención \(250 h/);assert.equal(list[7].text,'Marco 30x40 bajo el mínimo');
 // Inicio shows six and a link to all; rows open the order, quote or section.
 run(`localStorage.removeItem('kultiapp_daily_notice');S.mode='home';render()`);
 assert.equal(run('qa(".reminders [data-reminder]").length'),6);
 assert.match(run('q(".reminders .panel-h").textContent'),/Pendientes8 avisos/);
 run(`q('[data-reminder="0"]').click();q('[data-reminder="5"]').click()`);
 run(`q('#remindersMore').click()`);assert.equal(run('qa("#remindersDialog [data-all-reminder]").length'),8);
 run(`q('#remindersDialog [data-all-reminder="7"]').click()`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(calls)')),[['order','late'],['quote','q1'],['go','inventory']]);
 // Daily summary: once per day, counting each order once.
 assert.equal(run('q("#toasts").textContent'),'Hoy: 1 atrasado · 1 entrega hoy · 1 listo para entregar · 1 cotización por vencer · 2 avisos de mantención o stock.');
 assert.equal(run('localStorage.getItem("kultiapp_daily_notice")'),run('localToday()'));
 run(`q('#toasts').innerHTML='';render()`);await flush();
 assert.equal(run('q("#toasts").textContent'),'');
 // Nothing pending: a calm "Todo al día" line.
 run(`S.orders=[];S.quotes=[];S.resources=[];render()`);
 assert.match(run('q(".reminders").textContent'),/Todo al día/);
 dom.window.close();
 console.log('PASS V3.4: reminders (late, today/tomorrow, ready with balance, delivered owing, quotes expiring, maintenance, low stock), Inicio panel and full list, actions, daily summary once a day, all clear.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
