const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=20)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// 5.0: order and customer «fichas» as pages with their own link, back button and saving in place.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 const O='33333333-3333-4333-8333-333333333333',C='44444444-4444-4444-8444-444444444444';
 run(`window.scrollTo=()=>{};window.writes=[];
  supabase.from=t=>{const c={t};const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},single(){return q},contains(){return q},
   update(v){c.op='update';c.v=v;return q},insert(v){c.op='insert';c.v=v;return q},
   then(a,b){if(c.op)writes.push(c);return Promise.resolve({data:c.op?{}:[],error:null}).then(a,b)}};return q};
  loadOrders=async()=>{};loadResources=async()=>{};loadCustomers=async()=>{};S.payments=[];S.quotes=[];S.products=[];
  S.customers=[{id:'${C}',name:'Comercial Andes',phone:'+56 9 1234 5678',instagram:'',email:'',notes:''}];
  S.orders=[{id:'${O}',order_no:12,title:'Cuadro',customer_id:'${C}',customer_name:'Comercial Andes',kind:'customer',status:'printing',quantity:2,unit_price:10000,estimated_cost:8000,due_date:'2026-11-02',created_at:new Date().toISOString()}];
  S.mode='production';render()`);
 // From the list the order opens as a page with its link; Pedidos stays highlighted.
 run(`q('[data-order]').click()`);await flush();
 assert.equal(run('S.mode'),'order');assert.equal(run('location.hash'),'#pedido/'+O);
 assert.equal(run('q(".page-title").textContent'),'PED-12');assert.ok(run('!!q("main #orderDialog.page-sheet #orderForm")'));
 assert.ok(run('q(".sidebar [data-app-mode=production]").classList.contains("active")'));
 // Saving stays on the page (with a message) instead of closing.
 run(`q('#orderStatus').value='assembly';q('#orderForm').requestSubmit()`);await flush();
 assert.equal(run('writes.find(w=>w.t==="production_orders").v.status'),'assembly');
 assert.equal(run('S.mode'),'order');assert.match(run('[...qa(".toast")].map(t=>t.textContent).join()'),/PED-12 guardado/);
 // Customer page from the order's customer list, with history that opens the order page.
 run(`S.mode='customers';render();q('[data-customer]').click()`);await flush();
 assert.equal(run('S.mode'),'customer');assert.equal(run('location.hash'),'#cliente/'+C);
 assert.equal(run('q(".page-title").textContent'),'Comercial Andes');assert.ok(run('!!q("main #customerDialog #customerForm")'));
 run(`q('#cuNotes').value='Cliente frecuente';q('#customerForm').requestSubmit()`);await flush();
 assert.equal(run('writes.find(w=>w.t==="customers").v.notes'),'Cliente frecuente');assert.equal(run('S.mode'),'customer');
 run(`q('[data-history-order]').click()`);await flush();assert.equal(run('S.mode'),'order');
 // A new customer is still a quick dialog.
 run(`showCustomer({})`);assert.ok(run('!!q("dialog#customerDialog[open]")'));run(`q('dialog#customerDialog').close()`);
 // Links restore the pages; the back arrow returns to the list when there is no history.
 run(`history.replaceState(null,'','#cliente/${C}');S.mode='home'`);assert.equal(await dom.window.eval('restoreView()'),true);assert.equal(run('S.mode'),'customer');
 run(`history.replaceState(null,'','#pedido/${O}');S.mode='home'`);assert.equal(await dom.window.eval('restoreView()'),true);assert.equal(run('S.mode'),'order');
 run(`render();history.replaceState(null,'',location.pathname);window.went=null;goMode=async m=>went=m;q('#back').click()`);assert.equal(run('went'),'production');
 // A deleted order sends the page back to the list.
 run(`goMode=async m=>{S.mode=m;render()};S.orders=[];S.mode='order';render()`);assert.equal(run('S.mode'),'production');
 dom.window.close();
 console.log('PASS 5.0: order and customer pages (links, nav highlight, save in place, history, new-customer dialog, restore, back, deleted).');
}
test().catch(e=>{console.error(e);process.exitCode=1});
