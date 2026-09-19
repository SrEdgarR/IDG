import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {startFixture,SIZE,expectedHash} from '../fixtures/http/server.mjs';
const root=process.cwd();const exe=n=>path.join(root,`target/debug/${n}.exe`);
const probe=(args,input)=>new Promise((resolve,reject)=>{const p=spawn(exe('idg-probe'),args,{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';p.stdout.on('data',b=>out+=b);p.on('error',reject);p.on('exit',code=>{try{if(code!==0)reject(new Error('probe rejected: '+out));else resolve(out.trim()?JSON.parse(out):null);}catch(e){reject(e);}});p.stdin.end(input?JSON.stringify(input):undefined);});
let existing=false;try{await probe(['ping']);existing=true;}catch{}if(existing)throw Error('Detén el runtime anterior antes de esta prueba aislada.');
await mkdir('.local',{recursive:true});const dir=await mkdtemp(path.join(root,'.local/http-engine-'));const files=path.join(dir,'files');await mkdir(files);const f=await startFixture();let runtime;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let watcher; let watched='';
async function start(){runtime=spawn(exe('idg-runtime'),[],{windowsHide:true,env:{...process.env,IDG_DATA_DIR:path.join(dir,'state')},stdio:'ignore'});for(let i=0;i<100;i++){try{await probe(['ping']);return;}catch{await sleep(50);}}throw Error('runtime unavailable');}
async function stop(force=false){if(!runtime)return;const p=runtime;const done=new Promise(r=>p.exitCode!==null?r():p.once('exit',r));if(force)p.kill();else await probe(['shutdown']);await done;runtime=null;}
async function wait(id,predicate){for(let i=0;i<200;i++){const {job}=await probe(['status',id]);if(predicate(job))return job;await sleep(50);}throw Error('job timeout '+id);}
const spec=(route,name)=>({url:f.url+route,directory:files,name,expected_sha256:expectedHash(),conflict:'reject'});
try{
 await start();
 assert.deepEqual(await probe(['capabilities']),{kind:'download_capabilities',operations:['add_download','get_download','list_downloads','pause_download','resume_download','cancel_download'],schema_version:1,max_active:1,max_write_bytes:65536,strong_validator_required:true});
 watcher=spawn(exe('idg-probe'),['watch'],{windowsHide:true,stdio:['ignore','pipe','ignore']});
 watcher.stdout.on('data',b=>watched+=b);
 await sleep(150);
 const secret='fixture-private-query-'+Date.now();const input=spec('/slow?token='+secret,'crash.bin');
 await probe(['add','crash'],input);
 await wait('crash',j=>Number(j.durable_bytes)>=1048576);
 await assert.rejects(probe(['add','busy'],spec('/file','busy.bin')),/busy/);
 await stop(true);
 await sleep(100);
 const events=watched.trim().split('\n').filter(Boolean).map(JSON.parse);
 assert.ok(events.length>0&&events.every(e=>e.kind==='download_changed'&&e.job.id==='crash'));
 assert.ok(events.some(e=>Number(e.job.received_bytes)>0));
 assert.ok(events.every((e,i)=>i===0||e.sequence>events[i-1].sequence));
 await start();const recovered=(await probe(['status','crash'])).job;
 assert.equal(recovered.state,'paused');assert.ok(Number(recovered.durable_bytes)>0&&Number(recovered.durable_bytes)<SIZE);
 await probe(['resume','crash']);const complete=await wait('crash',j=>j.state==='completed');assert.equal(complete.verified_against_reference,true);assert.equal(complete.calculated_sha256,expectedHash());
 const final=await readFile(path.join(files,'crash.bin'));assert.equal(createHash('sha256').update(final).digest('hex'),expectedHash());
 const ranged=f.records.find(r=>r.route==='/slow'&&r.range);assert.equal(ranged.range,`bytes=${recovered.durable_bytes}-`);assert.equal(ranged.bytes,SIZE-Number(recovered.durable_bytes));
 await probe(['add','crash'],input);assert.equal((await probe(['list'])).jobs.length,1);
 for(const [route,id,error] of [['/ignore-range','ignore','range_ignored'],['/bad-range','bad','invalid_range'],['/changed','changed','resource_changed']]){
  await probe(['add',id],spec(route,id+'.bin'));await wait(id,j=>Number(j.durable_bytes)>=1048576&&j.state==='downloading');await probe(['pause',id]);const paused=await wait(id,j=>j.state==='paused');await probe(['resume',id]);const failed=await wait(id,j=>j.state==='failed');assert.equal(failed.error,error);assert.equal(failed.durable_bytes,paused.durable_bytes);
 }
 await probe(['add','cut'],spec('/cut','cut.bin'));await wait('cut',j=>j.state==='failed');await probe(['resume','cut']);assert.equal((await wait('cut',j=>j.state==='completed')).calculated_sha256,expectedHash());
 await probe(['add','cancel'],spec('/slow','cancel.bin'));await wait('cancel',j=>Number(j.received_bytes)>0);await probe(['cancel','cancel']);await wait('cancel',j=>j.state==='cancelled');
 for(const route of ['/unknown','/head-denied','/one-use','/redirect']){const id=route.slice(1);await probe(['add',id],spec(route,id+'.bin'));assert.equal((await wait(id,j=>j.state==='completed')).verified_against_reference,true);}
 for(const [route,id,error] of [['/expired','expired','access_denied'],['/html','html','representation'],['/gzip','gzip','representation'],['/retry','retry','retry_later']]){await probe(['add',id],spec(route,id+'.bin'));assert.equal((await wait(id,j=>j.state==='failed')).error,error);}
 await probe(['add','graceful'],spec('/slow','graceful.bin'));
 await wait('graceful',j=>Number(j.received_bytes)>0);
 await stop();await start();
 const graceful=(await probe(['status','graceful'])).job;
 assert.equal(graceful.state,'paused');assert.ok(Number(graceful.durable_bytes)>0);
 await probe(['cancel','graceful']);
 await stop();
 for(const name of ['jobs.sqlite3','jobs.sqlite3-wal']){let bytes;try{bytes=await readFile(path.join(dir,'state',name));}catch{continue;}assert.equal(bytes.includes(Buffer.from(secret)),false);assert.equal(bytes.includes(Buffer.from(f.url)),false);}
 assert.ok(f.records.every(r=>r.method==='GET'&&!r.authorization&&!r.cookie));assert.equal(f.records.filter(r=>r.route==='/one-use').length,1);
 console.log('PASS HTTP/runtime: IPC, progreso/checkpoints, pausa/reanudación, cancelación, kill/reinicio y SHA esperado; Range solicita solo bytes restantes, idempotencia, 200/206 inválidos/cambio, corte, desconocido, HEAD no requerido, URL de un uso, redirección, 403/503/HTML/encoding, URL ausente de SQLite/WAL.');
}finally{if(watcher&&watcher.exitCode===null)watcher.kill();await stop().catch(()=>{});await f.close();}
