const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
const flush=()=>new Promise(r=>setImmediate(r));
async function test(){
 // Dialog labels built from user data are escaped.
 let dom=boot(),run=s=>dom.window.run(s);
 run(`showOrderConsumption({id:'o1',order_no:1},[{resource_id:'m1',name:'<img src=x onerror=window.pwned=1>',unit:'un',quantity:1}])`);
 assert.equal(run('q("#consumeDialog img")'),null);
 assert.match(run('q("#consumeDialog label").textContent'),/<img/);
 dom.window.close();

 // Shared settings are saved only after editing them in this session.
 dom=boot();run=s=>dom.window.run(s);
 run(`window.saved=0;saveSettings=async()=>{window.saved++};supabase.rpc=async()=>({data:'p1',error:null});newProduct();q('#name').value='A';refresh();q('#save').click()`);
 await flush();
 assert.equal(run('window.saved'),0);
 run(`q('#cfgElec').value=300;q('#cfgElec').dispatchEvent(new Event('input'));q('#save').click()`);
 await flush();
 assert.equal(run('window.saved'),1);
 assert.equal(run('S.settingsDirty'),false);
 dom.window.close();

 // Drafts restore settings only when they were edited; legacy drafts keep the cloud values.
 const legacy=JSON.stringify({version:1,product:{id:null,name:'Viejo',prints:[],directCosts:[],additionalCosts:[]},settings:{electricity_rate_clp_kwh:1}});
 dom=boot({'kultiapp:draft:v1:owner:workspace:new':legacy});run=s=>dom.window.run(s);
 run('S.settings.electricity_rate_clp_kwh=236;restoreDraft("new")');
 assert.equal(run('S.settings.electricity_rate_clp_kwh'),236);
 assert.equal(run('S.settingsDirty'),false);
 run(`S.mode='product';render();q('#cfgElec').value=300;q('#cfgElec').dispatchEvent(new Event('input'));S.settings.electricity_rate_clp_kwh=236;S.settingsDirty=false;restoreDraft("new")`);
 assert.equal(run('S.settings.electricity_rate_clp_kwh'),300);
 assert.equal(run('S.settingsDirty'),true);
 dom.window.close();

 // Invite links are accepted for users who already have a session.
 dom=boot();run=s=>dom.window.run(s);
 run(`history.replaceState({},'','/?invite=tok123');window.rpcs=[];loadSettings=loadResources=loadProducts=async()=>{};
  supabase.auth={getSession:async()=>({data:{session:{user:{id:'owner'}}}}),onAuthStateChange:()=>{}};
  supabase.rpc=async(name,args)=>{window.rpcs.push({name,args});return{error:null}};
  supabase.from=()=>({select:()=>({order:async()=>({data:[{workspace_id:'w2',role:'editor',workspaces:{name:'Socio'}}],error:null})})});
  init()`);
 await flush();await flush();
 assert.equal(run('JSON.stringify(window.rpcs)'),JSON.stringify([{name:'accept_workspace_invite',args:{invite_token:'tok123'}}]));
 assert.equal(run('location.search'),'');
 assert.equal(run('S.workspace.id'),'w2');
 // A failed invite is reported instead of silently discarded.
 run(`history.replaceState({},'','/?invite=bad');supabase.rpc=async()=>({error:{message:'Invitación vencida'}});S.workspace=null;init()`);
 await flush();await flush();
 assert.match(run('S.err'),/Invitación vencida/);
 assert.equal(run('localStorage.getItem("kultiapp_invite")'),null);
 dom.window.close();
 console.log('PASS fixes: escaped dialog labels, settings saved only when edited, legacy drafts keep cloud settings, invites with active session and invite errors.');
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1});
