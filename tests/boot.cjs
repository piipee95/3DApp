// Shared test loader: the app files in index.html order, run in jsdom with Supabase stubbed.
// No request reaches the real Supabase.
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
// Load the app files in index.html order as one classic script: stub Supabase and skip the automatic start.
function strip(code,pattern,replacement){const out=code.replace(pattern,replacement);if(out===code)throw new Error('Test loader marker not found: '+pattern);return out}
const appFiles=[...fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').matchAll(/<script defer src="(js\/[^"]+)"/g)].map(m=>m[1]);
if(appFiles.length<2||!appFiles.at(-1).endsWith('-start.js'))throw new Error('Test loader: app scripts not found in index.html');
let source=appFiles.slice(0,-1).map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8').replace(/^'use strict';\n/,'')).join('\n');
source=strip(source,/const supabase\s*=\s*createClient\(SUPABASE_URL,\s*SUPABASE_KEY\);/,'const supabase = {};');
function boot(saved={}){
 const dom=new JSDOM('<div id="app"></div>',{url:'https://kultiapp.vercel.app',runScripts:'outside-only'});
 dom.window.confirm=()=>true;
 dom.window.scrollTo=()=>{};
 dom.window.structuredClone=structuredClone;
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;this.onclose?.()};
 for(const[k,v]of Object.entries(saved))dom.window.localStorage.setItem(k,v);
 dom.window.eval(source+';window.run=code=>eval(code);S.session={user:{id:"owner"}};S.workspace={id:"workspace",role:"owner"};');
 return dom;
}
module.exports={boot};
