const assert = require('node:assert/strict');
const { boot } = require('./v12.test.cjs');
const flush = async (k = 4) => {
  for (let i = 0; i < k; i++) await new Promise(r => setTimeout(r, 0));
};
// V1.8: saved quotes with folio, customers created on the fly, quote → order and remembered screen.
async function test() {
  let dom = boot(),
    run = s => dom.window.run(s);
  run(`window.db={quotes:[],customers:[],production_orders:[],products:[],product_cost_summary:[],workspace_resources:[]};window.requests=[];let seq=0;
  supabase.from=table=>{let op='read',value={},filters=[];const result=()=>{requests.push({table,op,value,filters});let rows=db[table]||(db[table]=[]);
   if(op==='insert'){const row={id:table+'-'+(++seq),created_at:new Date().toISOString(),...(table==='quotes'?{quote_no:rows.length+1,status:'sent'}:{}),...(table==='production_orders'?{order_no:40+rows.length,status:'pending'}:{}),...value};rows.push(row);return{data:row,error:null}}
   let found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
   if(op==='update'){found.forEach(r=>Object.assign(r,value));return{data:found[0],error:null}}
   if(op==='delete'){db[table]=rows.filter(r=>!found.includes(r));return{data:null,error:null}}
   return{data:found,error:null}};
   const query={select(){return query},eq(k,v){filters.push([k,v]);return query},not(){return query},order(){return query},limit(){return query},insert(v){op='insert';value=v;return query},update(v){op='update';value=v;return query},delete(){op='delete';return query},single(){const r=result();return Promise.resolve({...r,data:Array.isArray(r.data)?r.data[0]:r.data})},maybeSingle(){return query.single()},then(a,b){return Promise.resolve(result()).then(a,b)}};return query};
  window.print=()=>{window.printed=(window.printed||0)+1};
  newProduct();S.product.id='prod1';S.product.name='Cuadro Iron Man';S.product.directCosts[0].amount=9000;S.dirty=false;
  S.products=[{id:'prod1',name:'Cuadro Iron Man',quantity:1,status:'active',stock_qty:3,stock_reserved:0}];render()`);
  // Printing a product quote saves it once with a sequential folio and creates the customer.
  run(`q('[data-editor-tab=summary]').click();q('#quote').click()`);
  assert.ok(run('!!q("#saveQuote")'));
  assert.equal(run('q("#quoteClient").getAttribute("list")'), 'customerList');
  run(
    `q('#quoteClient').value='Comercial Andes';q('#quoteClient').dispatchEvent(new Event('input'));q('#printQuote').click()`
  );
  await flush();
  assert.equal(run('window.printed'), 1);
  const quote = JSON.parse(run('JSON.stringify(db.quotes[0])'));
  assert.equal(quote.title, 'Cuadro Iron Man');
  assert.equal(quote.client_name, 'Comercial Andes');
  assert.equal(quote.product_id, 'prod1');
  assert.equal(quote.unit_cost, 9000);
  assert.ok(quote.customer_id);
  assert.equal(run('db.customers.length'), 1);
  assert.match(run('q("#quoteSheet").textContent'), /COT-0001/);
  assert.match(run('q("#quoteFeedback").textContent'), /Guardada como COT-0001/);
  // Printing again updates the same quote instead of creating another.
  run(
    `q('#quoteDelivery').value='5 días';q('#quoteDelivery').dispatchEvent(new Event('input'));q('#printQuote').click()`
  );
  await flush();
  assert.equal(run('db.quotes.length'), 1);
  assert.equal(run('db.quotes[0].delivery'), '5 días');
  assert.equal(run('db.customers.length'), 1);
  // Order quotes (PED-n) are not saved as quotes.
  run(
    `q('#closeQuote').click();showQuote({folio:'PED-3',client:'Ana',name:'Pedido',quantity:1,price:1000,ivaEnabled:false,ivaRate:.19})`
  );
  assert.equal(run('!!q("#saveQuote")'), false);
  run(`q('#closeQuote').click()`);
  // Cotizaciones list: open pill, totals and detail.
  run(`S.quotes=db.quotes;S.customers=db.customers;S.mode='quotes';render()`);
  assert.equal(run('q(".page-title").textContent'), 'Cotizaciones');
  assert.equal(run('qa(".data-table tbody tr").length'), 1);
  assert.match(run('q(".data-table tbody tr").textContent'), /COT-0001.*Comercial Andes.*Enviada/);
  assert.match(run('q(".summary-strip").textContent'), /Abiertas\s*1/);
  // Accepting creates the order with quoted price, customer and stock option, and links it back.
  run(`q('[data-quote]').click()`);
  assert.match(run('q("#savedQuoteDialog").textContent'), /Utilidad estimada/);
  run(`q('#acceptQuote').click()`);
  assert.ok(run('!!q("#qoFromStock")'));
  run(`goMode=async m=>{S.mode=m};q('#qoFromStock').checked=true;q('#quoteOrderForm').requestSubmit()`);
  await flush(6);
  const order = JSON.parse(run('JSON.stringify(db.production_orders[0])'));
  assert.equal(order.customer_id, quote.customer_id);
  assert.equal(order.from_stock, true);
  assert.equal(order.unit_price, quote.unit_price);
  assert.equal(order.estimated_cost, 9000);
  assert.match(order.notes, /^COT-0001/);
  assert.equal(run('db.quotes[0].status'), 'accepted');
  assert.equal(run('db.quotes[0].order_id'), order.id);
  assert.match(run('S.msg'), /PED-40 creado desde COT-0001/);
  // Expired quotes get their own pill.
  run(
    `S.quotes.push({id:'old',quote_no:9,title:'Llavero',client_name:'',quantity:1,unit_price:900,iva_enabled:false,iva_rate:.19,unit_cost:0,validity_days:15,status:'sent',created_at:'2020-01-01T00:00:00Z'});S.quoteFilter='expired';S.mode='quotes';render()`
  );
  assert.equal(run('qa(".data-table tbody tr").length'), 1);
  assert.match(run('q(".data-table tbody tr").textContent'), /Vencida/);
  // Clientes: history, sales and WhatsApp link.
  run(`S.orders=db.production_orders;S.customers[0].phone='9 1234 5678';S.mode='customers';render()`);
  assert.match(run('q(".data-table tbody tr").textContent'), /Comercial Andes.*1.*1/);
  run(`q('[data-customer]').click()`);
  assert.equal(run('q("#customerDialog a.btn").getAttribute("href")'), 'https://wa.me/56912345678');
  assert.equal(run('qa("#customerDialog .history-list .list-row").length'), 2);
  run(`q('#cuInstagram').value='@andes';q('#customerForm').requestSubmit()`);
  await flush();
  assert.equal(run('db.customers[0].instagram'), '@andes');
  // Duplicate names are rejected before saving.
  run(`showCustomer({});q('#cuName').value=' comercial andes ';q('#customerForm').requestSubmit()`);
  await flush();
  assert.match(run('q("#cuFeedback").textContent'), /Ya existe/);
  run(`q('#customerDialog').close()`);
  // The open screen is remembered for the next load.
  run(`S.mode='customers';render()`);
  assert.equal(run('JSON.parse(localStorage.getItem(viewKey())).mode'), 'customers');
  run(`history.replaceState(null,'',location.pathname);S.mode='home';window.restored=null;restoreView().then(v=>window.restored=v)`);
  await flush(6);
  assert.equal(run('window.restored'), true);
  assert.equal(run('S.mode'), 'customers');
  run(
    `history.replaceState(null,'',location.pathname);openProduct=async id=>{S.mode='product';S.product={id}};localStorage.setItem(viewKey(),JSON.stringify({mode:'product',product:'prod1',tab:'costs'}));S.mode='home';restoreView()`
  );
  await flush();
  assert.equal(run('S.mode'), 'product');
  assert.equal(run('S.editorTab'), 'costs');
  run(
    `history.replaceState(null,'',location.pathname);localStorage.setItem(viewKey(),JSON.stringify({mode:'product',product:'borrado'}));S.mode='home';restoreView().then(v=>window.restored=v)`
  );
  await flush();
  assert.equal(run('window.restored'), false);
  assert.equal(run('S.mode'), 'home');
  // Phone "Más" sheet reaches the new sections; viewers can't save quotes or edit customers.
  run(`S.mode='dashboard';render();q('#moreTab').click()`);
  assert.ok(run('!!q("#moreSheet [data-more=quotes]")&&!!q("#moreSheet [data-more=customers]")'));
  run(`q('#moreSheet').close();S.workspace.role='viewer';S.mode='customers';render()`);
  assert.equal(run('!!q("#newCustomer")'), false);
  run(`S.product={...S.product,prints:[],directCosts:[],additionalCosts:[]};showQuote()`);
  assert.equal(run('!!q("#saveQuote")'), false);
  dom.window.close();
  console.log(
    'PASS V1.8: quotes saved with folio on print/share, customers created on the fly, quote → order (stock, customer, link), expired filter, customer history/WhatsApp/duplicates, remembered screen and viewer limits.'
  );
}
if (require.main === module)
  test().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
