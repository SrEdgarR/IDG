import {checkAdaptive} from './check-adaptive.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {startSegments,expectedHash} from '../fixtures/http/segments.mjs';
const root=process.cwd();const exe=n=>path.join(root,`target/debug/${n}.exe`);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const probe=(args,input)=>new Promise((resolve,reject)=>{const p=spawn(exe('idg-probe'),args,{windowsHide:true,stdio:['pipe','pipe','ignore']});let out='';p.stdout.on('data',b=>out+=b);p.on('error',reject);p.on('exit',code=>{if(code!==0)return reject(Error(out||'probe unavailable'));try{resolve(out.trim()?JSON.parse(out):null);}catch(e){reject(e);}});p.stdin.end(input?JSON.stringify(input):undefined);});
let exists=false;try{await probe(['ping']);exists=true;}catch{}if(exists)throw Error('Runtime previo activo; no se toca.');
await mkdir('.local',{recursive:true});const dir=await mkdtemp(path.join(root,'.local/segments-'));const files=path.join(dir,'files');await mkdir(files);
const fixture=await startSegments();let runtime;const traces=[];
async function start(){runtime=spawn(exe('idg-runtime'),[],{windowsHide:true,env:{...process.env,IDG_DATA_DIR:path.join(dir,'state'),IDG_ADAPTIVE_TRACE:'1'},stdio:['ignore','ignore','pipe']});let partial='';runtime.stderr.on('data',b=>{partial+=b;let end;while((end=partial.indexOf('\n'))>=0){const line=partial.slice(0,end);partial=partial.slice(end+1);if(line.startsWith('IDG_ADAPTIVE ')&&traces.length<2048)traces.push(JSON.parse(line.slice(13)));}if(partial.length>65536)throw Error('oversized diagnostic');});for(let i=0;i<100;i++){try{await probe(['ping']);return;}catch{await sleep(50);}}throw Error('start timeout');}
async function stop(force=false){if(!runtime)return;const p=runtime;const exited=new Promise(r=>p.exitCode!==null?r():p.once('exit',r));if(force)p.kill();else await probe(['shutdown']);await exited;runtime=null;}
async function wait(id,predicate){for(let i=0;i<600;i++){const {job}=await probe(['status',id]);if(predicate(job))return job;await sleep(30);}throw Error('timeout '+id);}
const spec=(id,route='/file',mode={manual:{requests:4}})=>({input:{url:fixture.url+route,directory:files,name:id+'.bin',expected_sha256:expectedHash(fixture.size),conflict:'reject'},options:{mode,replay_safe:true}});
try{
 await start();
 for(const mode of [1,4,8,16,'automatic']){
  const id='mode-'+mode;await probe(['add-segmented',id],spec(id,'/file',mode==='automatic'?'automatic':{manual:{requests:mode}}));const done=await wait(id,j=>j.state==='completed'||j.state==='failed');assert.equal(done.state,'completed',JSON.stringify(done));assert.equal(done.verified_against_reference,true);assert.equal(done.received_bytes,String(fixture.size));
  const bytes=await readFile(path.join(files,id+'.bin'));assert.equal(createHash('sha256').update(bytes).digest('hex'),expectedHash(fixture.size));
  if(mode!==1){assert.ok(done.ranges_durable>1);assert.equal(done.ranges_total,done.ranges_durable);}
 }
 assert.ok(fixture.peak>1);
 await probe(['add-segmented','seq-retry'],spec('seq-retry','/seq-cut',{manual:{requests:1}}));const sequential=await wait('seq-retry',j=>j.state==='completed'||j.state==='failed');assert.equal(sequential.state,'completed',JSON.stringify(sequential));assert.ok(sequential.retries>0);
 for(const size of [0,1,1048577]){
  const small=await startSegments({size,condition:'no-ranges'});try{const id='small-'+size;const input=spec(id);input.input.url=small.url+'/file';input.input.expected_sha256=expectedHash(size);await probe(['add-segmented',id],input);const done=await wait(id,j=>j.state==='completed'||j.state==='failed');assert.equal(done.state,'completed');assert.equal(done.ranges_total,0);assert.equal(small.records.length,1);}finally{await small.close();}
 }
 await probe(['add','old-partial'],spec('old-partial','/late').input);await wait('old-partial',j=>Number(j.durable_bytes)>=1048576&&j.state==='downloading');await probe(['pause','old-partial']);await wait('old-partial',j=>j.state==='paused');
 await probe(['options','old-partial'],{mode:{manual:{requests:4}},replay_safe:true});
 await probe(['resume','old-partial']);assert.equal((await wait('old-partial',j=>j.state==='completed'||j.state==='failed')).state,'completed');
 await probe(['add-segmented','pause-parallel'],spec('pause-parallel','/late'));await wait('pause-parallel',j=>j.ranges_total>0&&Number(j.received_bytes)>Number(j.durable_bytes));await probe(['pause','pause-parallel']);await wait('pause-parallel',j=>j.state==='paused');await probe(['resume','pause-parallel']);assert.equal((await wait('pause-parallel',j=>j.state==='completed'||j.state==='failed')).state,'completed');
 for(const [route,error] of [['/ignored','range_ignored'],['/overlap','invalid_range'],['/416','invalid_range'],['/changed','resource_changed']]){const id=route.slice(1);await probe(['add-segmented',id],spec(id,route));const failed=await wait(id,j=>j.state==='failed');assert.equal(failed.error,error);assert.equal(failed.verified_against_reference,false);}
 for(const route of ['/cut','/retry']){const id=route.slice(1);await probe(['add-segmented',id],spec(id,route));const done=await wait(id,j=>j.state==='completed'||j.state==='failed');assert.equal(done.state,'completed',JSON.stringify(done));assert.ok(done.retries>0);assert.equal(done.verified_against_reference,true);}
 await probe(['add-segmented','crash'],spec('crash','/checkpoint-gap',{manual:{requests:4}}));
 await wait('crash',j=>j.ranges_durable>=2&&j.ranges_durable<j.ranges_total&&Number(j.received_bytes)>Number(j.durable_bytes));
 await stop(true);fixture.releaseCheckpointGap();await start();const recovered=(await probe(['status','crash'])).job;assert.equal(recovered.state,'paused');
 const before=(await probe(['ranges','crash'])).ranges.filter(r=>r.durable);const index=fixture.records.length;
 await probe(['resume','crash']);const done=await wait('crash',j=>j.state==='completed'||j.state==='failed');assert.equal(done.state,'completed',JSON.stringify(done));
 assert.ok(fixture.records.slice(index).every(r=>!before.some(b=>r.start===Number(b.start))));
 await probe(['add-segmented','late'],spec('late','/late'));await wait('late',j=>j.ranges_total>0&&j.active_requests>0);await probe(['cancel','late']);const cancelled=await wait('late',j=>j.state==='cancelled');await sleep(700);assert.equal((await probe(['status','late'])).job.durable_bytes,cancelled.durable_bytes);
 await probe(['limits','set'],{max_downloads:3,global_requests:3,origin_requests:2,bytes_per_second:4*1024*1024});
 const started=performance.now();
 for(const priority of ['high','normal','low']){const input=spec('fair-'+priority,'/fair-'+priority);input.options.priority=priority;input.options.bytes_per_second=1024*1024;await probe(['add-segmented','fair-'+priority],input);}
 await assert.rejects(probe(['add-segmented','fourth'],spec('fourth')),/busy/);
 for(const priority of ['high','normal','low'])await wait('fair-'+priority,j=>Number(j.received_bytes)>0);
 for(const priority of ['high','normal','low'])assert.equal((await wait('fair-'+priority,j=>j.state==='completed'||j.state==='failed')).state,'completed');
 assert.ok(performance.now()-started>=7500,'individual speed cap');
 assert.ok(performance.now()-started>=3*fixture.size/(4*1024*1024)*1000-500,'global speed cap');
 await stop();await start();assert.equal((await probe(['limits'])).limits.global_requests,3);
 await probe(['limits','set'],{max_downloads:3,global_requests:16,origin_requests:8,bytes_per_second:null});
 await probe(['add-segmented','retry-max'],spec('retry-max','/retry-max'));
 const huge=await wait('retry-max',j=>j.state==='failed');assert.equal(huge.error,'retry_later');
 await assert.rejects(probe(['resume','retry-max']),/retry_later/);
 await probe(['cancel','retry-max']);assert.equal((await probe(['status','retry-max'])).job.state,'cancelled');
 await checkAdaptive({probe,directory:files,traces});
 console.log('PASS segmentación: modos 1/4/8/16/Automático, SHA completo, rangos inválidos/cambio/416, retries y Retry-After, kill/reinicio de rangos y cancelación de respuestas tardías.');
}finally{await stop().catch(()=>{});await fixture.close();}
