const assert = require('node:assert/strict');
const { boot } = require('./v12.test.cjs');
const flush = () => new Promise(r => setTimeout(r, 0));
// V1.7: filament picker, finished-goods stock, fabrication for stock and quick price/stock edits.
async function test() {
  let dom = boot(),
    run = s => dom.window.run(s);
  run(`window.db={workspace_resources:[{id:'f1',workspace_id:'workspace',kind:'filament',name:'Rojo',material:'PLA',color:'#ff0000',price_per_kg:20000,stock_qty:900,reserved_qty:0,counted:true,active:true},{id:'f2',workspace_id:'workspace',kind:'filament',name:'Negro',material:'Elegoo',color:'#000000',price_per_kg:15700,stock_qty:50,reserved_qty:0,counted:true,active:true}],production_orders:[],products:[],product_cost_summary:[]};
  window.requests=[];window.rpcs=[];
  supabase.rpc=async(name,args)=>{rpcs.push({name,args});return{data:args.p_count,error:null}};
  supabase.from=table=>{let op='read',value={},filters=[];const result=()=>{requests.push({table,op,value,filters});let rows=db[table]||[];if(op==='insert'){const row={id:'id-'+(rows.length+1),order_no:rows.length+1,status:'pending',created_at:new Date().toISOString(),...value};rows.push(row);return{data:row,error:null}}let found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));if(op==='update'){found.forEach(r=>Object.assign(r,value));return{data:found[0],error:null}}return{data:found,error:null}};
   const query={select(){return query},eq(k,v){filters.push([k,v]);return query},not(){return query},order(){return query},limit(){return query},insert(v){op='insert';value=v;return query},update(v){op='update';value=v;return query},single(){const r=result();return Promise.resolve({...r,data:Array.isArray(r.data)?r.data[0]:r.data})},then(a,b){return Promise.resolve(result()).then(a,b)}};return query};
  S.resources=db.workspace_resources;newProduct();`);
  // Adding a color opens the picker; choosing links the catalog filament and its price.
  run(`q('[data-editor-tab=prints]').click();q('#addP').click();q('.addF').click()`);
  assert.ok(run('!!q("#filamentPicker")'));
  assert.equal(run('qa("#filGrid [data-pick]").length'), 2);
  run(`q('#filSearch').value='eleg';q('#filSearch').dispatchEvent(new Event('input'))`);
  assert.equal(run('qa("#filGrid [data-pick]").length'), 1);
  run(`q('#filGrid [data-pick=f2]').click()`);
  assert.equal(run('q(".filament-row").dataset.resourceId'), 'f2');
  assert.ok(run('q(".filament-row").classList.contains("linked")'));
  assert.match(run('q(".filament-row .pickF").textContent'), /Negro.*Elegoo.*50 g disp/);
  assert.equal(run('q(".filament-row .fp").value'), '15700');
  // Grams above what is available are flagged in the picker.
  run(`q('.fg').value=120;refresh();q('.filament-row .pickF').click()`);
  assert.ok(run('q("#filGrid [data-pick=f2] .fil-stock").classList.contains("down")'));
  assert.ok(run('q("#filGrid [data-pick=f2]").classList.contains("on")'));
  run(`q('#filUnlink').click()`);
  assert.equal(run('q(".filament-row").dataset.resourceId'), '');
  assert.match(run('q(".filament-row .pickF").textContent'), /Elegir del inventario/);
  // Summary shows finished stock; fabrication "already made" adds units right away.
  run(`S.product.id='prod1';S.product.name='Iron Man';S.product.stock_qty=5;S.product.stock_reserved=2;S.dirty=false;
  refreshProductStock=async()=>{};goMode=async m=>{S.mode=m};S.editorTab='summary';render()`);
  assert.match(run('q(".stock-card").textContent'), /3 unidades.*2 reservadas/);
  run(`q('#makeStock').click()`);
  await flush();
  assert.equal(run('q("#newOrderDialog h2").textContent'), 'Fabricar para stock');
  assert.equal(run('!!q("#orderCustomer")||!!q("#orderPrice")'), false);
  run(
    `q('#orderQty').value=2;q('#orderQty').dispatchEvent(new Event('input'));q('#orderAlreadyMade').checked=true;q('#newOrderForm').requestSubmit()`
  );
  await flush();
  await flush();
  await flush();
  const made = JSON.parse(
    run('JSON.stringify(requests.filter(r=>r.table==="production_orders"&&r.op!=="read"))')
  );
  assert.equal(made[0].op, 'insert');
  assert.equal(made[0].value.kind, 'stock');
  assert.equal(made[0].value.from_stock, false);
  assert.equal(made[0].value.quantity, 2);
  assert.equal(made[0].value.unit_price, 0);
  assert.equal(made[1].op, 'update');
  assert.deepEqual(made[1].value, { status: 'ready' });
  assert.match(run('S.msg'), /2 unidades sumadas al stock de Iron Man/);
  // Customer order served from stock: no material reservation, flagged from_stock.
  run(`S.mode='product';render();requests.length=0;showNewOrder()`);
  assert.equal(run('q("#newOrderDialog h2").textContent'), 'Pedido de cliente');
  assert.match(run('q("#orderFromStock").closest("label").textContent'), /3 unidades disponibles/);
  run(`q('#orderFromStock').checked=true;q('#orderFromStock').dispatchEvent(new Event('change'))`);
  assert.ok(run('q("#newOrderStock").closest(".notice").hidden'));
  run(`q('#orderCustomer').value='Andes';q('#orderQty').value=1;q('#newOrderForm').requestSubmit()`);
  await flush();
  await flush();
  await flush();
  const sale = JSON.parse(
    run('JSON.stringify(requests.find(r=>r.table==="production_orders"&&r.op==="insert").value)')
  );
  assert.equal(sale.kind, 'customer');
  assert.equal(sale.from_stock, true);
  assert.equal(sale.customer_name, 'Andes');
  // Stock orders stay out of sales, get their own filter and label.
  run(`S.orders=db.production_orders`);
  const ym = [new Date().getFullYear(), new Date().getMonth()];
  assert.equal(run(`monthTotals(${ym[0]},${ym[1]}).count`), 1);
  run(`S.orderFilter='stock';S.mode='production';render()`);
  assert.equal(run('qa(".data-table tbody tr").length'), 1);
  assert.match(run('q(".data-table tbody tr").textContent'), /Para stock/);
  assert.match(run('q("[data-order-filter=stock]").textContent'), /Fabricación/);
  // Quick edit from the product list: price, margin and counted stock.
  run(`S.products=[{id:'prod1',workspace_id:'workspace',name:'Iron Man',quantity:1,iva_enabled:true,iva_rate:.19,target_margin:.4,round_to:1000,status:'active',sale_price:null,stock_qty:5,stock_reserved:2}];
  db.products=S.products.map(p=>({...p}));S.summaries=new Map([['prod1',{total_cost:9000}]]);S.mode='dashboard';render();requests.length=0`);
  assert.match(run('q(".products-table tbody tr").textContent'), /3\s*\+2 res\./);
  run(`q('.products-table [data-quick=prod1]').click()`);
  assert.ok(run('!!q("#quickEditDialog")'));
  run(
    `q('#qePrice').value=25000;q('#qeMargin').value=45;q('#qeStock').value=7;q('#qeNote').value='Conteo';q('#qePrice').dispatchEvent(new Event('input'))`
  );
  assert.match(run('q("#qePreview").textContent'), /\$25\.000/);
  run(`q('#quickEditForm').requestSubmit()`);
  await flush();
  await flush();
  await flush();
  const upd = JSON.parse(run('JSON.stringify(requests.find(r=>r.table==="products"&&r.op==="update"))'));
  assert.deepEqual(upd.value, { sale_price: 25000, target_margin: 0.45 });
  assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs.at(-1))')), {
    name: 'adjust_product_stock',
    args: { p_product: 'prod1', p_count: 7, p_note: 'Conteo' }
  });
  // Unchanged stock skips the RPC.
  run(`rpcs.length=0;showQuickEdit(S.products[0]);q('#qeStock').value=5;q('#quickEditForm').requestSubmit()`);
  await flush();
  await flush();
  assert.equal(run('rpcs.length'), 0);
  // Viewers cannot edit stock or prices.
  run(`S.workspace.role='viewer';render()`);
  assert.equal(run('qa("[data-quick]").length'), 0);
  // Counted filaments keep an editable price per kg (fixes typos like $1.541/kg).
  run(`S.workspace.role='owner';requests.length=0;showInventoryForm(S.resources[0])`);
  assert.equal(run("q('label[for=invCost]').textContent"), 'Precio por kg CLP');
  assert.equal(run("q('#invCost').readOnly"), false);
  assert.equal(run("q('#invCost').value"), '20000');
  run(`q('#invCost').value=15400;q('#inventoryForm').requestSubmit()`);
  await flush();
  await flush();
  const inv = JSON.parse(
    run('JSON.stringify(requests.find(r=>r.table==="workspace_resources"&&r.op==="update").value)')
  );
  assert.equal(inv.price_per_kg, 15400);
  assert.equal(inv.unit_cost, 15.4);
  dom.window.close();
  console.log(
    'PASS V1.7: filament picker with availability, product stock card, fabrication for stock (already made), customer order from stock, stock filter/sales exclusion and quick price/stock edit.'
  );
}
if (require.main === module)
  test().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
