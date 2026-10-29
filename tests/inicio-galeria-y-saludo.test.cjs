const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
// V4.2: gallery view, personal Inicio with quick actions, sell picker, no focus line after closing a dialog.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`S.session={user:{id:'u',email:'felipe.pino@kultiversopop.cl'}};S.payments=[];S.quotes=[];
  S.products=[{id:'a',name:'Cuadro Iron Man',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,target_margin:.4,round_to:1000,sale_price:10990,stock_qty:1,stock_reserved:0},
   {id:'b',name:'Llavero',quantity:1,status:'active',iva_enabled:false,iva_rate:.19,target_margin:.5,round_to:100,stock_qty:0}];S.summaries=new Map([['a',{total_cost:5195}]]);
  S.orders=[{id:'o1',order_no:1,title:'Pedido',kind:'customer',status:'printing',quantity:1,unit_price:20000,iva_enabled:true,iva_rate:.19,due_date:localToday(),created_at:new Date().toISOString()}];`);
 // Gallery view is remembered and shows cards with stock badge and «Vender».
 run(`S.mode='dashboard';S.productView=null;localStorage.removeItem('kultiapp_product_view');render()`);
 assert.equal(run('!!q(".product-grid")'),false);
 run(`q('#viewToggle').click()`);
 assert.equal(run('localStorage.getItem("kultiapp_product_view")'),'grid');assert.equal(run('qa(".product-card").length'),2);
 assert.match(run('q(".product-card .product-metrics").textContent'),/Disponible1 un\./);assert.equal(run('qa(".product-card [data-sell]").length'),1);
 run(`q('#viewToggle').click()`);assert.equal(run('!!q(".product-grid")'),false);
 // Inicio: greeting with the user's name, the day in one sentence, quick actions.
 run(`S.mode='home';render()`);
 assert.match(run('q(".home-hello").textContent'),/^(Buenos días|Buenas tardes|Buenas noches), Felipe/);
 assert.match(run('q(".home-sentence").textContent'),/^Tienes 1 pedido en curso, 1 para entregar hoy y \$20\.000 por cobrar\.$/);
 assert.equal(run('qa("[data-quick-action]").length'),4);
 run(`q('[data-quick-action=sell]').click()`);
 assert.equal(run('qa("#sellPicker [data-sell-pick]").length'),1);
 run(`q('[data-sell-pick=a]').click()`);assert.match(run('q("#sellDialog h2").textContent'),/Vender · Cuadro Iron Man/);
 // Closing a dialog doesn't leave the opener row focused.
 run(`q('#sellDialog').close()`);await new Promise(r=>setTimeout(r,5));
 assert.equal(run('document.activeElement?.matches?.(".list-row,[data-open]")||false'),false);
 run(`S.workspace.role='viewer';render()`);assert.equal(run('qa("[data-quick-action]").length'),0);
 dom.window.close();
 console.log('PASS V4.2: gallery view (remembered, stock badge, sell), personal greeting and sentence, quick actions, sell picker, focus cleared after dialogs, viewer limits.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
