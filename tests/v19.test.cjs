const assert=require('node:assert/strict');
const fs=require('node:fs');
const{boot}=require('./v12.test.cjs');
const flush=async(k=4)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V1.9: global search and installable app.
async function test(){
 let dom=boot(),run=s=>dom.window.run(s);
 run(`S.products=[{id:'p1',name:'Cuadro Iron Man',description:'Marvel',quantity:1,status:'active'},{id:'p2',name:'Lámpara Luna',quantity:1,status:'archived'}];
  S.summaries=new Map();
  S.quotes=[{id:'q1',quote_no:7,title:'Cuadro Iron Man',client_name:'Comercial Andes',quantity:2,unit_price:19990,iva_enabled:true,iva_rate:.19,unit_cost:9000,validity_days:15,status:'sent',created_at:new Date().toISOString()}];
  S.orders=[{id:'o1',order_no:41,title:'Llavero',customer_name:'Ánimas Store',quantity:3,unit_price:900,status:'printing',created_at:new Date().toISOString()}];
  S.customers=[{id:'c1',name:'Comercial Andes',phone:'+56 9 1111 2222',instagram:'',email:''}];
  S.resources=[{id:'f1',kind:'filament',name:'PLA Negro',material:'Elegoo',unit:'g',stock_qty:900,reserved_qty:100,counted:true,active:true},{id:'pr1',kind:'printer',name:'Kobra 3',power_kw:.4,active:true}];
  S.mode='home';render()`);
 // Accent- and case-insensitive, every word must match.
 assert.equal(run(`searchMatches('Lámpara Luna','lampara')`),true);
 assert.equal(run(`searchMatches('Cuadro Iron Man','iron cuadro')`),true);
 assert.equal(run(`searchMatches('Cuadro Iron Man','iron hulk')`),false);
 // Ctrl+K opens the search; empty term shows sections and actions.
 run(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}))`);
 assert.ok(run('!!q("#searchDialog")'));
 assert.match(run('q("#searchResults").textContent'),/Ir a.*Cotizaciones.*Clientes.*Acciones.*Nuevo producto/);
 const groups=t=>JSON.parse(run(`JSON.stringify(searchResults(${JSON.stringify(t)}).map(g=>[g.label,g.items.map(i=>i.title)]))`));
 assert.deepEqual(groups('iron'),[['Productos',['Cuadro Iron Man']],['Cotizaciones',['COT-0007 · Cuadro Iron Man']]]);
 assert.deepEqual(groups('andes'),[['Cotizaciones',['COT-0007 · Cuadro Iron Man']],['Clientes',['Comercial Andes']]]);
 assert.deepEqual(groups('ped-41'),[['Pedidos',['PED-41 · Llavero']]]);
 assert.deepEqual(groups('animas'),[['Pedidos',['PED-41 · Llavero']]]);
 assert.deepEqual(groups('elegoo'),[['Inventario',['PLA Negro']]]);
 assert.deepEqual(groups('kobra'),[['Inventario',['Kobra 3']]]);
 assert.match(run(`searchResults('negro')[0].items[0].sub`),/800 g disponibles/);
 assert.match(run(`searchResults('luna')[0].items[0].sub`),/Archivado/);
 // Typing filters, arrows move the selection and Enter opens it.
 run(`window.went=[];goMode=async m=>{went.push(m);S.mode=m};showSavedQuote=qt=>went.push('quote:'+qt.id);openProduct=id=>went.push('product:'+id);
  const i=q('#globalSearchInput');i.value='iron';i.dispatchEvent(new Event('input'))`);
 assert.equal(run('qa(".search-item").length'),2);
 assert.ok(run('q("[data-search-index=\\"0\\"]").classList.contains("on")'));
 run(`q('#globalSearchInput').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`);
 assert.ok(run('q("[data-search-index=\\"1\\"]").classList.contains("on")'));
 run(`q('#globalSearchInput').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(went)')),['quotes','quote:q1']);
 assert.equal(run('!!q("#searchDialog")'),false);
 run(`showSearch();q('#globalSearchInput').value='zzzz';q('#globalSearchInput').dispatchEvent(new Event('input'))`);
 assert.match(run('q("#searchResults").textContent'),/Sin resultados/);
 run(`q('#searchDialog').close()`);
 // "/" opens it too, but not while typing in a field or with another dialog open.
 run(`render();const f=document.createElement('input');document.body.append(f);f.dispatchEvent(new KeyboardEvent('keydown',{key:'/',bubbles:true}))`);
 assert.equal(run('!!q("#searchDialog")'),false);
 run(`document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'/',bubbles:true}))`);
 assert.ok(run('!!q("#searchDialog")'));
 run(`q('#searchDialog').close();showCustomer({});document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true}))`);
 assert.equal(run('!!q("#searchDialog")'),false);
 run(`q('#customerDialog').close()`);
 // Search buttons in the sidebar and page header.
 run(`S.mode='home';render()`);
 assert.ok(run('!!q(".sidebar .side-search")'));
 assert.ok(run('!!q(".page-top .header-search")'));
 run(`q('.page-top .header-search').click()`);
 assert.ok(run('!!q("#searchDialog")'));
 run(`q('#searchDialog').close()`);
 // Install: offered when the browser allows it, hidden otherwise.
 assert.equal(run('!!q("#installApp")'),false);
 run(`window.prompted=0;const e=new Event('beforeinstallprompt');e.prompt=()=>prompted++;e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)`);
 assert.ok(run('!!q("#installApp")'));
 run(`q('#installApp').click()`);await flush();
 assert.equal(run('prompted'),1);
 assert.equal(run('!!q("#installApp")'),false);
 // Home-screen shortcuts open their section once.
 run(`history.replaceState({},'','?view=production');S.mode='home';window.r=null;restoreView().then(v=>r=v)`);await flush();
 assert.equal(run('r'),true);assert.equal(run('S.mode'),'production');assert.equal(run('location.search'),'');
 dom.window.close();
 // Manifest and service worker.
 const manifest=JSON.parse(fs.readFileSync(__dirname+'/../manifest.webmanifest','utf8'));
 assert.ok(manifest.icons.some(i=>i.purpose==='maskable'&&fs.existsSync(__dirname+'/../'+i.src)));
 assert.deepEqual(manifest.shortcuts.map(s=>s.url),['./?view=quotes','./?view=production','./?view=inventory']);
 const sw=fs.readFileSync(__dirname+'/../sw.js','utf8');
 for(const f of ['index.html','styles.css','manifest.webmanifest','js/supabase-client.js','js/01-core.js','js/99-start.js'])assert.ok(sw.includes("'"+f+"'"),f);
 assert.ok(!/supabase\.co/.test(sw.replace(/^\/\/.*$/gm,'')),'never caches Supabase');
 assert.match(fs.readFileSync(__dirname+'/../js/10-search-install.js','utf8'),/serviceWorker\.register\('sw\.js'\)/);
 console.log('PASS V1.9: global search (accents, multi-word, all sections, keyboard, shortcuts), install prompt, home-screen shortcuts, manifest and service worker.');
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1});
