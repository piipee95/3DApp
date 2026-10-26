const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V2.7: error log and lighter startup (last 12 months + open) with older months on demand.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.calls=[];window.inserts=[];
  supabase.from=table=>{const c={table,ops:[]};calls.push(c);const q={select(){return q},eq(k,v){c.ops.push('eq:'+k);return q},order(){return q},or(f){c.ops.push('or:'+f);return q},gte(k,v){c.ops.push('gte:'+k+'='+v);return q},lt(k,v){c.ops.push('lt:'+k+'='+v);return q},
   insert(v){inserts.push({table,v});return Promise.resolve({error:null})},
   then(a,b){const rows=table==='production_orders'&&c.ops.some(o=>o.startsWith('lt:'))?[{id:'old1',order_no:1,title:'Antiguo',kind:'customer',quantity:1,unit_price:10000,iva_enabled:false,status:'delivered',created_at:'2024-01-10T12:00:00Z'}]:[];return Promise.resolve({data:rows,error:null}).then(a,b)}};return q};`);
 // Startup window: orders from 12 months or still open; quotes recent or open; payments 2 years.
 await dom.window.eval('loadOrders()');
 const ordersCall=JSON.parse(run('JSON.stringify(calls.find(c=>c.table==="production_orders"))'));
 assert.match(ordersCall.ops.find(o=>o.startsWith('or:')),/^or:created_at\.gte\."\d{4}-\d{2}-\d{2}T[^"]+",status\.not\.in\.\(delivered,canceled\)$/);
 assert.ok(JSON.parse(run('JSON.stringify(calls.find(c=>c.table==="order_payments").ops)')).some(o=>/^gte:paid_on=\d{4}-\d{2}-01$/.test(o)));
 await dom.window.eval('loadQuotes()');
 assert.match(JSON.parse(run('JSON.stringify(calls.find(c=>c.table==="quotes").ops)')).find(o=>o.startsWith('or:')),/status\.eq\.sent$/);
 // Reports reaching before the window fetch that range once and include it.
 run(`S.historyFrom=new Date(2025,0,1).toISOString();S.orders=[];S.payments=[];S.quotes=[];calls.length=0`);
 assert.equal(run('needsHistory(2025,3)'),true);assert.equal(run('needsHistory(2025,8)'),false);
 await dom.window.eval('ensureHistory(2024,1)');
 assert.equal(run('calls.length'),3);
 assert.ok(JSON.parse(run('JSON.stringify(calls[0].ops)')).includes('lt:created_at='+run('S.historyFrom')));
 assert.equal(run('monthReport(2024,0).total'),10000);
 await dom.window.eval('ensureHistory(2024,3)');assert.equal(run('calls.length'),3);
 // Errors: handled messages and uncaught errors are stored once each, at most 20 per session.
 run(`S.mode='quotes';fail('No se pudo guardar')`);
 run(`logError('handled','No se pudo guardar')`);
 let logged=JSON.parse(run('JSON.stringify(inserts.filter(i=>i.table==="app_errors").map(i=>i.v))'));
 assert.equal(logged.length,1);
 assert.equal(logged[0].kind,'handled');assert.equal(logged[0].screen,'quotes');assert.equal(logged[0].app_version,run('APP_VERSION'));assert.equal(logged[0].workspace_id,run('S.workspace.id'));
 run(`for(let i=0;i<40;i++)logError('error','Error '+i)`);
 assert.equal(run('inserts.filter(i=>i.table==="app_errors").length'),20);
 // Without a session nothing is sent.
 run(`loggedErrors.clear();inserts.length=0;S.session=null;logError('error','x')`);
 assert.equal(run('inserts.length'),0);
 // If the window filter fails, the full list still loads and the failure is logged.
 run(`S.session={user:{id:'u'}};loggedErrors.clear();inserts.length=0;let first=true;
  supabase.from=table=>{const q={select(){return q},eq(){return q},order(){return q},gte(){return q},or(){const r=Promise.resolve({data:null,error:{message:'parse error'}});return r},insert(v){inserts.push({table,v});return Promise.resolve({error:null})},then(a,b){return Promise.resolve({data:[{id:'o9',created_at:'2020-01-01T00:00:00Z'}],error:null}).then(a,b)}};return q}`);
 await dom.window.eval('loadOrders()');
 assert.equal(run('S.orders.length'),1);
 assert.match(run('inserts.find(i=>i.table==="app_errors").v.message'),/Filtro de carga reciente: parse error/);
 dom.window.close();
 console.log('PASS V2.7: startup loads last 12 months + open orders/sent quotes, payments 2 years, older report months on demand (once), error log deduped and capped, no log without session.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
