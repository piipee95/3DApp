const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const{boot}=require('./boot.cjs');
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
 // Text colors must remain readable on all four working surfaces in both themes.
 const tokens=block=>Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[\da-f]{6});/gi)].map(m=>[m[1],m[2]]));
 const dark=tokens(css.match(/:root \{([^}]*)\}/)[1]),lightTokens={...dark,...tokens(light)};
 const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255)
   .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4)
   .reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>{const [lo,hi]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return(hi+.05)/(lo+.05)};
 for(const [name,palette]of Object.entries({dark,light:lightTokens})){
   for(const fg of ['--text','--muted','--faint','--label','--cyan','--yellow','--green','--red'])
     for(const bg of ['--bg','--surface','--raised','--field'])
       assert.ok(contrast(palette[fg],palette[bg])>=4.5,`${name} ${fg} on ${bg}`);
   for(const bg of ['--action','--action-h'])assert.ok(contrast('#ffffff',palette[bg])>=4.5,`${name} white on ${bg}`);
 }
 const automatic=tokens(css.match(/:root:not\(\[data-theme='dark'\]\) \{([^}]*)\}/)[1]);
 for(const [key,value]of Object.entries(tokens(light)))assert.equal(automatic[key],value,`automatic light ${key}`);
 assert.match(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),/<script>[\s\S]*kultiapp_theme[\s\S]*<\/script>\s*<\/head>/);
 dom.window.close();
 console.log('PASS temas: selección y persistencia, automático coherente, arranque sin destello y contraste de texto/botones en ambas paletas.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
