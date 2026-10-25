const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=8)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V3.6: simpler inventory (first count, intake, change quantity, take out), archive/delete and count-on-demand when linking.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.writes=[];window.usage={inventory_order_lines:[],products:[],print_jobs:[]};
  supabase.from=table=>{const call={table,eqs:[]};const q={select(){return q},eq(k,v){call.eqs.push([k,v]);return q},order(){return q},limit(){return q},single(){return q},
   contains(k,v){call.contains=[k,v];window.lastContains=[k,v];return q},insert(v){call.op='insert';call.value=v;writes.push(call);return q},update(v){call.op='update';call.value=v;writes.push(call);return q},
   then(a,b){const data=call.op?{id:'new1',...call.value}:(table==='workspace_resources'?S.__db||[]:usage[table]||[]);return Promise.resolve({data,error:null}).then(a,b)}};return q};
  S.__db=[{id:'a',kind:'supply',name:'Cuadros con fondo A4',unit:'un',unit_cost:3000,counted:false,active:true,stock_qty:0,reserved_qty:0,min_stock:9},
   {id:'b',kind:'supply',name:'Caja Embalaje',unit:'un',unit_cost:380,counted:true,active:true,stock_qty:50,reserved_qty:5,min_stock:0},
   {id:'f',kind:'filament',name:'PLA Rojo',unit:'g',unit_cost:15.7,price_per_kg:15700,counted:true,active:true,stock_qty:1000,reserved_qty:0,min_stock:250},
   {id:'x',kind:'supply',name:'Borrado',unit:'un',unit_cost:1,counted:true,active:false,stock_qty:0,reserved_qty:0,min_stock:0,deleted_at:'2026-10-25T00:00:00Z'}];`);
 await dom.window.run('loadResources()');
 assert.equal(run('S.resources.map(r=>r.id).join()'),'a,b,f');
 // Rows: uncounted → «Contar stock»; counted → «Ingreso», plus change/take out/archive/delete in the menu.
 run(`S.mode='inventory';inventoryView()`);
 assert.equal(run('q("[data-stock=a]").textContent'),'Contar stock');assert.equal(run('q("[data-stock=b]").textContent'),'Ingreso');
 assert.ok(run('!!q("[data-stock-set=b]")&&!!q("[data-stock-out=b]")&&!!q("[data-inventory-archive=b]")&&!!q("[data-inventory-delete=b]")'));
 assert.equal(run('!!q("[data-stock-set=a]")'),false);
 // First count: quantity + price per unit (prefilled), note optional.
 run(`q('[data-stock=a]').click()`);
 assert.match(run('q("#stockDialog h2").textContent'),/Stock inicial · Cuadros con fondo A4/);
 assert.equal(run('q("#stockPrice").value'),'3000');assert.equal(run('q("label[for=stockPrice]").textContent'),'Precio por unidad (CLP)');
 run(`q('#stockQuantity').value=12;q('#stockQuantity').dispatchEvent(new Event('input'))`);
 assert.match(run('q("#stockPreview").textContent'),/Total: \$36\.000.*Quedarás con 12 unidades/);
 run(`q('#stockForm').requestSubmit()`);await flush();
 let w=JSON.parse(run('JSON.stringify(writes.pop())'));
 assert.equal(w.table,'inventory_movements');assert.equal(w.value.kind,'opening');assert.equal(w.value.quantity,12);assert.equal(w.value.unit_cost,3000);assert.equal(w.value.note,'');
 // Intake for a filament: price per kg becomes cost per gram.
 run(`showStockMovement(S.resources.find(r=>r.id==='f'));q('#stockQuantity').value=1000;q('#stockPrice').value=16000;q('#stockForm').requestSubmit()`);await flush();
 w=JSON.parse(run('JSON.stringify(writes.pop())'));assert.equal(w.value.kind,'purchase');assert.equal(w.value.quantity,1000);assert.equal(w.value.unit_cost,16);
 // Change quantity: type what you have; the difference is recorded.
 run(`showStockMovement(S.resources.find(r=>r.id==='b'),'set')`);
 assert.equal(run('q("#stockQuantity").value'),'50');
 run(`q('#stockForm').requestSubmit()`);await flush();
 assert.match(run('q("#stockFeedback").textContent'),/la misma/);
 run(`q('#stockQuantity').value=3;q('#stockForm').requestSubmit()`);await flush();
 assert.match(run('q("#stockFeedback").textContent'),/reservadas para pedidos/);
 run(`q('#stockQuantity').value=40;q('#stockForm').requestSubmit()`);await flush();
 w=JSON.parse(run('JSON.stringify(writes.pop())'));assert.equal(w.value.kind,'adjustment');assert.equal(w.value.quantity,-10);
 // Take out with a reason.
 run(`showStockMovement(S.resources.find(r=>r.id==='b'),'out');q('#stockQuantity').value=2;q('#stockReason').value='Regalo o muestra';q('#stockNote').value='Feria';q('#stockForm').requestSubmit()`);await flush();
 w=JSON.parse(run('JSON.stringify(writes.pop())'));assert.equal(w.value.kind,'loss');assert.equal(w.value.quantity,-2);assert.equal(w.value.note,'Regalo o muestra · Feria');
 // Edit form: price and quantity together; a changed quantity is saved as a correction.
 run(`writes.length=0;showInventoryForm(S.resources.find(r=>r.id==='b'));q('#invCost').value=400;q('#invQty').value=45;q('#inventoryForm').requestSubmit()`);await flush();
 w=JSON.parse(run('JSON.stringify(writes)'));
 assert.equal(w[0].table,'workspace_resources');assert.equal(w[0].value.unit_cost,400);
 assert.equal(w[1].value.kind,'adjustment');assert.equal(w[1].value.quantity,-5);assert.equal(w[1].value.unit_cost,400);
 // New material with its quantity → created and counted in one step.
 run(`writes.length=0;showInventoryForm();q('#invName').value='Marco 20x30';q('#invCost').value=2500;q('#invQty').value=8;q('#inventoryForm').requestSubmit()`);await flush();
 w=JSON.parse(run('JSON.stringify(writes)'));
 assert.equal(w[0].op,'insert');assert.equal(w[1].value.kind,'opening');assert.equal(w[1].value.resource_id,'new1');assert.equal(w[1].value.quantity,8);
 // Archive / restore.
 run(`writes.length=0;archiveResource(S.resources.find(r=>r.id==='b'),false)`);await flush();
 w=JSON.parse(run('JSON.stringify(writes[0])'));assert.deepEqual(w.value,{active:false});
 // Delete: used by products → explains and offers archive; unused → hidden for good.
 run(`usage.products=[{name:'Cuadro Formula 1'},{name:'Cuadro Capitan America'}];window.asked=[];confirmDialog=async o=>{asked.push(o);return false};writes.length=0;deleteResource(S.resources.find(r=>r.id==='a'))`);await flush();
 assert.match(run('asked[0].body'),/Cuadro Formula 1, Cuadro Capitan America/);assert.equal(run('writes.length'),0);
 // jsonb containment must be sent as JSON text (an array object becomes a Postgres array literal and fails).
 assert.equal(run('JSON.stringify(window.lastContains)'),JSON.stringify(['filaments',JSON.stringify([{resource_id:'a'}])]));
 run(`usage.products=[];asked.length=0;confirmDialog=async o=>{asked.push(o);return true};deleteResource(S.resources.find(r=>r.id==='f'))`);await flush();
 assert.equal(run('asked[0].title'),'Eliminar PLA Rojo');
 w=JSON.parse(run('JSON.stringify(writes[0])'));assert.equal(w.value.active,false);assert.ok(w.value.deleted_at);
 // Count on demand: a "stock inicial" error offers to register it and retries the action.
 run(`S.__db[0].counted=false;S.resources=S.__db.filter(r=>!r.deleted_at);window.retried=0;
  offerStockCount({message:'Registra el stock inicial de Cuadros con fondo A4 antes de vincular el producto'},()=>retried++).then(v=>window.handled=v)`);await flush();
 assert.equal(run('handled'),true);assert.match(run('q("#stockDialog h2").textContent'),/Stock inicial · Cuadros con fondo A4/);
 run(`q('#stockQuantity').value=9;q('#stockForm').requestSubmit()`);await flush();
 assert.equal(run('retried'),1);
 run(`offerStockCount({message:'Otro error'},()=>{}).then(v=>window.handled2=v)`);await flush();assert.equal(run('handled2'),false);
 // Viewers only see history.
 run(`S.workspace.role='viewer';inventoryView()`);
 assert.equal(run('qa("[data-stock],[data-inventory-archive],[data-inventory-delete]").length'),0);
 dom.window.close();
 console.log('PASS V3.6: deleted materials hidden, first count/intake/change/take out in plain words, price per kg, reserved guard, edit price+quantity, create counted, archive, delete with usage check, count-on-demand retry, viewer limits.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
