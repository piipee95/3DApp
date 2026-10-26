const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
// V3.8: money in raw materials, finished goods and projected income.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`S.resources=[{id:'f',kind:'filament',name:'PLA',counted:true,stock_qty:1000,unit_cost:15.7},{id:'s',kind:'supply',name:'Marco',counted:true,stock_qty:10,unit_cost:3000},
   {id:'u',kind:'supply',name:'Sin contar',counted:false,stock_qty:0,unit_cost:999},{id:'p',kind:'printer',name:'Bambu',stock_qty:0}];
  S.products=[{id:'a',name:'Cuadro Iron Man',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,target_margin:.4,round_to:1000,sale_price:23800,stock_qty:2,stock_reserved:0},
   {id:'b',name:'Llavero',quantity:1,status:'active',iva_enabled:false,iva_rate:.19,target_margin:.5,round_to:100,sale_price:2000,stock_qty:5,stock_reserved:1},
   {id:'c',name:'Viejo',quantity:1,status:'archived',sale_price:9999,stock_qty:3}];
  S.summaries=new Map([['a',{total_cost:8000}],['b',{total_cost:500}]]);
  S.orders=[{id:'o1',order_no:1,title:'Pedido',kind:'customer',status:'ready',quantity:1,unit_price:20000,iva_enabled:true,iva_rate:.19,created_at:new Date().toISOString()}];
  S.payments=[{id:'p1',order_id:'o1',amount:5000}];`);
 const v=JSON.parse(run('JSON.stringify(stockValuation())'));
 assert.equal(Math.round(v.filament),15700);assert.equal(v.supplies,30000);assert.equal(Math.round(v.materials),45700);
 assert.equal(v.units,7);assert.equal(v.goodsCost,2*8000+5*500);
 assert.equal(v.goodsSale,2*23800+5*2000);
 assert.equal(Math.round(v.goodsProfit),Math.round(2*(23800/1.19-8000)+5*(2000-500)));
 assert.equal(v.due,15000);assert.equal(Math.round(v.invested),45700+18500);assert.equal(v.expected,57600+15000);
 // Finanzas shows the panel; Inicio has the tile that links to it.
 run(`S.expenses=[];S.transfers=[];S.mode='finance';render()`);
 assert.match(run('q(".valuation").textContent'),/Tu dinero hoy.*Materias primas\$45\.700.*Productos fabricados\$18\.500.*7 unidades en stock.*Invertido en stock\$64\.200/);
 assert.match(run('q(".valuation").textContent'),/Ingreso proyectado\$72\.600/);
 run(`S.mode='home';render()`);
 assert.match(run(`q(".kpis").textContent`),/Productos en stock\$18\.500.*7 un\. · se venden en.*Materia prima\$45\.700/);
 dom.window.close();
 console.log('PASS V3.8: stock valuation (filament/supplies at average cost, finished goods at cost and sale price, projected profit, receivables), Finanzas panel and Inicio tile.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
