const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=10)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.7: «Usar materiales actuales del producto» in the order's materials, even when the cost is the same.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.rpcs=[];
  supabase.rpc=async(f,a)=>{rpcs.push([f,a]);return{data:{lines:8,state:'reserved',estimated_cost:5772},error:null}};
  supabase.from=t=>{const q={select(){return q},eq(){return q},order(){return q},then(a,b){return Promise.resolve({data:t==='inventory_order_lines'?[{resource_id:'r1',name:'Caja Embalaje',unit:'un',quantity:1}]:[],error:null}).then(a,b)}};return q};
  loadResources=async()=>{};loadOrders=async()=>{};S.payments=[];
  S.products=[{id:'p1',name:'Cuadro Formula 1',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,sale_price:18000}];S.summaries=new Map([['p1',{total_cost:5772}]]);
  S.orders=[{id:'o1',order_no:22,title:'Cuadro Formula 1',product_id:'p1',kind:'customer',customer_name:'Constanza',status:'assembly',inventory_state:'reserved',quantity:1,unit_price:18000,estimated_cost:5772,created_at:new Date().toISOString()},
   {id:'o2',order_no:23,title:'Cuadro Formula 1',product_id:'p1',kind:'customer',from_stock:true,status:'delivered',quantity:1,unit_price:18000,estimated_cost:5772,created_at:new Date().toISOString()}];
  S.mode='production';render();showOrder(S.orders[0])`);await flush(20);
 assert.equal(run('!!q(".cost-notice")'),false);
 run(`q('#syncOrderMaterials').click()`);await flush(20);
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['refresh_order_materials',{p_order:'o1'}]]);
 assert.match(run('[...qa(".toast")].map(t=>t.textContent).join()'),/Materiales del pedido actualizados/);
 // Sales from stock have no materials: no button.
 run(`q('#orderDialog')?.close();showOrder(S.orders[1])`);await flush(20);assert.equal(run('!!q("#syncOrderMaterials")'),false);
 dom.window.close();
 console.log('PASS V4.7: order materials can follow the product recipe from the order, without a cost change.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
