const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const{JSDOM}=require('jsdom');
const{boot}=require('./boot.cjs');
const flush=async(k=6)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
const publicPage=(file,url,body,client)=>{
 const dom=new JSDOM(body,{url,runScripts:'outside-only'});dom.window.mockClient=client;
 dom.window.eval(fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/^import[^\n]+\n/,'').replace(/^const client\s*=\s*createClient\([\s\S]*?\}\s*\}\s*\);?\n/m,'const client=window.mockClient;\n'));
 return dom};
// V3.2: order tracking links, public catalog and visible app version.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 // The version shown in the menu matches the service worker cache.
 const cache=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8').match(/kultiapp-v(\d)(\d+)(?:-(\d+))?'/);
 assert.equal(run('APP_VERSION'),'v'+cache[1]+'.'+cache[2]+(cache[3]?'.'+cache[3]:''));
 run(`S.mode='home';render()`);assert.equal(run('q(".page-head .app-version, .app-version").textContent'),run('APP_VERSION'));
 // Tracking: create the private link from the order, share it and revoke it.
 run(`window.rpcs=[];supabase.rpc=async(name,args)=>{rpcs.push([name,args]);return{data:args.p_action==='create'?'b'.repeat(64):null,error:null}};
  S.customers=[{id:'c1',name:'Ana Pérez',phone:'+56 9 1234 5678'}];
  S.orders=[{id:'o1',order_no:21,title:'Cuadro Luna',customer_name:'Ana Pérez',customer_id:'c1',kind:'customer',quantity:1,unit_price:20000,iva_enabled:true,iva_rate:.19,estimated_cost:0,status:'printing',inventory_state:'none',created_at:new Date().toISOString()}];
  loadOrders=async()=>{};loadResources=async()=>{};S.mode='production';render();showOrder(S.orders[0])`);await flush();
 run(`q('#orderTracking').click()`);
 assert.match(run('q("#trackingDialog").textContent'),/Crear enlace de seguimiento/);
 run(`q('#createTracking').click()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['order_tracking_link',{p_order:'o1',p_action:'create'}]]);
 assert.equal(run('q("#trackingLink").value'),dom.window.location.origin+'/seguimiento.html#'+'b'.repeat(64));
 const wa=run('q("#trackingDialog a[href*=\'wa.me\']").href');
 assert.match(wa,/^https:\/\/wa\.me\/56912345678\?text=/);assert.match(decodeURIComponent(wa),/Hola Ana, aquí puedes ver el avance de tu pedido PED-21 \(Cuadro Luna\): .*seguimiento\.html#b{64}$/);
 run(`rpcs.length=0;q('#revokeTracking').click()`);await flush();run(`q('#confirmDialog [data-confirm]').click()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(rpcs)')),[['order_tracking_link',{p_order:'o1',p_action:'revoke'}]]);
 assert.equal(run('S.orders[0].tracking_token'),null);assert.ok(run('!!q("#createTracking")'));
 run(`q('#trackingDialog').close()`);
 // Stock orders have no tracking button.
 run(`showOrder({...S.orders[0],kind:'stock'})`);await flush();assert.equal(run('!!q("#orderTracking")'),false);
 // Catalog settings: slug, WhatsApp digits, intro, and only changed products are written.
 run(`window.writes=[];supabase.from=table=>{let value,eqs=[];const q={update(v){value=v;return q},eq(k,v){eqs.push([k,v]);return q},then(a,b){writes.push({table,value,eqs});return Promise.resolve({error:null}).then(a,b)}};return q};
  S.workspace.name='Kultiverso Pop';S.settings.catalog_slug=null;
  S.products=[{id:'p1',name:'Cuadro Iron Man',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,target_margin:.4,round_to:1000,sale_price:24990,stock_qty:2,stock_reserved:0},
   {id:'p2',name:'Llavero',quantity:1,status:'active',iva_enabled:true,iva_rate:.19,target_margin:.4,round_to:100,stock_qty:0,stock_reserved:0},
   {id:'p3',name:'Viejo',quantity:1,status:'archived'}];S.summaries=new Map();
  S.mode='dashboard';render();q('#catalogBtn').click()`);
 assert.equal(run('q("#catSlug").value'),'kultiverso-pop');
 assert.equal(run('qa(".catalog-pick-row").length'),2);
 assert.match(run('q(".catalog-pick").textContent'),/Cuadro Iron Man.*En stock.*Llavero.*Por encargo/);
 assert.equal(run('qa(".catPrice")[0].value'),'24990');
 run(`q('#catWhatsapp').value='+56 9 4840 6731';q('#catIntro').value='Figuras 3D';qa('.catOn')[0].checked=true;q('#catalogForm').requestSubmit()`);await flush();
 const w=JSON.parse(run('JSON.stringify(writes)'));
 assert.equal(w.length,2);
 assert.deepEqual(w[0].value,{catalog_slug:'kultiverso-pop',catalog_whatsapp:'56948406731',catalog_intro:'Figuras 3D'});
 assert.deepEqual(w[1],{table:'products',value:{catalog_visible:true,catalog_price:24990},eqs:[['id','p1']]});
 assert.equal(run('q("#catalogLink").value'),dom.window.location.origin+'/catalogo.html?c=kultiverso-pop');
 // Bad WhatsApp is rejected before writing; a taken slug shows a clear message.
 run(`writes.length=0;q('#catWhatsapp').value='123';q('#catalogForm').requestSubmit()`);await flush();
 assert.match(run('q("#catalogFeedback").textContent'),/WhatsApp válido/);assert.equal(run('writes.length'),0);
 run(`supabase.from=()=>{const q={update(){return q},eq(){return q},then(a,b){return Promise.resolve({error:{code:'23505',message:'duplicate'}}).then(a,b)}};return q};q('#catWhatsapp').value='56948406731';q('#catalogForm').requestSubmit()`);await flush();
 assert.match(run('q("#catalogFeedback").textContent'),/ya está en uso/);
 run(`q('#catalogDialog').close()`);
 // Viewers can't create links or edit the catalog.
 run(`S.workspace.role='viewer';showCatalog()`);
 assert.equal(run('!!q("#catalogForm button[type=submit]")'),false);assert.ok(run('q("#catSlug").disabled'));
 run(`q('#catalogDialog').close();showOrder(S.orders[0])`);await flush();assert.equal(run('!!q("#orderTracking")'),false);
 dom.window.close();
 // Public tracking page: steps, money, photos and WhatsApp; never shows costs.
 const track=publicPage('seguimiento.js','https://kultiapp.vercel.app/seguimiento.html#'+'c'.repeat(64),'<section id="tracking"></section>',{
  rpc:async(name,args)=>{assert.equal(name,'order_tracking');assert.equal(args.p_token,'c'.repeat(64));return{data:{business:'Kultiverso Pop',contact:'@kultiversopop',whatsapp:'56948406731',order_no:21,title:'Cuadro <Luna>',quantity:1,status:'assembly',due_date:'2026-11-05',created_at:'2026-10-20T12:00:00Z',updated_at:'2026-10-23T12:00:00Z',total:20000,paid:10000,balance:10000,photos_folder:'w/orders/o1'},error:null}},
  storage:{from:()=>({list:async()=>({data:[{name:'a.jpg'}],error:null}),createSignedUrls:async p=>({data:p.map(x=>({signedUrl:'https://s/'+x})),error:null})})}});
 await flush();
 const t=track.window.document;
 assert.equal(t.querySelector('h1').textContent,'Cuadro <Luna>');
 assert.equal(t.querySelectorAll('.track-steps li.done').length,2);assert.match(t.querySelector('.track-steps li.now').textContent,/Terminaciones/);
 assert.match(t.querySelector('.track-due').textContent,/5 de noviembre/);
 assert.match(t.querySelector('.track-money').textContent,/Total\$20\.000Pagado\$10\.000Saldo\$10\.000/);
 assert.equal(t.querySelector('.order-photos img').getAttribute('src'),'https://s/w/orders/o1/a.jpg');
 assert.match(decodeURIComponent(t.querySelector('.track-wa').href),/wa\.me\/56948406731\?text=Hola, te escribo por mi pedido PED-21/);
 assert.doesNotMatch(t.body.textContent,/costo|utilidad/i);
 track.window.close();
 // Bad or revoked token: friendly message.
 const bad=publicPage('seguimiento.js','https://kultiapp.vercel.app/seguimiento.html#nope','<section id="tracking"></section>',{rpc:async()=>{throw new Error('no')}});
 await flush();assert.match(bad.window.document.body.textContent,/Enlace no disponible/);bad.window.close();
 // Public catalog: cards, prices, availability and «Lo quiero» on WhatsApp.
 const cat=publicPage('catalogo.js','https://kultiapp.vercel.app/catalogo.html?c=kultiverso-pop','<div id="catalogIntro"></div><section id="catalog"></section>',{
  rpc:async(name,args)=>{assert.equal(name,'public_catalog');assert.equal(args.p_slug,'kultiverso-pop');return{data:{business:'Kultiverso Pop',intro:'Figuras 3D',whatsapp:'56948406731',items:[{id:'p1',name:'Cuadro Iron Man',description:'Marco negro',price:24990,in_stock:true,photo_path:'w/p1.jpg'},{id:'p2',name:'Llavero',description:null,price:null,in_stock:false,photo_path:null}]},error:null}},
  storage:{from:()=>({createSignedUrls:async p=>({data:p.map(x=>({path:x,signedUrl:'https://s/'+x})),error:null})})}});
 await flush();
 const c=cat.window.document,cards=c.querySelectorAll('.catalog-card');
 assert.equal(cards.length,2);assert.equal(c.querySelector('#catalogIntro h1').textContent,'Kultiverso Pop');
 assert.equal(cards[0].querySelector('img').getAttribute('src'),'https://s/w/p1.jpg');
 assert.match(cards[0].textContent,/\$24\.990Disponible/);assert.match(cards[1].textContent,/Precio a consultarPor encargo/);
 assert.match(decodeURIComponent(cards[0].querySelector('a').href),/wa\.me\/56948406731\?text=Hola, me interesa «Cuadro Iron Man» \(\$24\.990\) del catálogo\./);
 cat.window.close();
 console.log('PASS V3.2: version in sync with cache, tracking link create/share/revoke, catalog settings (slug, WhatsApp, changed products only, duplicate slug), viewer limits, public tracking and catalog pages.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
