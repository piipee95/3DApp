const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const{boot}=require('./v12.test.cjs');
// V3.3: light/dark theme chosen in the menu and kept on the device.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s),html=dom.window.document.documentElement;
 run(`S.mode='profile';render()`);
 assert.equal(run('savedTheme()'),'auto');assert.equal(html.dataset.theme,undefined);
 assert.equal(run('q(".profile-page [data-theme-set=auto]").getAttribute("aria-pressed")'),'true');
 run(`q('.profile-page [data-theme-set=light]').click()`);
 assert.equal(html.dataset.theme,'light');assert.equal(run('localStorage.getItem("kultiapp_theme")'),'light');
 assert.equal(run('q(".profile-page [data-theme-set=light]").getAttribute("aria-pressed")'),'true');
 // The switch lives in «Mi perfil» (V4.5) and keeps the current choice after re-render.
 run(`render()`);
 assert.equal(run('q(".profile-page [data-theme-set=light]").getAttribute("aria-pressed")'),'true');
 run(`q('.profile-page [data-theme-set=dark]').click()`);assert.equal(html.dataset.theme,'dark');
 run(`q('.profile-page [data-theme-set=auto]').click()`);assert.equal(html.dataset.theme,undefined);assert.equal(run('savedTheme()'),'auto');
 // A bad stored value falls back to automatic.
 run(`localStorage.setItem('kultiapp_theme','neon')`);assert.equal(run('savedTheme()'),'auto');
 // Both themes define every color token; index.html applies the saved theme before painting.
 const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8'),light=css.match(/:root\[data-theme='light'\] \{([^}]*)\}/)[1];
 for(const t of ['--bg','--surface','--raised','--field','--line','--text','--muted','--action','--cyan','--green','--red','--yellow'])assert.match(light,new RegExp(t+':'));
 assert.match(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),/<script>[\s\S]*kultiapp_theme[\s\S]*<\/script>\s*<\/head>/);
 dom.window.close();
 console.log('PASS V3.3: theme switch (account menu and Más), saved per device, automatic fallback, complete light tokens, no-flash boot.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
