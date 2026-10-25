const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=10)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.6: updating an order's cost also takes the product's current materials (refresh_order_materials).
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.rpcs=[];window.writes=[];window.loads=0;
  supabase.rpc=async(f,a)=>{rpcs.push([f,a]);return{data:{lines:6,state:'consumed',estimated_cost:4729},error:null}};
  supabase.from=t=>{const c={t};const q={update(v){c.op='update';c.v=v;return q},eq(){return q},select(){return q},order(){return q},then(a,b){writes.push(c);return Promise.resolve({data:[],error:null}).then(a,b)}};return q};
  loadResources=async()=>{loads++};loadOrders=async()=>{loads++};
  S.payments=[];S.products=[{id:'p1',name:'Cuadro',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,sale_price:18000}];S.summaries=new Map([['p1',{total_cost:4729}]]);
  S.orders=[{id:'o1',order_no:40,title:'Cuadro',product_id:'p1',kind:'customer',customer_name:'Esteban',status:'ready',inventory_state:'consumed',quantity:1,unit_price:18000,estimated_cost:4793,created_at:new Date().toISOString()},
   {id:'o2',order_no:41,title:'Cuadro',product_id:'p1',kind:'customer',from_stock:true,status:'pending',quantity:1,unit_price:18000,estimated_cost:4793,created_at:new Date().toISOString()}];
  S.mode='production';render();showOrder(S.orders[0])`);await flush();
 assert.match(run('q("#refreshOrderCost").textContent'),/Actualizar costo y materiales/);
 run(`q('#refreshOrderCost').click()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['refresh_order_materials',{p_order:'o1'}]]);
 assert.equal(run('S.orders[0].estimated_cost'),4729);assert.equal(run('loads'),2);assert.equal(run('writes.filter(w=>w.op==="update").length'),0);
 assert.match(run('[...qa(".toast")].map(t=>t.textContent).join()'),/Materiales y costo del pedido actualizados: \$4\.729/);
 // From-stock sales have no materials: only the cost changes.
 run(`q('#orderDialog')?.close();rpcs.length=0;updateOrderCosts([S.orders[1]],4729)`);await flush();
 assert.equal(run('rpcs.length'),0);assert.equal(run('writes.find(w=>w.op==="update").v.estimated_cost'),4729);
 // Real database errors are shown, not hidden by the fallback.
 run(`supabase.rpc=async()=>({error:{code:'P0001',message:'Stock insuficiente: PLA Rojo'}});window.err=null;updateOrderCosts([S.orders[0]],4729).catch(e=>err=e.message)`);await flush();
 assert.equal(run('err'),'Stock insuficiente: PLA Rojo');
 dom.window.close();
 console.log('PASS V4.6: order cost refresh also refreshes its materials (RPC), from-stock cost only, errors surface.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
