import http from 'node:http';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function bytesAt(offset,size){const b=Buffer.alloc(size);for(let i=0;i<size;i++)b[i]=(offset+i)%251;return b;}
export function expectedHash(size){const h=createHash('sha256');for(let n=0;n<size;n+=65536)h.update(bytesAt(n,Math.min(65536,size-n)));return h.digest('hex');}
// One aggregate clock/bucket. Late callbacks retain earned credit instead of
// turning the configured shared cap into a per-request timer bottleneck.
export class SharedPacer {
 constructor(rate, minimumTimerMs=0){this.rate=rate;this.minimumTimerMs=minimumTimerMs;this.credit=0;this.last=performance.now();this.queue=[];this.timer=null;this.closed=false;}
 take(bytes){if(this.closed)return Promise.resolve();return new Promise(resolve=>{this.queue.push({bytes,resolve});this.pump();});}
 pump(){
  const now=performance.now();this.credit=Math.min(262144,this.credit+(now-this.last)*this.rate/1000);this.last=now;
  while(this.queue.length&&this.credit>=this.queue[0].bytes){const request=this.queue.shift();this.credit-=request.bytes;request.resolve();}
  if(this.queue.length&&!this.timer){const wait=Math.max(1,this.minimumTimerMs,Math.ceil((this.queue[0].bytes-this.credit)/this.rate*1000));this.timer=setTimeout(()=>{this.timer=null;this.pump();},wait);}
 }
 close(){this.closed=true;clearTimeout(this.timer);for(const request of this.queue)request.resolve();this.queue=[];}
}
export async function startSegments({size=8*1024*1024+13,rate=0,condition='per-request',port=0,minimumTimerMs=0}={}){
 const records=[];const attempts=new Map();let active=0,peak=0;
 let holdCheckpointGap=true;const gates=new Set();
 const releaseCheckpointGap=()=>{holdCheckpointGap=false;for(const release of gates)release();gates.clear();};
 let holdHandoffOutage=true;const handoffGates=new Set();
 const releaseHandoffOutage=()=>{holdHandoffOutage=false;for(const release of handoffGates)release();handoffGates.clear();};
 const shared=new SharedPacer(rate,minimumTimerMs);const measurements=[];const begun=performance.now();let measuredAt=begun,measuredBytes=0,bodyBytes=0;
 const server=http.createServer(async(req,res)=>{
  const route=new URL(req.url,'http://fixture').pathname;
  const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range??'');
  const start=match?Number(match[1]):0;const end=match&&match[2]?Number(match[2])+1:size;
  const key=route+':'+start;const attempt=(attempts.get(key)??0)+1;attempts.set(key,attempt);
  const record={route,range:req.headers.range??null,start,end,bytes:0,at:performance.now(),status:200};records.push(record);
  active++;peak=Math.max(peak,active);let closed=false;res.once('close',()=>{if(!closed){closed=true;active--;}});
  const sendError=(status,headers={})=>{record.status=status;res.writeHead(status,headers);res.end();};
  if(route==='/retry'&&match&&attempt===1){sendError(503,{'Retry-After':'1'});return;}
  if(route==='/retry-max'&&match){sendError(503,{'Retry-After':'18446744073709551615'});return;}
  if(route==='/416'&&match){sendError(416,{'Content-Range':`bytes */${size}`,ETag:'"v1"'});return;}
  if((match&&start>=size)||end>size||end<start||(match&&end===start)){sendError(416);return;}
  const ignored=route==='/ignored'&&match;
  const status=match&&!ignored?206:200;record.status=status;
  const headers={'Content-Type':'application/octet-stream','Content-Length':ignored?size:end-start,ETag:route==='/changed'&&match?'"v2"':'"v1"'};
  if(condition!=='no-ranges')headers['Accept-Ranges']='bytes';
  if(status===206)headers['Content-Range']=`bytes ${route==='/overlap'?Math.max(0,start-1):start}-${end-1}/${size}`;
  res.writeHead(status,headers);
  let due=performance.now();
  try{
   if(route==='/late'&&match)await sleep(500);
   // Hold the IDG range until the Chromium handoff test stops the runtime.
   if(route==='/handoff-outage.bin'&&match&&holdHandoffOutage){
    await new Promise(resolve=>{const release=()=>{res.off('close',release);handoffGates.delete(release);resolve();};handoffGates.add(release);res.once('close',release);if(res.destroyed)release();});
   }
   for(let offset=ignored?0:start;offset<(ignored?size:end);offset+=16384){
    if(res.destroyed)break;
    const count=Math.min(16384,(ignored?size:end)-offset);
    if(rate){if(condition==='shared'){await shared.take(count);}else{due=Math.max(due,performance.now())+count/rate*1000;await sleep(Math.max(minimumTimerMs,due-performance.now()));}}else await sleep(1);
    if(res.destroyed)break;
    record.bytes+=count;bodyBytes+=count;
    const now=performance.now();if(now-measuredAt>=1000&&measurements.length<128){measurements.push({at_ms:now-begun,window_ms:now-measuredAt,bytes:bodyBytes-measuredBytes,rate:(bodyBytes-measuredBytes)*1000/(now-measuredAt),active});measuredAt=now;measuredBytes=bodyBytes;}
    if(!res.write(bytesAt(offset,count)))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});
    // Hold a real, written but non-checkpointed range until the crash test
    // observes it. Resume releases this barrier; hashes and writes stay real.
    if(route==='/checkpoint-gap'&&match&&start>=2097152&&offset-start>=65536&&holdCheckpointGap){
     await new Promise(resolve=>{const release=()=>{res.off('close',release);gates.delete(release);resolve();};gates.add(release);res.once('close',release);if(res.destroyed)release();});
    }
    if(route==='/cut'&&match&&attempt===1&&offset-start>=65536){res.destroy();return;}
    if(route==='/seq-cut'&&!match&&offset>=1048576){res.destroy();return;}
   }
   res.end();
  }catch{res.destroy();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return{url:`http://127.0.0.1:${server.address().port}`,size,records,measurements,releaseCheckpointGap,releaseHandoffOutage,get peak(){return peak;},get active(){return active;},close:()=>new Promise(r=>{releaseCheckpointGap();releaseHandoffOutage();shared.close();server.closeAllConnections();server.close(r);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const f=await startSegments({port:Number(process.argv[2]??8788),size:64*1024*1024,rate:4*1024*1024});console.log(JSON.stringify({url:f.url+'/file',size:f.size,sha256:expectedHash(f.size)}));}
