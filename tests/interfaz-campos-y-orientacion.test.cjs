const assert = require('node:assert/strict');
const { boot } = require('./boot.cjs');

const dom = boot(), run = code => dom.window.run(code);
// Material rows are inserted after the first field pass. Re-rendering must not link their
// quantity labels to unrelated cost inputs or leave the IVA percentage unnamed.
run(`newProduct();
  S.product.materials = [
    {resource_id:'m1',name:'Marco de prueba',unit:'un',quantity:1,unit_cost:3000},
    {resource_id:'m2',name:'Papel de prueba',unit:'un',quantity:2,unit_cost:50},
    {resource_id:'m3',name:'Caja de prueba',unit:'un',quantity:1,unit_cost:400}
  ];
  S.product.directCosts[0].amount = 1000;
  render();
  window.beforeTotals = JSON.stringify(totals());`);
for (let pass = 0; pass < 3; pass++) {
  if (pass) run('render()');
  assert.ok(run(`(() => {
    const ids = qa('[id]').map(el => el.id);
    return new Set(ids).size === ids.length;
  })()`), 'Every control keeps a unique ID after dynamic material insertion');
  assert.equal(run(`q('#ivar').labels.length`), 1);
  assert.equal(run(`q('#ivar').labels[0].textContent`), 'IVA %');
  assert.equal(run(`q('#iva').labels.length`), 1);
  assert.equal(run(`q('#iva').labels[0].textContent`), 'Aplicar');
  assert.ok(run(`qa('.recipeQty').every(input =>
    input.labels.length === 1 && input.labels[0].textContent === 'Cantidad (un)' &&
    input.labels[0].control === input)`));
  run(`qa('[data-editor-tab]').forEach(button => button.click());collect();enhanceFields();`);
  assert.equal(run('JSON.stringify(totals())'), run('beforeTotals'), 'Tabs and labels preserve all cost results');
}
// An empty filter offers the existing All action; a search or truly empty account does not
// promise to recover results by changing a status filter alone.
run(`S.quotes = [{id:'q1',quote_no:1,title:'Cuadro de prueba',client_name:'Cliente de prueba',
  status:'accepted',quantity:1,unit_price:15000,iva_enabled:false,unit_cost:4000,
  validity_days:15,created_at:new Date().toISOString()}];
  S.quoteFilter='open';S.quoteSearch='';S.mode='quotes';render();`);
assert.match(run(`q('.panel-empty').textContent`), /Ver todas las cotizaciones/);
run(`q('.panel-empty [data-quote-filter=all]').click()`);
assert.equal(run('S.quoteFilter'), 'all');
assert.ok(run(`!!q('[data-quote="q1"]')`));
run(`S.quoteSearch='inexistente';render()`);
assert.equal(run(`q('.panel-empty [data-quote-filter]')`), null);
run(`S.quotes=[];S.quoteSearch='';render()`);
assert.match(run(`q('.panel-empty').textContent`), /Aún no hay cotizaciones/);
// Folding a message changes only its presentation. The actual text and WhatsApp link stay intact.
run(`S.customers=[{id:'c1',name:'Cliente de prueba',phone:'+56 9 1234 5678'}];
  window.order={id:'o1',order_no:601,title:'Cuadro de prueba',customer_id:'c1',kind:'customer',
    status:'shipped',quantity:1,unit_price:15000,iva_enabled:false};
  root.innerHTML='<section id="exampleOrder"><div class="facts"></div></section>';
  mountCustomerNotify(order,q('#exampleOrder'));`);
assert.equal(run(`q('.notify-message').open`), false);
assert.equal(run(`q('.notify-preview').textContent`), run('statusMessage(order)'));
assert.equal(run(`q('#notifySend').getAttribute('href')`), run(`waUrl(S.customers[0].phone,statusMessage(order))`));
run(`q('.notify-message').open=true`);
assert.equal(run(`q('.notify-preview').textContent`), run('statusMessage(order)'));
dom.window.close();
console.log('PASS interfaz: etiquetas e IDs únicos con materiales dinámicos, IVA separado, cálculos intactos, salida de filtro vacío y mensaje de WhatsApp sin cambios.');
