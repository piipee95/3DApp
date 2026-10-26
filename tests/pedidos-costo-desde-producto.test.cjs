const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const{boot}=require('./boot.cjs');
const flush=async(k=10)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.3: carry a product's new cost to open orders, «Mi perfil», splash with the logo.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.writes=[];supabase.from=t=>{const c={t};const q={update(v){c.op='update';c.v=v;return q},eq(k,v){c.id=v;return q},select(){return q},order(){return q},then(a,b){writes.push(c);return Promise.resolve({data:[],error:null}).then(a,b)}};return q};
  S.payments=[];S.products=[{id:'p1',name:'Cuadro Iron Man',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,sale_price:10990}];S.summaries=new Map([['p1',{total_cost:6000}]]);
  S.orders=[{id:'o1',order_no:30,title:'Cuadro Iron Man',product_id:'p1',kind:'customer',customer_name:'Ana',status:'printing',quantity:2,unit_price:10990,iva_enabled:true,iva_rate:.19,estimated_cost:10390,created_at:new Date().toISOString()},
   {id:'o2',order_no:31,title:'Cuadro Iron Man',product_id:'p1',kind:'customer',status:'delivered',quantity:1,unit_price:10990,estimated_cost:5195,created_at:new Date().toISOString()},
   {id:'o3',order_no:32,title:'Cuadro Iron Man',product_id:'p1',kind:'customer',status:'pending',quantity:1,unit_price:10990,estimated_cost:6000,created_at:new Date().toISOString()}];
  loadOrders=async()=>{};supabase.rpc=async()=>({error:{code:'PGRST202',message:'Could not find the function public.refresh_order_materials'}});`);
 // Only open orders with a different cost are offered; delivered keep their history.
 assert.equal(run(`staleOrders('p1',6000).map(o=>o.id).join()`),'o1');
 run(`window.asked=null;confirmDialog=async o=>{asked=o;return true};offerOrderCostRefresh('p1')`);await flush();
 assert.match(run('asked.body'),/PED-30 \(\$10\.390 → \$12\.000\)/);assert.doesNotMatch(run('asked.body'),/PED-31|PED-32/);
 assert.deepEqual(JSON.parse(run('JSON.stringify(writes.map(w=>[w.t,w.id,w.v.estimated_cost]))')),[['production_orders','o1',12000]]);
 // Order dialog notice + button.
 run(`S.orders[0].estimated_cost=10390;writes.length=0;S.mode='production';render();showOrder(S.orders[0])`);await flush();
 assert.match(run('q(".cost-notice").textContent'),/usa \$10\.390.*sería \$12\.000/);
 run(`q('#refreshOrderCost').click()`);await flush();
 assert.equal(run('writes.find(w=>w.op==="update").v.estimated_cost'),12000);
 run(`q('#orderDialog')?.close();showOrder(S.orders[2])`);await flush();assert.equal(run('!!q(".cost-notice")'),false);
 run(`q('#orderDialog')?.close()`);
 // Mi perfil: the name is saved in the user's metadata and shown in the app.
 run(`S.session={user:{id:'u',email:'felipe.pino@kultiversopop.cl',user_metadata:{}}};window.updated=null;
  supabase.auth={updateUser:async v=>{updated=v;return{data:{user:{...S.session.user,user_metadata:v.data}},error:null}}};S.mode='home';render()`);
 assert.equal(run('userInitials()'),'FP');
 run(`S.mode='profile';render();q('#profileName').value='Felipe Ignacio';q('#profileForm').requestSubmit()`);await flush();
 assert.equal(run('updated.data.name'),'Felipe Ignacio');run(`S.mode='home';render()`);
 assert.equal(run('displayName()'),'Felipe Ignacio');assert.equal(run('userInitials()'),'FI');
 assert.match(run('q(".user-text b").textContent'),/Felipe Ignacio/);assert.match(run('q(".home-hello").textContent'),/Felipe/);
 // Splash with the logo until the first render.
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.match(html,/<div id="app">\s*<!--[^>]*-->\s*<div class="splash"[\s\S]*kultiverso-pop-logo\.webp[\s\S]*Cargando tu taller/);
 dom.window.close();
 console.log('PASS V4.3: refresh order cost from product (open only, after save and from the order), «Mi perfil» name, splash with logo.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
