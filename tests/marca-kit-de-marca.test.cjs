const assert=require('node:assert/strict');
const{boot}=require('./boot.cjs');
const flush=async(k=30)=>{for(let i=0;i<k;i++)await new Promise(r=>setTimeout(r,0))};
// 5.1: «Kit de marca»: gallery, filters, safe previews, original downloads, uploads, versions,
// official/favorite, archive/restore/delete, app files import, storage limits and viewer rights.
async function test(){
 const dom=boot(),run=s=>dom.window.run(s),W='d0427950-b3be-4704-b188-a61346481e67';
 run(`window.calls=[];window.rows=[];const W='${W}';
  const mk=(id,o)=>({id,workspace_id:W,category:'other',name:id,description:'',usage:'',copy_text:'',background:null,object_path:W+'/brand/'+id+'.png',original_name:id+'.png',mime_type:'image/png',byte_size:2048,width:null,height:null,official:false,favorite:false,group_id:'g-'+id,variant_label:'',is_current:true,archived_at:null,created_at:'2026-10-20T10:00:00Z',...o});
  rows.push(mk('logo1',{category:'logos',name:'Logo principal',background:'dark',official:true,favorite:true,byte_size:1572864,width:1200,height:400,group_id:'gl',copy_text:'Kultiverso Pop · figuras y cuadros 3D',usage:'Fondos oscuros'}),
   mk('logo0',{category:'logos',name:'Logo principal',background:'dark',official:true,favorite:true,group_id:'gl',is_current:false,variant_label:'2025',created_at:'2025-01-01T10:00:00Z'}),
   mk('card',{category:'business_cards',name:'Tarjeta frente',mime_type:'application/pdf',object_path:W+'/brand/card.pdf',original_name:'tarjeta.pdf'}),
   mk('svg',{category:'labels',name:'Sticker redondo',mime_type:'image/svg+xml',object_path:W+'/brand/svg.svg',original_name:'sticker.svg'}),
   mk('pack',{category:'social',name:'Pack publicaciones',mime_type:'application/zip',object_path:W+'/brand/pack.zip',original_name:'pack.zip',archived_at:'2026-10-21T10:00:00Z'}));
  window.failInsert=false;
  supabase.from=t=>{const c={t,eq:[]};const q={select(){return q},order(){return q},single(){return q},eq(k,v){c.eq.push([k,v]);return q},in(){return q},
   update(v){c.op='update';c.v=v;return q},insert(v){c.op='insert';c.v=v;return q},delete(){c.op='delete';return q},
   then(a,b){calls.push(c);if(c.op==='insert'&&failInsert)return Promise.resolve({data:null,error:{message:'sin permiso'}}).then(a,b);
    return Promise.resolve({data:c.op==='insert'?{id:'new'+calls.length,...c.v,created_at:new Date().toISOString()}:c.op?null:rows,error:null}).then(a,b)}};return q};
  supabase.rpc=async(f,a)=>{calls.push({rpc:f,a});return{data:{kit:1576960,project:2*1048576},error:null}};
  window.storageCalls=[];supabase.storage={from:b=>({
   createSignedUrls:async(paths,ttl)=>{storageCalls.push(['urls',b,paths.length]);return{data:paths.map(p=>({path:p,signedUrl:'https://sb.test/'+p+'?t=1'})),error:null}},
   createSignedUrl:async(p,ttl,o)=>{storageCalls.push(['url',b,p,o||null]);return{data:{signedUrl:'https://sb.test/'+p+(o?'?download='+o.download:'')},error:null}},
   upload:async(p,f,o)=>{storageCalls.push(['upload',b,p,f,o]);return{error:null}},
   remove:async ps=>{storageCalls.push(['remove',b,ps]);return{error:null}}})};
  S.workspace={id:W,role:'owner',name:'Kultiverso Pop'};localStorage.removeItem('kultiapp_brand_filter');
  goMode('brand')`);await flush();
 // Section in the menu with its own link; storage limits are the real ones.
 assert.equal(run('S.mode'),'brand');assert.equal(run('location.hash'),'#marca');
 assert.ok(run('!!q(".sidebar [data-app-mode=brand]")'));
 assert.match(run('q(".brand-limits").textContent'),/Kit de marca: 1,5 MB · Todo KultiApp: 2 MB de 1 GB del plan gratuito de Supabase.*Hasta 50 MB por archivo · PNG, JPG, WebP, SVG, PDF y ZIP/);
 // One card per design (current version), favorites first, with category, format, size, dimensions and badges.
 const cards=JSON.parse(run('JSON.stringify([...qa(".brand-card")].map(c=>c.textContent))'));
 assert.equal(cards.length,3);assert.match(cards[0],/OficialFavoritoLogo principalLogotipos e isotipos · Fondo oscuroPNG · 1,5 MB · 1200×400 px · 2 versiones/);
 assert.match(run('q("[data-brand=logo1] img").getAttribute("src")'),/^https:\/\/sb\.test\/.*logo1\.png/);
 assert.match(run('q("[data-brand=card]").textContent'),/PDF/);
 // Missing items are listed (with upload buttons) and the app's official files can be added.
 assert.match(run('q(".brand-missing").textContent'),/Logo para fondo claro.*Logo transparente.*Tarjeta o carta de agradecimiento.*Foto de perfil de WhatsApp.*Íconos de la app/);
 assert.doesNotMatch(run('q(".brand-missing").textContent'),/Logo para fondo oscuro|Tarjeta de presentación|Etiqueta o sticker/);
 assert.ok(run('!!q("#brandImport")&&!!q("#brandDrop")&&!!q("#brandUpload")'));
 // Filters and search.
 run(`q('[data-brand-filter=labels]').click()`);assert.deepEqual(JSON.parse(run('JSON.stringify([...qa(".brand-card")].map(c=>c.dataset.brand))')),['svg']);
 run(`q('[data-brand-filter=archived]').click()`);assert.deepEqual(JSON.parse(run('JSON.stringify([...qa(".brand-card")].map(c=>c.dataset.brand))')),['pack']);
 run(`q('[data-brand-filter=official]').click()`);assert.deepEqual(JSON.parse(run('JSON.stringify([...qa(".brand-card")].map(c=>c.dataset.brand))')),['logo1']);
 assert.equal(run('localStorage.getItem("kultiapp_brand_filter")'),'official');
 run(`q('[data-brand-filter=all]').click();S.brandSearch='figuras';brandView()`);assert.deepEqual(JSON.parse(run('JSON.stringify([...qa(".brand-card")].map(c=>c.dataset.brand))')),['logo1']);
 run(`S.brandSearch='';brandView()`);
 // SVG preview only as an image (its code is never put in the page).
 run(`q('[data-brand=svg]').click()`);await flush();
 assert.match(run('q("#brandPreview img").getAttribute("src")'),/svg\.svg/);assert.equal(run('q("#brandPreview svg")'),null);
 run(`q('#brandDialog').close()`);
 // PDF preview with the browser viewer, and open/download.
 run(`q('[data-brand=card]').click()`);await flush();
 assert.match(run('q("#brandPreview object").getAttribute("data")'),/card\.pdf/);assert.ok(run('!!q("#brandOpen")'));
 run(`q('#brandDialog').close()`);
 // Download the original (signed link with its file name) and copy the associated text.
 run(`navigator.clipboard={writeText:async t=>{window.copied=t}};q('[data-brand=logo1]').click()`);await flush();
 assert.match(run('q("#brandDialog .facts").textContent'),/Formato.*PNG · 1,5 MB.*Dimensiones1200 × 400 px.*Archivologo1\.png.*FondoFondo oscuro/);
 assert.match(run('q("#brandDialog").textContent'),/Uso recomendado: Fondos oscuros/);
 run(`q('#brandDownload').click()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(storageCalls.filter(c=>c[0]==="url").pop())')),['url','brand-assets',W+'/brand/logo1.png',{download:'logo1.png'}]);
 run(`q('#brandCopy').click()`);await flush();assert.equal(run('copied'),'Kultiverso Pop · figuras y cuadros 3D');
 // Versions: the old one becomes current (the current is switched off first).
 assert.equal(run('qa("#brandDialog .brand-version").length'),2);
 run(`calls.length=0;q('[data-brand-current=logo0]').click()`);await flush();
 const ups=JSON.parse(run('JSON.stringify(calls.filter(c=>c.op==="update").map(c=>[c.v.is_current,c.eq]))'));
 assert.deepEqual(ups.map(u=>u[0]),[false,true]);assert.ok(ups[0][1].some(e=>e[0]==='group_id'&&e[1]==='gl'));
 assert.equal(run('rows.find(r=>r.id==="logo0").is_current'),true);assert.equal(run('rows.find(r=>r.id==="logo1").is_current'),false);
 // Official and favorite apply to the whole design.
 run(`calls.length=0;q('#brandFavorite').click()`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(calls.filter(c=>c.op==="update").map(c=>[c.v.favorite,c.eq.find(e=>e[0]==="group_id")[1]]))')),[[false,'gl']]);
 run(`q('#brandDialog')?.close()`);
 // Edit: name/category/background shared by the design, texts on this version.
 run(`calls.length=0;showBrandEdit(rows.find(r=>r.id==="svg"));q('#beName').value='Sticker oficial';q('#beUsage').value='Cajas de envío';q('#beCopy').value='¡Gracias por tu compra!';q('#brandEditForm').requestSubmit()`);await flush();
 const ed=JSON.parse(run('JSON.stringify(calls.filter(c=>c.op==="update").map(c=>c.v))'));
 assert.equal(ed[0].name,'Sticker oficial');assert.equal(ed[0].category,'labels');assert.equal(ed[1].usage,'Cajas de envío');assert.equal(ed[1].copy_text,'¡Gracias por tu compra!');
 run(`q('#brandDialog')?.close()`);
 // Upload: wrong type and too big files are refused; the original File goes up untouched.
 run(`window.big={name:'enorme.png',type:'image/png',size:60*1048576};window.f1=new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'],'logo claro.svg',{type:''});window.bad=new File(['x'],'nota.txt',{type:'text/plain'});
  storageCalls.length=0;calls.length=0;showBrandUpload([f1,bad,big],{category:'logos',background:'light'})`);
 assert.match(run('q("#brandUploadDialog").textContent'),/Formato no admitido.*Supera 50 MB/);
 assert.equal(run('q("#buName0").value'),'logo claro');assert.equal(run('q("#buBg0").value'),'light');
 run(`q('#buOfficial').checked=true;q('#brandUploadForm').requestSubmit()`);await flush();
 const up=run('JSON.stringify(storageCalls.find(c=>c[0]==="upload").slice(2).map((x,i)=>i===1?(x===f1):x))');
 assert.match(up,new RegExp('"'+W+'/brand/[0-9a-f-]{36}\\.svg",true,\\{"contentType":"image/svg\\+xml"'));
 const ins=JSON.parse(run('JSON.stringify(calls.find(c=>c.op==="insert").v)'));
 assert.equal(ins.category,'logos');assert.equal(ins.background,'light');assert.equal(ins.official,true);assert.equal(ins.mime_type,'image/svg+xml');
 assert.equal(ins.original_name,'logo claro.svg');assert.equal(ins.byte_size,run('f1.size'));
 // A failed record removes the uploaded file again.
 run(`failInsert=true;storageCalls.length=0;showBrandUpload([new File(['a'],'x.png',{type:'image/png'})]);q('#brandUploadForm').requestSubmit()`);await flush();
 assert.ok(run('storageCalls.some(c=>c[0]==="remove")'));assert.match(run('q("#brandUploadFeedback").textContent'),/No se pudo subir: x\.png: sin permiso/);
 run(`failInsert=false;q('#brandUploadDialog').close()`);
 // A new version of a design: becomes current after switching the old one off.
 run(`calls.length=0;showBrandUpload([new File(['b'],'logo-v3.png',{type:'image/png'})],{groupOf:rows.find(r=>r.id==="logo0")});q('#buLabel0').value='2026';q('#brandUploadForm').requestSubmit()`);await flush();
 const seq=JSON.parse(run('JSON.stringify(calls.filter(c=>c.op).map(c=>[c.op,c.v&&c.v.is_current,c.v&&c.v.group_id]))'));
 assert.deepEqual(seq[0],['update',false,null]);assert.deepEqual(seq[1],['insert',true,'gl']);
 // Archive (whole design) and delete (file first, then record; the newest remaining becomes current).
 run(`calls.length=0;S.brandAssets=rows;showBrandAsset(rows.find(r=>r.id==="card"));q('#brandArchive').click()`);await flush();
 assert.ok(run('!!calls.find(c=>c.op==="update"&&c.v.archived_at)'));
 run(`calls.length=0;storageCalls.length=0;confirmDialog=async()=>true;rows.find(r=>r.id==="logo1").is_current=false;rows.find(r=>r.id==="logo0").is_current=true;S.brandAssets=rows;deleteBrandAsset(rows.find(r=>r.id==="logo0"))`);await flush();
 assert.deepEqual(JSON.parse(run('JSON.stringify(storageCalls.find(c=>c[0]==="remove"))')),['remove','brand-assets',[W+'/brand/logo0.png']]);
 assert.ok(run('!!calls.find(c=>c.op==="delete"&&c.eq.some(e=>e[1]==="logo0"))'));
 assert.ok(run('!!calls.find(c=>c.op==="update"&&c.v.is_current===true&&c.eq.some(e=>e[1]==="logo1"))'));
 // Brand files shipped with the app: added byte for byte, official only where approved, grouped as versions.
 run(`calls.length=0;storageCalls.length=0;S.brandAssets=[];window.fetch=async p=>({ok:true,blob:async()=>new Blob(['data-'+p])});importBrandAppFiles()`);await flush(300);
 const kit=JSON.parse(run('JSON.stringify(calls.filter(c=>c.op==="insert").map(c=>c.v))'));
 const by=f=>kit.find(v=>v.original_name===f);
 assert.equal(kit.length,run('BRAND_APP_FILES.length'));assert.equal(kit.length,58);
 assert.equal(new Set(kit.map(v=>v.original_name)).size,58);
 assert.deepEqual([by('03_LOGO_FONDO_BLANCO.png').background,by('02_LOGO_FONDO_NEGRO.png').background,by('01_LOGO_ORIGINAL_2048x682.png').background],['light','dark','transparent']);
 assert.ok(by('03_LOGO_FONDO_BLANCO.png').official&&by('01_Tarjeta_presentacion_frente_REDONDEADA.png').official);
 // The kit flags the reconstructed K, the interface mock-ups and the reference photo for review.
 assert.ok(!by('01_K_PRINCIPAL_NEGRA_1024.png').official&&!by('01_MENU_LATERAL.png').official&&!by('REFERENCIA_APROBADA.jpg').official);
 assert.equal(by('REFERENCIA_APROBADA.jpg').category,'other');
 assert.match(by('02_Tarjeta_presentacion_reverso_REDONDEADA.png').usage,/QR .*no está validado/);
 assert.equal(by('03_Tarjeta_agradecimiento_frente_REDONDEADA.png').category,'thanks');
 assert.deepEqual(['whatsapp-perfil-640.png','whatsapp-portada-1920x1080.png','whatsapp-estado-1080x1920.png'].map(f=>[by(f).category,by(f).official]),[['social',false],['social',false],['social',false]]);
 assert.deepEqual([by('instagram-perfil-1080.png').category,by('instagram-perfil-1080.png').official],['social',false]);
 assert.match(by('whatsapp-perfil-640.png').usage,/640×640 px, el logo completo cabe en el recorte circular/);
 // Label shapes and icon sizes are versions of one design: one shared group, the first listed is current.
 const ctl=kit.filter(v=>/control_producto/.test(v.original_name));
 assert.equal(ctl[0].group_id,ctl[1].group_id);assert.deepEqual(ctl.map(v=>[v.variant_label,v.is_current]),[['Esquinas redondeadas',true],['Rectangular',false]]);
 const icons=kit.filter(v=>/^ICONO_K_/.test(v.original_name));
 assert.equal(icons.length,9);assert.equal(new Set(icons.map(v=>v.group_id)).size,1);assert.deepEqual(icons.filter(v=>v.is_current).map(v=>v.variant_label),['512 px']);
 assert.notEqual(ctl[0].group_id,icons[0].group_id);
 assert.ok(!by('03_LOGO_FONDO_BLANCO.png').group_id);
 // Every listed file exists in the repository, so the import never hits a missing path.
 const fs=require('fs'),path=require('path');
 for(const f of JSON.parse(run('JSON.stringify(BRAND_APP_FILES.map(f=>f.path))')))assert.ok(fs.existsSync(path.join(__dirname,'..',f)),f);
 // A later import adds missing sizes to the design already in the kit, without changing its current version.
 run(`calls.length=0;S.brandAssets=[{id:'k512',group_id:'gk',original_name:'ICONO_K_512.png',is_current:true}];BRAND_APP_FILES.splice(0,BRAND_APP_FILES.length,...BRAND_APP_FILES.filter(f=>f.group==='icon-k'));importBrandAppFiles()`);await flush(120);
 const again=JSON.parse(run('JSON.stringify(calls.filter(c=>c.op==="insert").map(c=>c.v))'));
 assert.equal(again.length,8);assert.ok(again.every(v=>v.group_id==='gk'&&v.is_current===false));
 // Viewers browse and download, but cannot upload, edit or delete.
 run(`S.workspace.role='viewer';S.brandAssets=rows;brandView()`);
 assert.ok(run('!q("#brandUpload")&&!q("#brandDrop")&&!q("#brandImport")&&!q("[data-brand-missing]")'));
 run(`q('[data-brand=logo1]').click()`);await flush();assert.ok(run('!!q("#brandDownload")&&!q("#brandEdit")&&!q("#brandDelete")&&!q("#brandNewVersion")'));
 // Reload with the link restores the section.
 run(`q('#brandDialog').close();history.replaceState(null,'','#marca');S.mode='home'`);assert.equal(await dom.window.eval('restoreView()'),true);assert.equal(run('S.mode'),'brand');
 dom.window.close();
 console.log('PASS 5.1 kit de marca: galería por diseño, faltantes, filtros/búsqueda, SVG solo como imagen, PDF, descarga original, copiar texto, subida sin cambios con validación y limpieza, versiones vigentes, oficial/favorito, editar, archivar, eliminar, importar archivos de la app, límites reales, visor y enlace.');
}
test().catch(e=>{console.error(e);process.exitCode=1});
