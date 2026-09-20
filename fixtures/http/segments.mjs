import http from 'node:http';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function bytesAt(offset,size){const b=Buffer.alloc(size);for(let i=0;i<size;i++)b[i]=(offset+i)%251;return b;}
export function expectedHash(size){const h=createHash('sha256');for(let n=0;n<size;n+=65536)h.update(bytesAt(n,Math.min(65536,size-n)));return h.digest('hex');}
export async function startSegments({size=8*1024*1024+13,rate=0,condition='per-request',port=0}={}){
 const records=[];const attempts=new Map();let active=0,peak=0,sharedDue=performance.now();
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
   for(let offset=ignored?0:start;offset<(ignored?size:end);offset+=16384){
    if(res.destroyed)break;
    const count=Math.min(16384,(ignored?size:end)-offset);
    if(rate){const duration=count/rate*1000;if(condition==='shared'){sharedDue=Math.max(sharedDue,performance.now())+duration;due=sharedDue;}else{due=Math.max(due,performance.now())+duration;}await sleep(Math.max(0,due-performance.now()));}else await sleep(1);
    if(res.destroyed)break;
    record.bytes+=count;
    if(!res.write(bytesAt(offset,count)))await new Promise(resolve=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});
    if(route==='/cut'&&match&&attempt===1&&offset-start>=65536){res.destroy();return;}
    if(route==='/seq-cut'&&!match&&offset>=1048576){res.destroy();return;}
   }
   res.end();
  }catch{res.destroy();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return{url:`http://127.0.0.1:${server.address().port}`,size,records,get peak(){return peak;},get active(){return active;},close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const f=await startSegments({port:Number(process.argv[2]??8788),size:64*1024*1024,rate:4*1024*1024});console.log(JSON.stringify({url:f.url+'/file',size:f.size,sha256:expectedHash(f.size)}));}
