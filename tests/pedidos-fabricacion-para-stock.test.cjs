const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
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
 // Delete: confirm explains stock is kept; reserved orders are cancelled first; deleted rows checked.
 run(`window.ops=[];window.asked=null;confirmDialog=async o=>{asked=o;return true};loadOrders=async()=>{};loadResources=async()=>{};refreshProductStock=async()=>{};
  supabase.from=t=>{const c={t};const q={update(v){c.op='update';c.v=v;return q},delete(){c.op='delete';return q},eq(k,v){c.id=v;return q},select(){c.sel=true;return q},then(a,b){ops.push(c);return Promise.resolve({data:c.op==='delete'?[{id:c.id}]:null,error:null}).then(a,b)}};return q};
  deleteOrder({...S.orders[0],stock_state:'added',product_id:'p1',inventory_state:'consumed'})`);
 await new Promise(r=>setTimeout(r,20));
 assert.match(run('asked.body'),/se mantienen/);
 assert.deepEqual(JSON.parse(run('JSON.stringify(ops.map(o=>o.op+":"+o.id))')),['delete:s1']);
 run(`ops.length=0;deleteOrder({...S.orders[1],inventory_state:'reserved',stock_state:'none'})`);
 await new Promise(r=>setTimeout(r,20));
 assert.match(run('asked.body'),/Primero se cancela/);
 assert.deepEqual(JSON.parse(run('JSON.stringify(ops.map(o=>o.op+":"+o.id))')),['update:s2','delete:s2']);
 assert.equal(run('ops[0].v.status'),'canceled');
 // Viewers have no delete button.
 run(`S.workspace.role='viewer';showOrder(S.orders[2])`);assert.equal(run('!!q("#orderDelete")'),false);
 run(`q('#orderDialog')?.close();S.workspace.role='owner';showOrder(S.orders[2])`);assert.equal(run('!!q("#orderDelete")'),true);
 dom.window.close();
 console.log('PASS V3.7: finished fabrications are closed, hidden from Pedidos/Inicio except «Fabricación», Productos «En stock» tab.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
