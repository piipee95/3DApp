const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=()=>new Promise(r=>setTimeout(r,0));
const PHOTO='data:image/jpeg;base64,YWJj';
// In-memory Supabase with the query and Storage calls used by V1.5.
const mock=`window.db={products:[],product_cost_summary:[]};window.log=[];window.objects=new Set();
supabase.from=table=>{let op='read',value=null,cols='*';const filters=[];const rows=()=>window.db[table].filter(r=>filters.every(f=>f(r)));
 const run=()=>{window.log.push({table,op,cols,value});if(op==='update'){rows().forEach(r=>Object.assign(r,value));return{data:null,error:null}}
  return{data:rows().map(r=>cols==='*'?{...r}:Object.fromEntries(cols.split(',').map(c=>[c,r[c]]))),error:null}};
 const query={select(c){cols=c||'*';return query},eq(k,v){filters.push(r=>r[k]===v);return query},not(k,o,v){filters.push(r=>r[k]!=null);return query},
  order(){return query},limit(){return query},update(v){op='update';value=v;return query},then(ok,ko){return Promise.resolve(run()).then(ok,ko)}};return query};
supabase.storage={from:bucket=>({
 createSignedUrls:async(paths)=>{window.log.push({op:'sign',paths});return{data:paths.map(path=>({path,signedUrl:'https://cdn.test/'+path+'?token=a&b=1'})),error:null}},
 upload:async(path,blob,o)=>{window.log.push({op:'upload',bucket,path,type:o.contentType,size:blob.size});window.objects.add(path);return{error:null}},
 remove:async(paths)=>{window.log.push({op:'remove',paths});paths.forEach(p=>window.objects.delete(p));return{error:null}}})};`;
async function test(){
 let dom=boot(),run=s=>dom.window.run(s);
 run(mock);

 // The dashboard never downloads stored photos inline; it signs Storage paths in one batch.
 run(`db.products=[{id:'a',workspace_id:'workspace',name:'Con foto',quantity:1,target_margin:.4,status:'active',photo_path:'workspace/old.jpg',photo_data:null,updated_at:'2'},{id:'b',workspace_id:'workspace',name:'Sin costo',quantity:1,target_margin:.4,status:'active',updated_at:'1'}];window.objects.add('workspace/old.jpg');loadProducts()`);
 await flush();await flush();
 const list=run('JSON.stringify(log.find(x=>x.table==="products"&&x.op==="read").cols)');
 assert(!list.includes('photo_data')&&list.includes('photo_path'));
 assert.equal(run('log.filter(x=>x.op==="sign").length'),1);
 run('S.mode="dashboard";render()');
 assert.equal(run('q(".product-thumb").getAttribute("src")'),'https://cdn.test/workspace/old.jpg?token=a&b=1');

 // Saving a new photo uploads a JPEG, stores only its path and removes the unreferenced old object.
 run(`saveSettings=async()=>{};supabase.rpc=async(name,args)=>{window.bundle={name,args};db.products[0].photo_path=args.p_photo_path;return{data:'a',error:null}};
  S.product={...db.products[0],prints:[],directCosts:[],additionalCosts:[],saved_photo_path:'workspace/old.jpg',iva_enabled:true,iva_rate:.19,round_to:1000};S.mode='product';render();
  S.product.photo_data='${PHOTO}';S.dirty=true;render();saveProduct()`);
 for(let i=0;i<6;i++)await flush();
 const upload=JSON.parse(run('JSON.stringify(log.find(x=>x.op==="upload"))'));
 assert.equal(upload.bucket,'product-photos');assert.equal(upload.type,'image/jpeg');assert.equal(upload.size,3);
 assert.match(upload.path,/^workspace\/[0-9a-f-]{36}\.jpg$/);
 assert.equal(run('bundle.name'),'save_product_bundle_v5');
 assert.equal(run('bundle.args.p_photo_path'),upload.path);
 assert.equal(run('"p_photo_data" in bundle.args'),false);
 assert.equal(run('S.product.photo_data'),null);
 assert.equal(run('S.product.saved_photo_path'),upload.path);
 assert.equal(run('objects.has("workspace/old.jpg")'),false);
 assert.equal(run('q(".product-photo").getAttribute("src")'),PHOTO);

 // A failed save removes the object it just uploaded and keeps the photo in the draft.
 run(`supabase.rpc=async()=>({error:{message:'Offline'}});S.product.photo_data='${PHOTO}';S.dirty=true;render();saveProduct()`);
 for(let i=0;i<6;i++)await flush();
 assert.equal(run('objects.size'),1);
 assert.equal(run('S.product.photo_data'),PHOTO);
 assert.match(run('S.err'),/Offline/);

 // Removing the photo saves a null path; shared objects survive while another product uses them.
 run(`supabase.rpc=async(name,args)=>{window.bundle={name,args};db.products[0].photo_path=args.p_photo_path;return{data:'a',error:null}};db.products[1].photo_path=S.product.saved_photo_path;S.err='';render();q('#removePhoto').click();saveProduct()`);
 for(let i=0;i<6;i++)await flush();
 assert.equal(run('bundle.args.p_photo_path'),null);
 assert.equal(run('objects.size'),1);
 dom.window.close();

 // Legacy inline photos still display and are moved to Storage by editors in the background.
 dom=boot();run=s=>dom.window.run(s);run(mock);
 run(`db.products=[{id:'l',workspace_id:'workspace',name:'Antiguo',quantity:1,target_margin:.4,status:'active',photo_data:'${PHOTO}',photo_path:null}];loadProducts()`);
 for(let i=0;i<6;i++)await flush();
 assert.equal(run('db.products[0].photo_data'),null);
 assert.match(run('db.products[0].photo_path'),/^workspace\/[0-9a-f-]{36}\.jpg$/);
 run('S.mode="dashboard";render()');
 assert.equal(run('q(".product-thumb").getAttribute("src")'),PHOTO);
 run(`db.products[0].photo_data='${PHOTO}';db.products[0].photo_path=null;log.length=0;S.workspace.role='viewer';loadProducts()`);
 for(let i=0;i<6;i++)await flush();
 assert.equal(run('log.filter(x=>x.op==="upload").length'),0);
 assert.equal(run('S.products[0].photo_data'),PHOTO);
 dom.window.close();

 // Scenarios stay ordered at extreme margins; products without cost sort last by margin.
 dom=boot();run=s=>dom.window.run(s);
 for(const m of [.1,.4,.9]){
  run(`newProduct();q('#margin').value=${m*100};refresh()`);
  const margins=run('JSON.stringify(qa("#sc .scenario .small.muted").map(x=>parseInt(x.textContent.replace(/\\D/g,""))))');
  const values=JSON.parse(margins);
  assert.deepEqual([...values].sort((a,b)=>a-b),values,'margin '+m+': '+margins);
 }
 run(`S.summaries=new Map([['x',{total_cost:1000}],['y',{total_cost:500}]]);S.sort='margin';window.sorted=[{id:'z',name:'Z',quantity:1,target_margin:.4},{id:'x',name:'X',quantity:1,target_margin:.4},{id:'y',name:'Y',quantity:1,target_margin:.4,sale_price:5000,iva_enabled:false}].sort(compareProducts).map(p=>p.id).join()`);
 assert.equal(run('sorted'),'y,x,z');

 // Drafts are written after a pause instead of on every keystroke.
 run(`localStorage.clear();newProduct();localStorage.clear();q('#name').value='Pausa';refresh()`);
 assert.equal(run('readDraft("new")'),null);
 await new Promise(r=>setTimeout(r,450));
 assert.equal(run('readDraft("new").product.name'),'Pausa');
 dom.window.close();
 // Quotation: neto + IVA equals the total, editable details, shared defaults and order quotes.
 dom=boot();run=s=>dom.window.run(s);
 const sums=JSON.parse(run(`JSON.stringify([1990,2490,9990,123457].map(price=>quoteTotals({price,quantity:3,ivaEnabled:true,ivaRate:.19,date:new Date(2026,9,22),validityDays:15})))`));
 for(const t of sums)assert.equal(t.net+t.iva,t.total);
 run(`window.updates=[];supabase.from=table=>({update:v=>({eq:async()=>{window.updates.push({table,v});return{error:null}}})});S.settings.quote_contact='@kultiversopop';newProduct();S.product.name='Cuadro';S.product.directCosts[0].amount=5000;render();q('[data-editor-tab=summary]').click();q('#quote').click()`);
 let sheet=run('q("#quoteSheet").textContent');
 assert.match(sheet,/COT-\d{6}-[A-Z0-9]{4}/);
 assert.match(sheet,/@kultiversopop/);assert.match(sheet,/Total a pagar/);assert.match(sheet,/Por confirmar/);
 assert(!/Costo|Utilidad|Margen|5\.000/.test(run('q("#quoteSheet").innerHTML')));
 run(`for(const[id,v]of[['quoteClient','Comercial <b>Andes</b>'],['quoteDelivery','5 días hábiles'],['quoteValidity','30']]){q('#'+id).value=v;q('#'+id).dispatchEvent(new Event('input'))}`);
 sheet=run('q("#quoteSheet").innerHTML');
 assert(sheet.includes('Comercial &lt;b&gt;Andes&lt;/b&gt;'));assert(sheet.includes('5 días hábiles'));
 run('window.print=()=>{window.printed=true};q("#printQuote").click()');
 await flush();
 assert.equal(run('window.printed'),true);
 assert.equal(run('JSON.stringify(updates[0].v)'),JSON.stringify({quote_contact:'@kultiversopop',quote_terms:'Valores en pesos chilenos. Despacho no incluido. Disponibilidad y plazo de producción sujetos a confirmación.',quote_delivery:'5 días hábiles',quote_validity_days:30}));
 run('q("#printQuote").click()');await flush();
 assert.equal(run('updates.length'),1);
 run(`q('#closeQuote').click();S.workspace.role='viewer';showQuote({folio:'PED-7',client:'Ana',name:'Pedido',description:'',photo:null,quantity:2,price:10000,ivaEnabled:true,ivaRate:.19,delivery:'Entrega estimada: 30/10/2026'})`);
 sheet=run('q("#quoteSheet").textContent');
 assert.match(sheet,/PED-7/);assert.match(sheet,/Ana/);assert.match(sheet,/30\/10\/2026/);assert.match(sheet,/\$20\.000/);
 assert.equal(run('q("#quoteRemember")'),null);
 dom.window.close();
 console.log('PASS V1.5 quotation: folio, client, validity, delivery, terms and contact; neto + IVA = total; shared defaults saved once by editors; order quotes; no internal costs.');
 console.log('PASS V1.5: Storage photos (signed URLs, upload, cleanup, failed save, removal, shared objects), legacy photo migration, viewer read-only, ordered scenarios, margin sort and debounced drafts.');
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1});
