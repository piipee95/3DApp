const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V2.9: expenses, real profit, VAT and partner accounts.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`window.db={expenses:[],partner_transfers:[],workspace_settings:[{workspace_id:'workspace',partners:[]}],order_payments:[]};let seq=0;
  supabase.from=table=>{let op='read',value={},filters=[];const result=()=>{let rows=db[table]||(db[table]=[]);
   if(op==='insert'){const row={id:table+'-'+(++seq),created_at:new Date().toISOString(),...value};rows.push(row);return{data:row,error:null}}
   let found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
   if(op==='update'){found.forEach(r=>Object.assign(r,value));return{data:found,error:null}}
   if(op==='delete'){db[table]=rows.filter(r=>!found.includes(r));return{data:null,error:null}}
   return{data:found,error:null}};
   const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},delete(){op='delete';return q},then(a,b){return Promise.resolve(result()).then(a,b)}};return q};
  const d=new Date(),day=k=>new Date(d.getFullYear(),d.getMonth(),k,12).toISOString();
  S.orders=[{id:'o1',order_no:1,title:'Cuadro',kind:'customer',quantity:2,unit_price:23800,iva_enabled:true,iva_rate:.19,estimated_cost:12000,status:'delivered',created_at:day(3)},
   {id:'o2',order_no:2,title:'Llavero',kind:'customer',quantity:1,unit_price:10000,iva_enabled:false,iva_rate:.19,estimated_cost:4000,actual_cost:5000,failures_cost:0,status:'ready',created_at:day(4)}];
  S.payments=[{id:'p1',order_id:'o1',amount:47600,paid_on:day(3).slice(0,10),received_by:'Felipe'},{id:'p2',order_id:'o2',amount:10000,paid_on:day(4).slice(0,10),received_by:''}];
  S.settings.partners=[];S.mode='finance';render()`);
 // Without partners the section invites to configure them.
 assert.match(run('q("main").textContent'),/Agrega a los socios/);
 // Configure partners: shares must add up to 100.
 run(`q('#editPartners').click();qa('.pName')[0].value='Felipe';qa('.pName')[1].value='Socio';qa('.pShare')[0].value=60;q('#partnersForm').requestSubmit()`);await flush();
 assert.match(run('q("#partnersFeedback").textContent'),/suman 110%/);
 run(`qa('.pShare')[0].value=50;q('#partnersForm').requestSubmit()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(db.workspace_settings[0].partners)')),[{name:'Felipe',share:50},{name:'Socio',share:50}]);
 // Expense with invoice: IVA computed; materials purchases don't count as overhead.
 run(`q('#newExpense').click();q('#exAmount').value=11900;q('#exDesc').value='Instagram';q('#exCategory').value='publicidad';q('#exInvoice').checked=true;q('#exInvoice').dispatchEvent(new Event('change'));q('#exPaidBy').value='Socio'`);
 assert.match(run('q("#exIva").textContent'),/IVA incluido: \$1\.900/);
 run(`q('#expenseForm').requestSubmit()`);await flush();
 run(`q('#newExpense').click();q('#exAmount').value=20000;q('#exCategory').value='materiales';q('#exPaidBy').value='Socio';q('#expenseForm').requestSubmit()`);await flush();
 const e=JSON.parse(run('JSON.stringify(db.expenses)'));
 assert.equal(e.length,2);assert.equal(e[0].iva_amount,1900);assert.equal(e[0].paid_by,'Socio');assert.equal(e[1].iva_amount,0);
 // Real profit: net 40.000+10.000; COGS 12.000+5.000; overhead 11.900 (materials excluded).
 const d=new Date();
 const f=JSON.parse(run(`JSON.stringify(financeMonth(${d.getFullYear()},${d.getMonth()}))`));
 assert.equal(Math.round(f.report.net),50000);assert.equal(f.cogs,17000);assert.equal(f.overhead,11900);assert.equal(f.purchases,20000);
 assert.equal(Math.round(f.real),50000-17000-11900);
 assert.equal(Math.round(f.ivaSales),7600);assert.equal(f.ivaPurchases,1900);assert.equal(Math.round(f.ivaDue),5700);
 assert.ok(Math.abs(f.breakEven-11900/(33000/50000))<1e-6);
 assert.match(run('q("main").textContent'),/Utilidad real\$21\.100.*IVA a pagar\$5\.700/);
 // Partners: Felipe received 47.600; Socio paid 31.900 → total 15.700, 50/50.
 const acc=JSON.parse(run('JSON.stringify(partnerAccounts())'));
 assert.equal(acc.unassigned,10000);assert.equal(acc.total,15700);
 assert.deepEqual(acc.moves,[{from:'Felipe',to:'Socio',amount:39750}]);
 assert.match(run('q(".settle").textContent'),/Felipe le debe \$39\.750 a Socio.*\$10\.000 en pagos sin indicar/);
 // Settle with a transfer: accounts become even.
 run(`q('[data-settle]').click();q('#transferForm').requestSubmit()`);await flush();
 assert.equal(run('db.partner_transfers[0].amount'),39750);
 assert.match(run('q(".settle").textContent'),/cuadradas/);
 // Payments register who received them (remembered on this device).
 run(`window.inserts=[];supabase.from=table=>({insert(v){inserts.push({table,v});return Promise.resolve({error:null})},select(){return this},eq(){return this},order(){return this},gte(){return this},then(a,b){return Promise.resolve({data:[],error:null}).then(a,b)}});rememberPartner('Socio')`);
 await dom.window.eval(`addPayment({id:'o9'},5000,'cash')`);
 assert.equal(run('inserts[0].v.received_by'),'Socio');
 assert.match(run('partnerField("x","Lo recibió")'),/<option value="Socio" selected>/);
 // Viewers can't add expenses.
 run(`S.workspace.role='viewer';render()`);
 assert.equal(run('!!q("#newExpense")||!!q("#editPartners")'),false);
 dom.window.close();
 console.log('PASS V2.9: partners (100% rule), expenses with VAT, real profit/break-even excluding material purchases, VAT due, partner balances and settlement, payments record receiver, viewer limits.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
