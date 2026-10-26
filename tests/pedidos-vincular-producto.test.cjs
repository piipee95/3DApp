const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V2.6: link a costed product to a custom-job order so it reserves/consumes its materials.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.rpcs=[];
  S.products=[{id:'p1',name:'Cuadro Iron Man',quantity:1,status:'active'},{id:'p2',name:'Viejo',quantity:1,status:'archived'}];S.summaries=new Map([['p1',{total_cost:6655}]]);
  S.orders=[{id:'o1',order_no:80,title:'Cuadro mascota',customer_name:'Camila',kind:'customer',product_id:null,quantity:2,unit_price:25000,iva_enabled:true,iva_rate:.19,estimated_cost:0,status:'ready',inventory_state:'none',created_at:new Date().toISOString()}];
  supabase.rpc=async(name,args)=>{rpcs.push([name,args]);S.orders[0]={...S.orders[0],product_id:args.p_product,inventory_state:'consumed',estimated_cost:13310};return{data:{lines:4,consumed:true,estimated_cost:13310},error:null}};
  loadOrders=async()=>{};loadResources=async()=>{};loadProducts=async()=>{};
  S.mode='production';render();showOrder(S.orders[0])`);
 assert.match(run('q(".job-notice").textContent'),/sin producto.*Vincular producto.*Crear producto/);
 run(`q('#jobLink').click()`);
 assert.equal(run('qa("[data-link-product]").length'),1);
 assert.match(run('q("[data-link-product]").textContent'),/Cuadro Iron Man.*Costo \$6\.655 \/ un\. · \$13\.310 el pedido/);
 run(`q('[data-link-product=p1]').click()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['link_order_product',{p_order:'o1',p_product:'p1'}]]);
 assert.match(run('S.msg'),/PED-80 vinculado a Cuadro Iron Man\. Como ya estaba listo, se descontaron sus materiales/);
 // The reopened order no longer shows the custom-job notice.
 assert.ok(run('!!q("#orderDialog")'));assert.equal(run('!!q(".job-notice")'),false);
 run(`q('#orderDialog').close()`);
 // Errors (e.g. missing stock) stay in the picker.
 run(`S.orders[0]={...S.orders[0],product_id:null,inventory_state:'none'};supabase.rpc=async()=>({data:null,error:{message:'Stock insuficiente: PLA Negro'}});showLinkProduct(S.orders[0]);q('[data-link-product=p1]').click()`);await flush();
 assert.match(run('q("#linkFeedback").textContent'),/Stock insuficiente/);
 run(`q('#linkProductDialog').close()`);
 // "Crear producto" from the job remembers the order and offers the link after saving.
 run(`productFromJob(S.orders[0])`);
 assert.equal(run('S.pendingLink'),'o1');
 run(`window.asked=null;confirmDialog=async o=>{window.asked=o.title;return true};rpcs.length=0;supabase.rpc=async(name,args)=>{rpcs.push([name,args]);return{data:{lines:2,consumed:false},error:null}};S.product.id='p9';S.products.push({id:'p9',name:'Cuadro mascota',quantity:1,status:'active'});offerPendingLink('p9')`);await flush();
 assert.equal(run('asked'),'Vincular al pedido PED-80');
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['link_order_product',{p_order:'o1',p_product:'p9'}]]);
 assert.equal(run('S.pendingLink'),null);
 // Viewers don't see the link actions.
 run(`S.workspace.role='viewer';showOrder(S.orders[0])`);
 assert.equal(run('!!q("#jobLink")'),false);
 dom.window.close();
 console.log('PASS V2.6: link product to custom job (picker with order cost, RPC, consumed/reserved message, errors), create-from-job offers the link after saving, viewer limits.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
