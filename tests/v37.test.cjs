const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
// V3.7: finished fabrications for stock are stock, not orders.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`const now=new Date().toISOString();
  S.products=[{id:'p1',name:'Cuadro Iron Man',quantity:1,status:'active',stock_qty:1,stock_reserved:0},{id:'p2',name:'Cuadro Spiderman',quantity:1,status:'active',stock_qty:2,stock_reserved:1},{id:'p3',name:'Llavero',quantity:1,status:'active',stock_qty:0}];S.summaries=new Map();
  S.orders=[{id:'s1',order_no:29,title:'Cuadro Iron Man',kind:'stock',status:'ready',quantity:1,unit_price:0,created_at:now,due_date:localToday()},
   {id:'s2',order_no:32,title:'Cuadro Spiderman',kind:'stock',status:'printing',quantity:2,unit_price:0,created_at:now},
   {id:'c1',order_no:22,title:'Cuadro Formula 1',kind:'customer',customer_name:'Ana',status:'ready',quantity:1,unit_price:25000,created_at:now}];S.payments=[];`);
 assert.equal(run('orderIsOpen(S.orders[0])'),false);assert.equal(run('orderIsOpen(S.orders[1])'),true);assert.equal(run('orderIsOpen(S.orders[2])'),true);
 // Pedidos: a finished fabrication is only under «Fabricación»; one in progress is still work in progress.
 run(`S.mode='production';S.orderFilter='open';render()`);
 assert.doesNotMatch(run('q("main").textContent'),/PED-29/);assert.match(run('q("main").textContent'),/PED-32/);
 for(const f of ['all','ready'])assert.equal(run(`S.orders.filter(o=>orderMatches(o,'${f}')).map(o=>o.id).join()`),f==='all'?'s2,c1':'c1');
 assert.equal(run(`S.orders.filter(o=>orderMatches(o,'stock')).map(o=>o.id).join()`),'s1,s2');
 // Inicio: not counted as an order in progress nor as a delivery.
 run(`S.mode='home';render()`);
 assert.doesNotMatch(run('q(".data-table")?.textContent||""'),/Cuadro Iron Man/);
 // Productos → «En stock» lists finished goods with available units.
 run(`S.mode='dashboard';S.showStock=false;render()`);
 assert.match(run('q("#showStock").textContent'),/En stock\s*2/);
 run(`q('#showStock').click()`);
 assert.equal(run('S.showStock'),true);
 const names=run('[...new Set(qa("[data-open] b").map(b=>b.textContent))].join()');
 assert.match(names,/Cuadro Iron Man/);assert.match(names,/Cuadro Spiderman/);assert.doesNotMatch(names,/Llavero/);
 run(`q('#showActive').click()`);assert.equal(run('S.showStock'),false);
 dom.window.close();
 console.log('PASS V3.7: finished fabrications are closed, hidden from Pedidos/Inicio except «Fabricación», Productos «En stock» tab.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
