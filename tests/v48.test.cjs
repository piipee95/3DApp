const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=20)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.8: review of open orders against their product recipe, and the shopping list.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.rpcs=[];window.tables={
   products:[{id:'p1',quantity:1,materials:[{resource_id:'caja',quantity:1,unit_cost:380}]},{id:'p2',quantity:2,materials:[{resource_id:'caja',quantity:2,unit_cost:380}]}],
   print_jobs:[{product_id:'p1',filaments:[{resource_id:'pla',grams:9,purge_grams:1}]},{product_id:'p2',filaments:[{resource_id:'pla',grams:40}]}],
   inventory_order_lines:[{order_id:'o1',resource_id:'caja',name:'Caja',unit:'un',quantity:1},
     {order_id:'o2',resource_id:'caja',name:'Caja',unit:'un',quantity:1},{order_id:'o2',resource_id:'pla',name:'PLA',unit:'g',quantity:15},
     {order_id:'o3',resource_id:'caja',name:'Caja',unit:'un',quantity:1,consumed_qty:1},{order_id:'o3',resource_id:'pla',name:'PLA',unit:'g',quantity:10,consumed_qty:12}]};
  supabase.from=t=>{const q={select(){return q},eq(){return q},in(){return q},order(){return q},then(a,b){return Promise.resolve({data:tables[t]||[],error:null}).then(a,b)}};return q};
  supabase.rpc=async(f,a)=>{rpcs.push(a.p_order);if(a.p_order==='o4')return{error:{code:'P0001',message:'Stock insuficiente: PLA Negro'}};return{data:{lines:2,state:'reserved',estimated_cost:1000},error:null}};
  loadResources=async()=>{};loadOrders=async()=>{};S.payments=[];
  S.resources=[{id:'pla',kind:'filament',name:'PLA Blanco',material:'eSun',unit:'g',unit_cost:15.7,stock_qty:500,reserved_qty:450,min_stock:200,counted:true,active:true},
   {id:'caja',kind:'supply',name:'Caja Embalaje',unit:'un',unit_cost:380,stock_qty:10,reserved_qty:2,min_stock:3,counted:true,active:true},
   {id:'tinta',kind:'supply',name:'Tinta',unit:'un',unit_cost:100,stock_qty:0,reserved_qty:0,min_stock:5,counted:false,active:true}];
  S.products=[{id:'p1',name:'Cuadro F1',quantity:1,status:'active'},{id:'p2',name:'Llaveros',quantity:2,status:'active'}];S.summaries=new Map([['p1',{total_cost:1000}],['p2',{total_cost:2000}]]);
  const now=new Date().toISOString(),base={kind:'customer',status:'printing',unit_price:5000,created_at:now};
  S.orders=[{...base,id:'o1',order_no:22,title:'Cuadro F1',customer_name:'Constanza',product_id:'p1',inventory_state:'reserved',quantity:1,estimated_cost:1000},
   {...base,id:'o2',order_no:23,title:'Llaveros',customer_name:'Ana',product_id:'p2',inventory_state:'reserved',quantity:1,estimated_cost:1000},
   {...base,id:'o3',order_no:24,title:'Cuadro F1',customer_name:'Beto',product_id:'p1',inventory_state:'consumed',quantity:1,estimated_cost:1000,status:'ready'},
   {...base,id:'o4',order_no:25,title:'Cuadro F1',customer_name:'Caro',product_id:'p1',inventory_state:'none',quantity:3,estimated_cost:3000},
   {...base,id:'o5',order_no:26,title:'Cuadro F1',customer_name:'Dani',product_id:'p1',inventory_state:'reserved',quantity:1,estimated_cost:1000,status:'delivered'},
   {...base,id:'o6',order_no:27,title:'Venta',product_id:'p1',from_stock:true,quantity:1,estimated_cost:1000}];
  S.mode='production';render()`);await flush();
 const issues=JSON.parse(run('JSON.stringify(S.orderReview.issues.map(i=>[i.order.id,i.notes]))'));
 // o1 lacks its filament (9+1 g); o2 (batch of 2 → 1 box, 20 g each) has 15 g;
 // o3 consumed with waste (12 g) is fine; o4 has no lines at all; delivered and from-stock are skipped.
 assert.deepEqual(issues.map(i=>i[0]),['o1','o2','o4']);
 assert.deepEqual(issues[0][1],['Faltan: PLA Blanco 10 g']);
 assert.deepEqual(issues[1][1],['Cambian: PLA Blanco 15 → 20 g']);
 assert.match(issues[2][1].join(),/Faltan: Caja Embalaje 3 un, PLA Blanco 30 g/);
 assert.match(run('q("#orderReview").textContent'),/3 pedidos no coinciden/);
 // Fix all: one fails (no stock) and shows why, the others are fixed.
 run(`q('#orderReview').click()`);
 assert.equal(run('qa("#reviewDialog .review-item").length'),3);
 run(`q('#reviewFixAll').click()`);await flush(40);
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),['o1','o2','o4']);
 assert.match(run('q("#reviewDialog [data-review=o4] .review-error").textContent'),/Stock insuficiente: PLA Negro/);
 assert.equal(run('qa("#reviewDialog .review-item.fixed").length'),2);
 run(`q('#reviewDialog').close()`);
 // Shopping list: reserved + unreserved orders + minimum − stock. o4 (none, ×3) still needs 30 g and 3 boxes.
 run(`S.orderReview=null;S.mode='inventory';render()`);
 run(`q('#shoppingList').click()`);await flush();
 const rows=run('[...qa("#shoppingDialog .shop-row")].map(r=>r.textContent).join(" | ")');
 assert.match(rows,/PLA Blanco.*180 g \(1 rollo de 1 kg\)/); // 450+30+200−500
 assert.doesNotMatch(rows,/Caja/); // 2+3+3−10 < 0
 assert.doesNotMatch(rows,/Tinta/);assert.match(run('q("#shoppingDialog").textContent'),/1 material sin conteo inicial/);
 assert.match(run('q("#shoppingDialog .sell-summary").textContent'),/Total estimado\$2\.826/);
 assert.match(run('shoppingText(shoppingList())'),/• PLA Blanco \(eSun\): 180 g/);
 run(`q('[data-shop-buy=pla]').click()`);assert.match(run('q("#stockDialog h2").textContent'),/Ingreso · PLA Blanco/);
 dom.window.close();
 console.log('PASS V4.8: order review (missing/extra/changed materials and cost; consumed waste allowed; fix all with per-order errors) and shopping list.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
