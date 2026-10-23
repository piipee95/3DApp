const assert = require('node:assert/strict');
const {boot} = require('./v12.test.cjs');
async function test() {
  const dom = boot(), run = code => dom.window.run(code);
  run(`S.mode='files';S.fileRequests=[
    {id:'r1',label:'Foto original',submitted_at:'2026-10-23',expires_at:'2026-10-25'},
    {id:'r2',label:'Respaldo archivado',archived_at:'2026-10-23',expires_at:'2026-10-25'}
  ];customerFilesView();window.calls=[];window.accept=true;
  confirmDialog=async()=>window.accept;
  supabase.rpc=async(name,args)=>{window.calls.push(args.p_action);return {data:{paths:['private/photo.heic']},error:null}};
  supabase.storage={from:bucket=>({remove:async paths=>{window.calls.push('storage:'+paths.join(','));return {error:window.storageFailure?{message:'Sin conexión'}:null}}})};`);
  assert.equal(run('navCount("files")'),1);
  assert.equal(run('qa("[data-manage-files][data-files-action=archive]").length'),1);
  assert.equal(run('q("[data-manage-files=r2]")'),null);
  run('window.accept=false');
  await run('manageCustomerFileRequest(S.fileRequests[0],"delete")');
  assert.equal(dom.window.calls.length,0);
  run('window.accept=true');
  await run('manageCustomerFileRequest(S.fileRequests[0],"archive")');
  assert.equal(run('S.fileRequests[0].revoked'),true);
  assert.equal(run('navCount("files")'),0);
  assert.equal(run('q("[data-manage-files=r1]")'),null);
  run('q("[data-files-tab=archived]").click()');
  assert.equal(run('qa("[data-files-action=restore]").length'),2);
  assert.equal(run('q("[data-copy-files]")'),null);
  await run('manageCustomerFileRequest(S.fileRequests[0],"restore")');
  assert.equal(run('S.fileRequests[0].archived_at'),null);
  assert.equal(run('S.fileRequests[0].revoked'),true);
  run('q("[data-files-tab=active]").click();window.calls=[];window.storageFailure=true');
  await run('manageCustomerFileRequest(S.fileRequests[0],"delete")');
  assert.deepEqual(Array.from(dom.window.calls),['delete_start','storage:private/photo.heic']);
  assert.equal(run('S.fileRequests.length'),2);
  assert(run('S.fileRequests[0].deleting_at'));
  assert.match(run('q("[data-files-action=delete]").textContent'),/Reintentar/);
  assert.equal(run('q("[data-files-action=archive]")'),null);
  run('window.calls=[];window.storageFailure=false');
  await run('manageCustomerFileRequest(S.fileRequests[0],"delete")');
  assert.deepEqual(Array.from(dom.window.calls),['delete_start','storage:private/photo.heic','delete_finish']);
  assert.equal(run('S.fileRequests.length'),1);
  run('S.workspace.role="viewer";S.fileRequestsTab="archived";customerFilesView();window.calls=[]');
  assert.equal(run('q("[data-manage-files]")'),null);
  await run('manageCustomerFileRequest(S.fileRequests[0],"delete")');
  assert.equal(dom.window.calls.length,0);
  // A failed final DB check must leave the request retryable, even after Storage succeeds.
  run(`S.workspace.role='owner';window.calls=[];supabase.rpc=async(name,args)=>{
    window.calls.push(args.p_action);return {data:{paths:[]},error:args.p_action==='delete_finish'?{message:'Quedan archivos por borrar'}:null}
  }`);
  await run('manageCustomerFileRequest(S.fileRequests[0],"delete")');
  assert.equal(run('S.fileRequests.length'),1);
  assert(run('S.fileRequests[0].deleting_at'));
  assert.deepEqual(Array.from(dom.window.calls),['delete_start','delete_finish']);
  dom.window.close();
  console.log('PASS customer files: archive/restore, closed links, badge, cancellation, viewer controls, Storage-first deletion, retries and failed final cleanup.');
}
test().catch(error=>{console.error(error);process.exitCode=1});
