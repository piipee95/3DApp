const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=10)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.1: sell from stock at the price actually agreed.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.writes=[];supabase.from=t=>{const c={t};const q={insert(v){c.op='insert';c.v=v;return q},update(v){c.op='update';c.v=v;return q},eq(k,v){c.id=v;return q},select(){return q},single(){return q},order(){return q},
   then(a,b){writes.push(c);return Promise.resolve({data:c.op==='insert'?{id:'o9',order_no:50,...c.v}:[],error:null}).then(a,b)}};return q};
  S.customers=[{id:'c1',name:'Ana Pérez',phone:'+56 9 1111 2222'}];S.payments=[];S.orders=[];
  S.products=[{id:'a',name:'Cuadro Iron Man',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,target_margin:.4,round_to:1000,sale_price:23800,stock_qty:3,stock_reserved:1},
   {id:'b',name:'Llavero',quantity:1,status:'active',iva_enabled:false,iva_rate:.19,target_margin:.5,round_to:100,stock_qty:0,stock_reserved:0}];
  S.summaries=new Map([['a',{total_cost:8000}]]);refreshProductStock=async()=>{};loadOrders=async()=>{};`);
 // «Vender» only where there is available stock.
 run(`S.mode='dashboard';S.showStock=false;render()`);
 assert.equal(run('qa("[data-sell=a]").length>0'),true);assert.equal(run('qa("[data-sell=b]").length'),0);
 run(`q('[data-sell=a]').click()`);
 assert.match(run('q("#sellDialog").textContent'),/Disponibles: 2 unidades · costo \$8\.000 c\/u/);
 assert.equal(run('q("#sellPrice").value'),'23800');assert.equal(run('q("#sellQty").max'),'2');
 // Change the price: total, profit and difference vs suggested update.
 run(`q('#sellQty').value=2;q('#sellPrice').value=26000;q('#sellPrice').dispatchEvent(new Event('input'))`);
 assert.match(run('q("#sellSummary").textContent'),/Total\$52\.000.*Ganancia\$27\.697.*Vs sugerido\+\$2\.200 c\/u/);
 run(`q('#sellPrice').value=7000;q('#sellPrice').dispatchEvent(new Event('input'))`);
 assert.match(run('q("#sellSummary .down").textContent'),/-?\$/);
 // Save: customer (with phone), order from stock, delivered, full payment.
 run(`q('#sellPrice').value=25000;q('#sellClient').value='Ana Pérez';q('#sellClient').dispatchEvent(new Event('input'));q('#sellMethod').value='cash';q('#sellForm').requestSubmit()`);await flush();
 const w=JSON.parse(run('JSON.stringify(writes)'));
 const ins=w.find(x=>x.t==='production_orders'&&x.op==='insert').v;
 assert.equal(ins.product_id,'a');assert.equal(ins.from_stock,true);assert.equal(ins.kind,'customer');assert.equal(ins.quantity,2);assert.equal(ins.unit_price,25000);assert.equal(ins.customer_id,'c1');assert.equal(ins.estimated_cost,16000);
 assert.deepEqual(w.find(x=>x.t==='production_orders'&&x.op==='update').v.status,'delivered');
 const pay=w.find(x=>x.t==='order_payments').v;assert.equal(pay.amount,50000);assert.equal(pay.method,'cash');
 assert.match(run('q("#toasts").textContent'),/Vendido: 2 × Cuadro Iron Man a \$25\.000/);
 // Not paid yet: no payment; no client: «Venta directa».
 run(`writes.length=0;showSell(S.products[0]);q('#sellPaid').checked=false;q('#sellPaid').dispatchEvent(new Event('change'));q('#sellForm').requestSubmit()`);await flush();
 const w2=JSON.parse(run('JSON.stringify(writes)'));
 assert.equal(w2.some(x=>x.t==='order_payments'),false);assert.equal(w2.find(x=>x.op==='insert').v.customer_name,'Venta directa');
 // Viewers can't sell.
 run(`q('#sellDialog')?.close();S.workspace.role='viewer';render()`);assert.equal(run('qa("[data-sell]").length'),0);
 dom.window.close();
 console.log('PASS V4.1: sell from stock (available only, own price, total/profit/vs suggested, customer, delivered from stock, payment optional), viewer limits.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
