const assert=require('node:assert/strict');
const{boot}=require('./v12.test.cjs');
// V2.4: customer files section redesign and WhatsApp link to the order's customer.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s);
 const now=Date.now(),iso=ms=>new Date(now+ms).toISOString();
 run(`S.orders=[{id:'o1',order_no:12,title:'Cuadro',customer_id:'c1',customer_name:'Camila Rojas',kind:'customer',quantity:1,unit_price:1000,status:'pending',created_at:'${iso(0)}'}];
  S.customers=[{id:'c1',name:'Camila Rojas',phone:'9 1234 5678'}];
  S.fileRequests=[
   {id:'r1',label:'Pedido 12',order_id:'o1',access_token:'a'.repeat(64),expires_at:'${iso(40*36e5)}',revoked:false,submitted_at:null,created_at:'${iso(0)}'},
   {id:'r2',label:'Retrato',access_token:'b'.repeat(64),expires_at:'${iso(10*36e5)}',revoked:false,submitted_at:'${iso(-6e4)}',reviewed_at:null,created_at:'${iso(-36e5)}'},
   {id:'r3',label:'Mascota',access_token:'c'.repeat(64),expires_at:'${iso(-36e5)}',revoked:false,submitted_at:null,created_at:'${iso(-50*36e5)}'}];
  S.mode='files';render()`);
 // Waiting links first, with time left, share and revoke; no duplicated title.
 assert.equal(run('qa("main h1").length'),0);
 assert.equal(run('qa(".file-row").length'),3);
 run(`q('[data-file-filter=waiting]').click()`);
 assert.equal(run('qa(".file-row").length'),1);
 assert.match(run('q(".file-row").textContent'),/Pedido 12PED-12 · Creado hoy.*quedan (39|40) h/);
 assert.ok(run('!!q("[data-copy-files=r1]")&&!!q("[data-revoke-files=r1]")'));
 assert.match(run('q(".page-lead").textContent'),/1 envío nuevo por revisar/);
 assert.match(run('q(".sidebar [data-app-mode=files]").textContent'),/Archivos\s*1/);
 // Received: highlighted, only "Ver archivos". Expired: no share/revoke actions.
 run(`q('[data-file-filter=received]').click()`);
 assert.ok(run('q(".file-row").classList.contains("is-new")'));
 assert.ok(run('!!q("[data-received-files=r2]")&&!q("[data-copy-files]")&&!q("[data-revoke-files]")'));
 run(`q('[data-file-filter=closed]').click()`);
 assert.match(run('q(".file-row").textContent'),/Mascota.*Vencido/);
 assert.equal(run('qa(".file-row .row-actions > button").length'),0);
 assert.ok(run('!!q(".file-row .row-menu [data-files-action=archive]")'));
 // Archived requests live in their own tab with restore.
 run(`S.fileRequests[2].archived_at='${iso(0)}';q('[data-files-tab=archived]').click()`);
 assert.match(run('q(".file-row").textContent'),/Mascota.*Archivado/);
 assert.ok(run('!!q("[data-files-action=restore]")'));
 assert.equal(run('!!q("[data-file-filter]")'),false);
 run(`q('[data-files-tab=active]').click()`);
 // Link dialog goes straight to the order customer's WhatsApp.
 run(`showFileRequestLink(S.fileRequests[0])`);
 const href=run('q("#fileRequestLinkDialog a.btn").getAttribute("href")');
 assert.match(href,/^https:\/\/wa\.me\/56912345678\?text=/);
 assert.match(decodeURIComponent(href.split('text=')[1]),/^Hola Camila, para trabajar tu pedido.*48 horas: https?:\/\/.*\/subir\.html#a{64}$/);
 assert.match(run('q("#fileRequestLinkDialog a.btn").textContent'),/Enviar a Camila/);
 run(`q('#fileRequestLinkDialog').close()`);
 // Order dialog: "Pedir fotos" next to "Cotización"; not on stock fabrication.
 run(`showOrder(S.orders[0])`);
 assert.ok(run('q(".order-head-actions #orderFiles")&&q(".order-head-actions #orderQuote")?true:false'));
 run(`q('#orderDialog').close();showOrder({...S.orders[0],id:'o2',kind:'stock'})`);
 assert.equal(run('!!q("#orderFiles")'),false);
 dom.window.close();
 console.log('PASS V2.4: customer files list by state (waiting/received/expired), new-submission highlight, contextual actions, order shortcut and WhatsApp to the order customer.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
