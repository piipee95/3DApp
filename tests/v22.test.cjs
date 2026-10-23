const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=4)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V2.2: skeletons, view transitions and editor layout.
async function test(){
 let dom=boot(),run=s=>dom.window.run(s);
 // Skeleton while a section loads, then the real view.
 run(`window.release=null;loadQuotes=()=>new Promise(r=>window.release=r);loadCustomers=async()=>{};loadOrders=async()=>{};goMode('quotes')`);
 assert.ok(run('!!q("main.skeleton")'));assert.equal(run('q(".page-title").textContent'),'Cotizaciones');
 assert.equal(run('q(".sidebar .nav-item.active").dataset.appMode'),'quotes');
 run(`release()`);await flush();
 assert.equal(run('!!q("main.skeleton")'),false);
 // Content animates when the section changes, not on re-renders of the same section.
 assert.ok(run('q("main.shell").classList.contains("view-enter")'));
 run(`render()`);assert.equal(run('q("main.shell").classList.contains("view-enter")'),false);
 // Editor: description under the name, IVA switch in the IVA field, price hero on the summary.
 run(`newProduct();S.product.directCosts[0].amount=5000;render()`);
 const order=JSON.parse(run(`JSON.stringify([...q('#name').closest('.grid').children].map(el=>el.querySelector('input,textarea')?.id||el.className))`));
 assert.equal(order[order.indexOf('name')+1],'desc');
 assert.ok(order.indexOf('desc')<order.indexOf('qty'));
 assert.ok(run('!!q(".label-switch #iva")'));
 run(`q('#iva').checked=false;q('#iva').dispatchEvent(new Event('change'))`);
 assert.equal(run('q("#ivar").disabled'),true);
 run(`q('#iva').checked=true;q('#iva').dispatchEvent(new Event('change'))`);
 assert.equal(run('q("#ivar").disabled'),false);
 run(`q('[data-editor-tab=summary]').click()`);
 assert.match(run('q("#priceHero").textContent'),/Precio de venta \/ unidad\$[\d.]+.*margen objetivo 40%.*Costo \/ un\.\$5\.000/);
 assert.ok(run('!!q(".fin-details #m7")'));
 run(`q('#margin').value=60;q('#margin').dispatchEvent(new Event('input'));refresh()`);
 assert.match(run('q("#priceHero").textContent'),/margen objetivo 60%/);
 dom.window.close();
 console.log('PASS V2.2: loading skeleton, view-enter animation only on section change, editor field order, IVA switch and live price hero.');
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1});
