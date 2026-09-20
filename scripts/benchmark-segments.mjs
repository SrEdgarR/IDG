import {spawn} from 'node:child_process';
import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {startSegments,expectedHash} from '../fixtures/http/segments.mjs';
const root=process.cwd();const exe=n=>path.join(root,`target/release/${n}.exe`);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function probe(args,input){return new Promise((resolve,reject)=>{const p=spawn(exe('idg-probe'),args,{windowsHide:true,stdio:['pipe','pipe','ignore']});let out='';p.stdout.on('data',b=>out+=b);p.on('error',reject);p.on('exit',code=>{if(code!==0)return reject(Error(out||'probe unavailable'));try{resolve(out.trim()?JSON.parse(out):null);}catch(e){reject(e);}});p.stdin.end(input?JSON.stringify(input):undefined);});}
let exists=false;try{await probe(['ping']);exists=true;}catch{}if(exists)throw Error('Hay un runtime previo; no se toca.');
// A debug runtime also owns the same protected pipe; start below fails without terminating it.
await mkdir('.local',{recursive:true});const directory=await mkdtemp(path.join(root,'.local/bench04-'));
const size=16*1024*1024+13,rate=4*1024*1024,repetitions=3;
const sharedOnly=process.argv.includes('--shared-only');
const results=[];
for(const condition of (sharedOnly?['shared']:['per-request','shared','no-ranges'])){
 for(const mode of [1,4,8,16,'automatic']){
  for(let repetition=1;repetition<=repetitions;repetition++){
   const id=`${condition}-${mode}-${repetition}`;const dir=path.join(directory,id);await mkdir(dir);
   const fixture=await startSegments({size,rate,condition});
   const runtime=spawn(exe('idg-runtime'),[],{windowsHide:true,env:{...process.env,IDG_DATA_DIR:path.join(dir,'state')},stdio:'ignore'});
   let monitor;
   try{
    let ready=false;for(let i=0;i<100;i++){if(runtime.exitCode!==null)throw Error('runtime propio no pudo adquirir instancia');try{const ping=await probe(['ping']);assert.equal(ping.process_id,runtime.pid);ready=true;break;}catch{await sleep(50);}}assert.ok(ready);
    monitor=spawn('powershell.exe',['-NoProfile','-File',path.join(root,'scripts/Measure-Runtime.ps1'),'-BenchmarkProcessId',String(runtime.pid)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
    let metrics='';monitor.stdout.on('data',b=>metrics+=b);let monitorError='';monitor.stderr.on('data',b=>monitorError+=b);
    const monitored=new Promise((resolve,reject)=>{monitor.on('error',reject);monitor.on('exit',code=>code===0?resolve():reject(Error('sampler: '+monitorError)));});
    await probe(['limits','set'],{max_downloads:3,global_requests:32,origin_requests:32,bytes_per_second:null});
    const started=performance.now();
    await probe(['add-segmented',id],{input:{url:fixture.url+'/file',directory:dir,name:'file.bin',expected_sha256:expectedHash(size),conflict:'reject'},options:{mode:mode==='automatic'?'automatic':{manual:{requests:mode}},replay_safe:true}});
    let done;let observedRequests=0,observedTarget=0;
    for(let i=0;i<1200;i++){const {job}=await probe(['status',id]);observedRequests=Math.max(observedRequests,job.active_requests);observedTarget=Math.max(observedTarget,job.target_requests);if(['completed','failed'].includes(job.state)){done=job;break;}await sleep(30);}
    const elapsed=performance.now()-started;assert.ok(done);assert.equal(done.state,'completed',JSON.stringify(done));assert.equal(done.verified_against_reference,true);
    // Allow one final read-only process sample before orderly shutdown.
    await sleep(150);const exited=new Promise(r=>runtime.once('exit',r));await probe(['shutdown']);await exited;await monitored;
    const usage=JSON.parse(metrics.trim());assert.ok(usage.samples>0);
    const served=fixture.records.reduce((n,r)=>n+r.bytes,0);
    const row={condition,mode,repetition,size,elapsed_ms:Math.round(elapsed),useful_bytes:size,server_body_bytes:served,repeated_or_discarded_bytes:Math.max(0,served-size),...usage,observed_requests:observedRequests,observed_target:observedTarget,server_peak_requests:fixture.peak,sha256:done.calculated_sha256};
    results.push(row);console.log(JSON.stringify(row));
   }finally{
    if(runtime.exitCode===null){try{await probe(['shutdown']);}catch{runtime.kill();}}
    await fixture.close();
   }
  }
 }
}
const report={environment:{os:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,logical_cpus:os.cpus().length,ram_bytes:os.totalmem(),node:process.version,profile:'release',file_size:size,server_rate_bytes_per_second:rate,repetitions,sampling_ms:100},results};
const output=sharedOnly?'artifacts/benchmark04-shared-v2.json':'artifacts/benchmark04.json';
await mkdir('artifacts',{recursive:true});await writeFile(output,JSON.stringify({...report,fixture_version:'shared-credit-v2'},null,2)+'\n');
console.log('Benchmark completo: '+output);
