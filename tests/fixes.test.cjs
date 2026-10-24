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
 run(`S.mode='product';render();q('#cfgElec').value=300;q('#cfgElec').dispatchEvent(new Event('input'));persistDraft(false);S.settings.electricity_rate_clp_kwh=236;S.settingsDirty=false;restoreDraft("new")`);
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
 // Editing a printer only sends columns granted for update (workspace_id and kind are insert-only).
 dom=boot();run=s=>dom.window.run(s);
 run(`window.calls=[];supabase.from=table=>{const call={table};window.calls.push(call);const query={update(v){call.op='update';call.value=v;return query},insert(v){call.op='insert';call.value=v;return query},eq(){return query},select(){return query},order(){return query},single:async()=>({data:{id:'r9'},error:null}),then(ok){return Promise.resolve({data:[],error:null}).then(ok)}};return query};
  S.resources=[{id:'p1',kind:'printer',name:'Anycubic Cobra X',power_kw:1.75,active:true}];showResourceForm(S.resources[0]);q('#resourcePower').value='1.3';q('#resourceForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
 await flush();await flush();
 const edit=JSON.parse(run('JSON.stringify(calls.find(c=>c.op==="update"))'));
 assert.deepEqual(Object.keys(edit.value).sort(),['active','maintenance_every_hours','name','power_kw']);
 assert.equal(edit.value.power_kw,1.3);
 run(`calls.length=0;showResourceForm({kind:'printer',active:true});q('#resourceName').value='Bambu A1';q('#resourcePower').value='0.35';q('#resourceForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
 await flush();await flush();
 const add=JSON.parse(run('JSON.stringify(calls.find(c=>c.op==="insert"))'));
 assert.equal(add.value.workspace_id,'workspace');assert.equal(add.value.kind,'printer');
 dom.window.close();
 console.log('PASS fixes: printer edits send only updatable columns;');
 // Password policy: length and letters+digits, HIBP k-anonymity check (only the 5-char prefix is sent), fail-open.
 dom=boot();run=s=>dom.window.run(s);
 if(!dom.window.crypto.subtle)Object.defineProperty(dom.window.crypto,'subtle',{value:require('node:crypto').webcrypto.subtle});
 dom.window.TextEncoder=TextEncoder;
 assert.match(run('passwordProblem("abc12")'),/al menos 10/);
 assert.match(run('passwordProblem("solamenteletras")'),/letras y números/);
 assert.equal(run('passwordProblem("kultiverso2026")'),'');
 // SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8, the documented HIBP example.
 run(`window.urls=[];window.fetch=async url=>{urls.push(url);return{ok:true,text:async()=>'0018A45C4D1DEF81644B54AB7F969B88D65:1\\r\\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:9659365\\r\\n'}}`);
 assert.equal(await run('pwnedCount("password")'),9659365);
 assert.deepEqual(JSON.parse(run('JSON.stringify(urls)')),['https://api.pwnedpasswords.com/range/5BAA6']);
 const leaked=require('node:crypto').createHash('sha1').update('kultiverso2026').digest('hex').toUpperCase();
 run(`window.fetch=async url=>({ok:true,text:async()=>url.endsWith('${leaked.slice(0,5)}')?'${leaked.slice(5)}:42':''})`);
 assert.match(await run('checkNewPassword("kultiverso2026")'),/filtraciones/);
 assert.equal(await run('checkNewPassword("kultiverso2027")'),'');
 run(`window.fetch=async()=>{throw new Error('offline')}`);
 assert.equal(await run('checkNewPassword("kultiverso2026")'),'');
 // Sign-up is blocked before reaching Supabase when the password is weak or leaked.
 run(`window.signups=[];supabase.auth={signUp:async a=>{signups.push(a);return{error:null}},signInWithPassword:async()=>({error:null})};S.session=null;render();q('[data-mode=signup]').click()`);
 assert.equal(run('q("#password").minLength'),10);assert.equal(run('q("#passwordHint").hidden'),false);
 run(`q('#email').value='a@b.cl';q('#password').value='corta1';q('#authForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
 await flush();
 assert.equal(run('signups.length'),0);assert.match(run('S.err'),/al menos 10/);
 run(`window.fetch=async()=>({ok:true,text:async()=>'1E4C9B93F3F0682250B6CF8331B7EE68FD8:3'})`);
 // Make the leaked hash match whatever password is typed by stubbing the count.
 run(`pwnedCount=async()=>3;S.err='';render();q('[data-mode=signup]').click();q('#email').value='a@b.cl';q('#password').value='kultiverso2026';q('#authForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
 await flush();await flush();
 assert.equal(run('signups.length'),0);assert.match(run('S.err'),/filtraciones/);
 run(`pwnedCount=async()=>0;S.err='';render();q('[data-mode=signup]').click();q('#email').value='a@b.cl';q('#password').value='kultiverso2026';q('#authForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
 await flush();await flush();
 assert.equal(run('signups.length'),1);
 // Changing the password from the header validates first and then calls updateUser.
 run(`window.updates=[];supabase.auth.updateUser=async a=>{updates.push(a);return{error:null}};S.session={user:{id:'owner'}};S.workspace={id:'workspace',role:'editor'};S.mode='dashboard';S.products=[];render();q('#changePassword').click();
  q('#newPassword').value='kultiverso2026';q('#repeatPassword').value='otra';q('#passwordForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
 await flush();
 assert.match(run('q("#passwordFeedback").textContent'),/no coinciden/);assert.equal(run('updates.length'),0);
 run(`q('#repeatPassword').value='kultiverso2026';q('#passwordForm').dispatchEvent(new Event('submit',{cancelable:true}))`);
 await flush();await flush();
 assert.equal(run('JSON.stringify(updates)'),JSON.stringify([{password:'kultiverso2026'}]));
 assert.equal(run('S.msg'),'Contraseña actualizada.');
 dom.window.close();
 console.log('PASS fixes: password rules, HIBP k-anonymity check (fail-open), sign-up guard and change-password dialog;');
 console.log('PASS fixes: escaped dialog labels, settings saved only when edited, legacy drafts keep cloud settings, invites with active session and invite errors.');
}
if(require.main===module)test().catch(error=>{console.error(error);process.exitCode=1});
