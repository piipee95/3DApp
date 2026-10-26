const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V3.0: quick price lists (sizes + extras) used in quick quotes and orders.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.db={price_lists:[]};let seq=0;
  supabase.from=table=>{let op='read',value={},filters=[];const result=()=>{let rows=db[table]||(db[table]=[]);
   if(op==='insert'){const row={id:table+'-'+(++seq),active:true,...value};rows.push(row);return{data:row,error:null}}
   let found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
   if(op==='update'){found.forEach(r=>Object.assign(r,value));return{data:found,error:null}}
   return{data:found,error:null}};
   const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},then(a,b){return Promise.resolve(result()).then(a,b)}};return q};
  S.priceLists=[];S.mode='dashboard';S.products=[];render()`);
 // From Productos: create a list with sizes and extras (empty rows ignored).
 run(`q('#priceListsBtn').click()`);
 assert.match(run('q("#priceListsDialog").textContent'),/Aún no hay tablas/);
 run(`q('#newPriceList').click();q('#plName').value='Cuadro personalizado';
  q('.rLabel').value='20×30';q('.rPrice').value=19990;
  q('[data-add-row=sizes]').click();qa('#plSizes .rLabel')[1].value='30×40';qa('#plSizes .rPrice')[1].value=24990;
  q('[data-add-row=sizes]').click();
  q('[data-add-row=extras]').click();q('#plExtras .rLabel').value='Luz LED';q('#plExtras .rPrice').value=6000;
  q('[data-add-row=extras]').click();qa('#plExtras .rLabel')[1].value='Nombre grabado';qa('#plExtras .rPrice')[1].value=3000;
  q('#priceListFormEl').requestSubmit()`);await flush();
 const pl=JSON.parse(run('JSON.stringify(db.price_lists[0])'));
 assert.equal(pl.name,'Cuadro personalizado');assert.equal(pl.iva_enabled,true);
 assert.deepEqual(pl.sizes,[{label:'20×30',price:19990},{label:'30×40',price:24990}]);
 assert.deepEqual(pl.extras,[{label:'Luz LED',price:6000},{label:'Nombre grabado',price:3000}]);
 assert.match(run('q("#priceListsDialog").textContent'),/Cuadro personalizado.*20×30 \$19\.990 · 30×40 \$24\.990 · 2 extras/);
 // Needs at least one size.
 run(`q('#priceListsDialog').close();showPriceListForm({});q('#plName').value='Vacía';q('#priceListFormEl').requestSubmit()`);await flush();
 assert.match(run('q("#plFeedback").textContent'),/al menos un tamaño/);
 run(`q('#priceListForm').close()`);
 // Quick quote: choose size + extras → title and price filled; total with IVA.
 run(`showQuickJob('quote')`);
 assert.ok(run('!!q("#plPick")'));
 run(`q('#plPick').value=db.price_lists[0].id;q('#plPick').dispatchEvent(new Event('change'))`);
 assert.equal(run('q("#qjPrice").value'),'19990');assert.equal(run('q("#qjTitle").value'),'Cuadro personalizado 20×30');
 run(`qa('[name=plSize]')[1].checked=true;qa('[name=plSize]')[1].dispatchEvent(new Event('change'));q('[name=plExtra]').checked=true;q('[name=plExtra]').dispatchEvent(new Event('change'))`);
 assert.equal(run('q("#qjPrice").value'),'30990');assert.equal(run('q("#qjTitle").value'),'Cuadro personalizado 30×40 + Luz LED');
 assert.match(run('q("#qjTotal").textContent'),/Total: \$30\.990/);
 // A title typed by hand is kept when options change.
 run(`q('#qjTitle').value='Cuadro de Luna';qa('[name=plExtra]')[1].checked=true;qa('[name=plExtra]')[1].dispatchEvent(new Event('change'))`);
 assert.equal(run('q("#qjTitle").value'),'Cuadro de Luna');assert.equal(run('q("#qjPrice").value'),'33990');
 run(`q('#quickJobDialog').close()`);
 // Inactive lists don't show in the picker; with none, editors get a shortcut to create one.
 run(`S.priceLists[0].active=false;showQuickJob('order')`);
 assert.equal(run('!!q("#plPick")'),false);assert.ok(run('!!q("#setupPriceLists")'));
 run(`q('#quickJobDialog').close()`);
 dom.window.close();
 console.log('PASS V3.0: price lists (sizes/extras, validation), picker fills price/title/IVA, manual title kept, inactive hidden, setup shortcut.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
