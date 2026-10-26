const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=20)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.9: material sheet (summary, data, price fix, weighing, rolls/packs, history with undo, usage), list and count mode.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 const F='11111111-1111-4111-8111-111111111111',C='22222222-2222-4222-8222-222222222222';
 run(`window.writes=[];const now=Date.now();
  window.tables={inventory_movements:[
    {id:'m2',kind:'purchase',quantity:1000,unit_cost:20,note:'Compra',created_at:new Date(now-3600e3).toISOString()},
    {id:'m1',kind:'opening',quantity:500,unit_cost:14,note:'Stock inicial',created_at:new Date(now-40*864e5).toISOString()}],
   products:[{id:'p1',name:'Cuadro F1',quantity:1,materials:[]}],print_jobs:[{product_id:'p1',filaments:[{resource_id:'${F}',grams:9,purge_grams:1}]}],
   inventory_order_lines:[{order_id:'o1',quantity:10,consumed_qty:null}]};
  supabase.from=t=>{const c={t};const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},contains(){return q},single(){return q},
   update(v){c.op='update';c.v=v;return q},insert(v){c.op='insert';c.v=v;return q},
   then(a,b){if(c.op)writes.push(c);return Promise.resolve({data:c.op?null:(tables[t]||[]),error:null}).then(a,b)}};return q};
  loadResources=async()=>{};loadOrders=async()=>{};
  S.resources=[{id:'${F}',kind:'filament',name:'PLA Blanco',material:'eSun',color:'#ffffff',unit:'g',unit_cost:18,price_per_kg:18000,stock_qty:1500,reserved_qty:10,min_stock:200,counted:true,active:true,spool_net_g:1000,spool_tare_g:180,pack_size:1,notes:''},
   {id:'${C}',kind:'supply',name:'Papel A4',material:'',color:'#303030',unit:'hoja',unit_cost:50,stock_qty:30,reserved_qty:0,min_stock:10,counted:true,active:true,spool_net_g:1000,spool_tare_g:0,pack_size:20,notes:''}];
  S.products=[{id:'p1',name:'Cuadro F1',quantity:1,status:'active'}];
  S.orders=[{id:'o1',order_no:22,title:'Cuadro F1',inventory_state:'reserved',status:'printing',kind:'customer',quantity:1,created_at:new Date().toISOString()}];
  S.mode='inventory';render()`);
 // List: quick + / −, a level bar, the count mode button; tapping the row opens the sheet with its own link.
 // Physical count reminder: never-counted materials ask for a count (Inventario and Inicio's Pendientes).
 assert.match(run('q("#countReminder").textContent'),/2 materiales llevan más de 30 días sin conteo físico/);
 assert.ok(run('reminders().some(x=>x.go==="stockcount")'));
 assert.ok(run(`!!q('[data-stock="${F}"]')&&!!q('[data-stock-out="${F}"]')&&!!q('#stockCount')&&!!q('[data-material-row="${F}"] .level')`));
 run(`q('[data-material-row="${F}"] .inv-name').click()`);await flush();
 assert.equal(run('S.mode'),'material');assert.equal(run('location.hash'),'#material/'+F);
 const hero=run('q(".mat-hero").textContent');
 assert.match(hero,/Tienes1\.500 g.*Reservado10 g.*Disponible1\.490 g.*Mínimo200 g/);assert.match(hero,/Valor en stock \$27\.000 · ≈ 1,5 rollos de 1\.000 g/);
 // History: running balance and price history; usage per unit and reserved orders.
 assert.match(run('q("#matHistory").textContent'),/Ingreso · 1\.000 g.*Quedó1\.500 g.*Stock inicial · 500 g.*Quedó500 g/);
 assert.match(run('q("#matPrices").textContent'),/\$20\.000.*\$14\.000/);
 assert.match(run('q("#matUsage").textContent'),/Cuadro F110 g.*PED-22 · Cuadro F110 g/);
 // Data: spool weights, notes, minimum.
 run(`q('#matSpoolTare').value=200;q('#matNotes').value='Lo compro en Tienda X';q('#matMin').value=300;q('#matForm').requestSubmit()`);await flush();
 const up=JSON.parse(run('JSON.stringify(writes.find(w=>w.op==="update").v)'));
 assert.equal(up.spool_tare_g,200);assert.equal(up.notes,'Lo compro en Tienda X');assert.equal(up.min_stock,300);assert.equal(up.spool_net_g,1000);
 // Adjust to the real count weighing the spool: 1.380 g on the scale − 180 g spool = 1.200 g.
 run(`writes.length=0;q('[data-mat-move=set]').click();q('#scaleGross').value=1380;q('#scaleGross').dispatchEvent(new Event('input'))`);
 assert.equal(run('q("#stockQuantity").value'),'1200');assert.match(run('q("#scaleResult").textContent'),/= 1\.200 g de filamento/);
 run(`q('#stockForm').requestSubmit()`);await flush();
 assert.equal(run('writes.find(w=>w.t==="inventory_movements").v.quantity'),-300);
 // Purchase in rolls: 2 rolls of 1.000 g at $16.990 each → 2.000 g at $16.990/kg.
 run(`writes.length=0;q('#stockDialog')?.close();showStockMovement(S.resources[0],'in');q('#packCount').value=2;q('#packCount').dispatchEvent(new Event('input'));q('#packPrice').value=16990;q('#packPrice').dispatchEvent(new Event('input'))`);
 assert.equal(run('q("#stockQuantity").value'),'2000');assert.equal(run('q("#stockPrice").value'),'16990');
 run(`q('#stockDialog').close()`);
 // Supplies in packs of 20: 3 packs at $1.000 → 60 sheets at $50.
 run(`showStockMovement(S.resources[1],'in');q('#packCount').value=3;q('#packCount').dispatchEvent(new Event('input'));q('#packPrice').value=1000;q('#packPrice').dispatchEvent(new Event('input'))`);
 assert.equal(run('q("#stockQuantity").value'),'60');assert.equal(run('q("#stockPrice").value'),'50');
 run(`q('#stockDialog').close()`);
 // Price fix without a purchase.
 run(`S.mode='material';S.materialId='${F}';render();writes.length=0;q('#matPriceFix').click();q('#priceFix').value=17000;q('#priceFixForm').requestSubmit()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(writes[0].v)')),{price_per_kg:17000,unit_cost:17});
 // Undo the last purchase: −1.000 g and the average cost goes back to (1500×18 − 1000×20)/500 = 14.
 run(`q('#priceFixDialog')?.close();render()`);await flush();
 run(`writes.length=0;confirmDialog=async()=>true;q('#matUndo').click()`);await flush();
 const ins=JSON.parse(run('JSON.stringify(writes.find(w=>w.op==="insert").v)'));
 assert.equal(ins.kind,'adjustment');assert.equal(ins.quantity,-1000);assert.match(ins.note,/Deshace: ingreso/);
 assert.deepEqual(JSON.parse(run('JSON.stringify(writes.find(w=>w.op==="update").v)')),{price_per_kg:14000,unit_cost:14});
 // Count mode: weigh a spool, type a supply, save only what changed.
 run(`S.countDraft={};S.mode='stockcount';render()`);
 assert.equal(run('location.hash'),'#conteo');
 run(`q('[data-count-weigh="${F}"]').click()`);
 run(`const i=q('[data-count-input="${F}"]');i.value='1190';i.dispatchEvent(new Event('input'));const j=q('[data-count-input="${C}"]');j.value='30';j.dispatchEvent(new Event('input'))`);
 assert.match(run(`q('[data-count-diff="${F}"]').textContent`),/= 1\.010 g · −490 g/);assert.match(run(`q('[data-count-diff="${C}"]').textContent`),/Sin cambio/);
 assert.equal(run('q("#countSummary").textContent'),'2 contados · 1 cambia');
 run(`writes.length=0;q('#countSave').click()`);await flush(30);
 const mv=JSON.parse(run('JSON.stringify(writes.filter(w=>w.op==="insert").map(w=>w.v))'));
 assert.equal(mv.length,1);assert.equal(mv[0].quantity,-490);
 // Both counted materials get today's date (the unchanged one too) and the reminder goes away.
 assert.ok(run('!!writes.find(w=>w.op==="update"&&w.v.counted_at)'));
 assert.equal(run('countDue().length'),0);assert.match(run('q("#countReminder")?.textContent||"none"'),/none/);assert.equal(mv[0].note,'Conteo físico');assert.equal(run('S.mode'),'inventory');
 // Reload with the material link restores the sheet.
 run(`history.replaceState(null,'','#material/${F}');S.mode='home'`);assert.equal(await dom.window.eval('restoreView()'),true);assert.equal(run('S.mode'),'material');
 dom.window.close();
 console.log('PASS V4.9: material sheet (summary, history balance, prices, usage, data, weigh spool, rolls/packs, price fix, undo), list quick actions, count mode, material link.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
