const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=10)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// V4.4: «Mi perfil» page: personal data, username, WhatsApp, email, password, photo and session.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 run(`S.session={user:{id:'u',email:'felipe@kultiversopop.cl',created_at:'2026-01-10T12:00:00Z',last_sign_in_at:'2026-10-24T12:00:00Z',user_metadata:{name:'Felipe'}}};
  window.calls=[];supabase.auth={updateUser:async v=>{calls.push(v);const u=S.session.user;return{data:{user:{...u,user_metadata:{...u.user_metadata,...(v.data||{})}}},error:null}},signOut:async()=>{calls.push('out')}};
  checkNewPassword=async pw=>pw.length<10?'corta':'';S.mode='home';render()`);
 // Reached from the account menu and from the Más sheet (tapping your name too).
 run(`q('#editProfile').click()`);await flush();
 assert.equal(run('S.mode'),'profile');assert.match(run('q(".page-title").textContent'),/Mi perfil/);
 assert.match(run('q(".profile-id").textContent'),/Felipe.*felipe@kultiversopop\.cl/);
 assert.match(run('q(".profile-facts").textContent'),/Último ingreso24 de octubre de 2026.*Versiónv4\.9/);
 // Personal data: invalid username / phone are rejected, valid ones saved to the metadata.
 run(`q('#profileUsername').value='Fe';q('#profileForm').requestSubmit()`);await flush();
 assert.match(run('q("#profileFeedback").textContent'),/3 a 30/);assert.equal(run('calls.length'),0);
 run(`q('#profileUsername').value='@Felipe.Pino';q('#profilePhone').value='12';q('#profileForm').requestSubmit()`);await flush();
 assert.match(run('q("#profileFeedback").textContent'),/código de país/);
 run(`q('#profileName').value='Felipe Pino';q('#profilePhone').value='+56 9 4840 6731';q('#profileForm').requestSubmit()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(calls[0])')),{data:{name:'Felipe Pino',username:'felipe.pino',phone:'+56 9 4840 6731'}});
 assert.match(run('q(".profile-id").textContent'),/Felipe Pino@felipe\.pino · felipe@/);assert.equal(run('userInitials()'),'FP');
 // Email: same email is refused; a new one asks Supabase and shows the pending change.
 run(`q('#emailForm').requestSubmit()`);await flush();assert.match(run('q("#emailFeedback").textContent'),/Ese ya es/);
 run(`q('#profileEmail').value='nuevo@kultiversopop.cl';q('#emailForm').requestSubmit()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(calls[1])')),{email:'nuevo@kultiversopop.cl'});
 assert.match(run('q("#emailForm .notice").textContent'),/pendiente a nuevo@kultiversopop\.cl/);
 // Password: must match and pass the policy.
 run(`q('#profileNewPassword').value='abcdefgh12';q('#profileRepeatPassword').value='x';q('#profilePasswordForm').requestSubmit()`);await flush();
 assert.match(run('q("#profilePasswordFeedback").textContent'),/no coinciden/);
 run(`q('#profileRepeatPassword').value='abcdefgh12';q('#profilePasswordForm').requestSubmit()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(calls[2])')),{password:'abcdefgh12'});assert.equal(run('q("#profileNewPassword").value'),'');
 // Photo: the avatar shows the photo everywhere once its URL is known; removing it goes back to initials.
 run(`S.session.user.user_metadata.avatar_path='w/a.jpg';S.photoUrls.set('w/a.jpg',{url:'data:image/jpeg;base64,AA==',exp:Date.now()+1e6});render()`);
 assert.equal(run('qa(".avatar.has-photo img").length>=2'),true);
 run(`q('#avatarRemove').click()`);await flush();
 assert.equal(run('calls[3].data.avatar_path'),null);assert.equal(run('!!q(".avatar.has-photo")'),false);
 // Reload returns to the page; logout from it.
 assert.equal(run('VIEW_MODES.includes("profile")'),true);
 run(`q('#profileLogout').click()`);assert.equal(run('calls.at(-1)'),'out');
 // Más sheet: your name opens the profile.
 run(`S.mode='home';render();showMoreSheet();q('.sheet-user').click()`);await flush();assert.equal(run('S.mode'),'profile');
 dom.window.close();
 console.log('PASS V4.4: profile page (data, username, WhatsApp, email, password, photo, session).');
}
test().catch(e=>{console.error(e);process.exitCode=1});
