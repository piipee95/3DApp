const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V3.1: failed prints, printer hours and maintenance, photos of finished work.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.db={print_failures:[],inventory_movements:[],production_orders:[],print_jobs:[{product_id:'p1',printer_name:'Bambu A1',hours:2,minutes:30}]};window.rpcs=[];let seq=0;
  supabase.from=table=>{let op='read',value={},filters=[];const result=()=>{let rows=db[table]||(db[table]=[]);
   if(op==='insert'){const row={id:table+'-'+(++seq),...value};rows.push(row);return{data:row,error:null}}
   let found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
   if(op==='update'){window.lastUpdate={table,value};found.forEach(r=>Object.assign(r,value));return{data:found[0]||{},error:null}}
   return{data:found,error:null}};
   const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},single(){return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},then(a,b){return Promise.resolve(result()).then(a,b)}};return q};
  supabase.rpc=async(name,args)=>{rpcs.push([name,args]);return{data:{},error:null}};
  supabase.storage={from:()=>({list:async()=>({data:[{name:'a.jpg'}],error:null}),createSignedUrls:async paths=>({data:paths.map(p=>({signedUrl:'https://x/'+p})),error:null})})};
  S.settings={filament_price_per_kg:15990,electricity_rate_clp_kwh:200,printer_power_kw:1};
  S.resources=[{id:'pr1',kind:'printer',name:'Bambu A1',power_kw:0.5,active:true,hours_used:210,hours_at_maintenance:0,maintenance_every_hours:200},
   {id:'pr2',kind:'printer',name:'Cobra',power_kw:1.75,active:true,hours_used:40,hours_at_maintenance:0,maintenance_every_hours:0},
   {id:'f1',kind:'filament',name:'PLA Negro',price_per_kg:20000,unit_cost:20,counted:true,active:true}];
  S.products=[{id:'p1',name:'Cuadro',quantity:2,status:'active'}];S.summaries=new Map();
  S.orders=[{id:'o1',order_no:12,title:'Cuadro Luna',customer_name:'Ana',kind:'customer',product_id:'p1',quantity:4,unit_price:20000,iva_enabled:false,iva_rate:.19,estimated_cost:5000,failures_cost:0,status:'printing',inventory_state:'none',created_at:new Date().toISOString()}];
  db.production_orders=S.orders.map(o=>({...o}));
  loadOrders=async()=>{};loadResources=async()=>{};S.failures=[];`);
 // Cost: lost filament at its price + failed time at the printer's power.
 assert.equal(run(`failureCost(50,120,S.resources[2],S.resources[0])`),1200);
 assert.equal(run(`failureCost(100,60,null,null)`),1799);
 // Registering a failure from the order: loss movement, log, order failures cost and printer hours.
 run(`showOrder(S.orders[0])`);await flush();
 assert.match(run('q("#orderPhotos").textContent'),/Fotos del trabajo/);
 assert.equal(run('q("#orderPhotos img").getAttribute("src")'),'https://x/'+run('S.workspace.id')+'/orders/o1/a.jpg');
 run(`q('#orderFailure').click()`);
 assert.match(run('q("#failureDialog").textContent'),/PED-12/);
 run(`q('#faPrinter').value='pr1';q('#faPrinter').dispatchEvent(new Event('change'));q('#faFilament').value='f1';q('#faFilament').dispatchEvent(new Event('change'));
  q('#faGrams').value=50;q('#faGrams').dispatchEvent(new Event('input'));q('#faHours').value=2;q('#faHours').dispatchEvent(new Event('input'))`);
 assert.equal(run('q("#faCost").value'),'1200');assert.equal(run('q("#faDeductRow").hidden'),false);
 run(`q('#faReason').value='spaghetti';q('#failureForm').requestSubmit()`);await flush(12);
 const mv=JSON.parse(run('JSON.stringify(db.inventory_movements[0])'));
 assert.equal(mv.kind,'loss');assert.equal(mv.quantity,-50);assert.equal(mv.resource_id,'f1');assert.match(mv.note,/PED-12/);
 const fl=JSON.parse(run('JSON.stringify(db.print_failures[0])'));
 assert.equal(fl.reason,'spaghetti');assert.equal(fl.cost,1200);assert.equal(fl.deducted,true);assert.equal(fl.order_id,'o1');assert.equal(fl.minutes,120);
 assert.equal(run('db.production_orders[0].failures_cost'),1200);
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['printer_hours',{p_printer:'pr1',p_action:'add',p_hours:2}]]);
 // Uncounted filament can't be deducted; an edited cost is kept.
 run(`q('#orderDialog')?.close();S.resources[2].counted=false;showFailure();q('#faFilament').value='f1';q('#faFilament').dispatchEvent(new Event('change'));q('#faGrams').value=30;q('#faGrams').dispatchEvent(new Event('input'))`);
 assert.equal(run('q("#faDeductRow").hidden'),true);
 run(`q('#faCost').value=999;q('#faCost').dispatchEvent(new Event('input'));q('#faGrams').value=40;q('#faGrams').dispatchEvent(new Event('input'))`);
 assert.equal(run('q("#faCost").value'),'999');
 run(`q('#failureDialog').close()`);
 // Month summary and real profit: failures already in an order's real cost aren't counted twice.
 run(`const d=new Date().toLocaleDateString('sv-SE');S.failures=[{id:'x1',occurred_on:d,reason:'adherencia',grams:20,minutes:60,cost:800,order_id:null},{id:'x2',occurred_on:d,reason:'adherencia',grams:10,minutes:30,cost:500,order_id:'o1'},{id:'x3',occurred_on:d,reason:'atasco',grams:0,minutes:0,cost:300,order_id:'o2'}];
  S.orders.push({id:'o2',order_no:13,title:'Llavero',kind:'customer',quantity:1,unit_price:0,status:'pending',actual_cost:1000,created_at:new Date().toISOString()})`);
 const now=new Date(),month=JSON.parse(run(`JSON.stringify(failuresOfMonth(${now.getFullYear()},${now.getMonth()}))`));
 assert.equal(month.count,3);assert.equal(month.cost,1600);assert.equal(month.top,'adherencia');assert.equal(month.hours,1.5);
 assert.equal(run(`failureWaste(${now.getFullYear()},${now.getMonth()})`),1300);
 assert.match(run(`failuresPanelMarkup(${now.getFullYear()},${now.getMonth()})`),/Se despegó de la cama/);
 // Printers: usage, maintenance due, add hours and maintenance through the RPC.
 run(`S.mode='resources';render()`);
 assert.match(run('q("main").textContent'),/210 h impresas · 210 de 200 h hasta la mantención/);
 assert.match(run('q("main").textContent'),/Toca mantención/);assert.match(run('q("main").textContent'),/define cada cuántas horas/);
 assert.equal(run('printersDue().map(r=>r.id).join()'),'pr1');
 assert.match(run('q("#failuresPanel").textContent'),/Fallas recientes.*Este mes: 3/);
 run(`rpcs.length=0;q('[data-printer-maint=pr1]').click()`);await flush();
 run(`q('#confirmDialog [data-confirm]').click()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['printer_hours',{p_printer:'pr1',p_action:'maintenance'}]]);
 run(`rpcs.length=0;q('[data-printer-hours=pr2]').click();q('#phHours').value='3.5';q('#printerHoursForm').requestSubmit()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['printer_hours',{p_printer:'pr2',p_action:'add',p_hours:3.5}]]);
 // Printer form saves the maintenance interval.
 run(`showResourceForm(S.resources[1]);q('#resourceMaint').value='300';q('#resourceForm').requestSubmit()`);await flush();
 assert.equal(run('lastUpdate.value.maintenance_every_hours'),300);
 // Finishing an order adds its print time (scaled to the quantity) to the printer used.
 run(`rpcs.length=0;q('#resourceDialog')?.close();showOrder(S.orders[0]);q('#orderStatus').value='ready';q('#orderForm').requestSubmit()`);await flush(12);
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['printer_hours',{p_printer:'pr1',p_action:'add',p_hours:5}]]);
 // Saving an already finished order doesn't add hours again.
 run(`rpcs.length=0;S.orders[0].status='ready';showOrder(S.orders[0]);q('#orderForm').requestSubmit()`);await flush(12);
 assert.equal(run('rpcs.length'),0);
 // Viewers can't register failures or maintenance.
 run(`S.workspace.role='viewer';S.mode='resources';render()`);
 assert.equal(run('!!q("#newFailureBtn")||!!q("[data-printer-maint]")'),false);
 run(`showOrder(S.orders[0])`);await flush();
 assert.equal(run('!!q("#orderFailure")||!!q("#orderPhotoFile")'),false);
 dom.window.close();
 console.log('PASS V3.1: failure cost/deduction/log/order cost/printer hours, month waste without double count, printer usage and maintenance RPC, interval, hours on finish, order photos, viewer limits.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
