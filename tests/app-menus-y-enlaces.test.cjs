const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=10)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.5: menus without what moved to «Mi perfil»; each section with its own link.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`S.session={user:{id:'u',email:'f@k.cl',user_metadata:{}}};S.workspace={id:'w',role:'editor',name:'Kultiverso Pop'};S.mode='home';render()`);
 // Settings has device appearance; the sidebar opens the profile directly.
 assert.equal(run('[...qa("#accountMenu .menu-item")].map(b=>b.textContent).join("|")'),'Cerrar sesión');
 assert.equal(run('q("#accountButton").getAttribute("aria-label")'),'Mi perfil');
 assert.equal(run('!!q("#accountMenu .theme-switch")'),true);
 run('showMoreSheet()');
 const more=run('[...qa("#moreSheet .menu-item")].map(b=>b.textContent).join("|")');
 assert.doesNotMatch(more,/Mi perfil|contraseña|Cerrar sesión|Respaldo/);assert.equal(run('!!q("#moreSheet .theme-switch")'),false);
 run(`q('#moreSheet').close()`);
 // Links: the first screen replaces, moving adds history.
 assert.equal(run('location.hash'),'#inicio');
 run(`S.mode='production';render()`);assert.equal(run('location.hash'),'#pedidos');
 run(`S.mode='profile';render()`);assert.equal(run('location.hash'),'#perfil');
 assert.deepEqual(JSON.parse(run('JSON.stringify(viewFromHash())')),{mode:'profile'});
 run(`location.hash='#producto/0f0e0d0c-0b0a-4908-8706-050403020100'`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(viewFromHash())')),{mode:'product',product:'0f0e0d0c-0b0a-4908-8706-050403020100'});
 run(`location.hash='#producto/nope'`);assert.equal(run('viewFromHash()'),null);
 // Back button: popstate goes to the section in the link.
 run(`window.went=[];goMode=async m=>went.push(m);history.replaceState(null,'','#finanzas');dispatchEvent(new PopStateEvent('popstate'))`);
 assert.deepEqual(JSON.parse(run('JSON.stringify(went)')),['finance']);
 // Supabase login links in the hash are not overwritten.
 run(`history.replaceState(null,'','#access_token=x&type=recovery');S.mode='inventory';saveView()`);
 assert.equal(run('location.hash'),'#access_token=x&type=recovery');
 // Opening a link restores that section.
 run(`history.replaceState(null,'','#clientes');S.mode='home';loadQuotes=loadCustomers=async()=>{}`);assert.equal(await dom.window.eval('restoreView()'),true);
 assert.equal(run('S.mode'),'customers');
 dom.window.close();
 console.log('PASS V4.5: settings dropdown and direct profile; section links (#pedidos…), back button, login hashes kept, link restore.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
