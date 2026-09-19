// Deterministic, streaming test content. Never serves user files.
import http from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const SIZE=8*1024*1024;
export function block(offset,length){const b=Buffer.alloc(length);for(let i=0;i<length;i++)b[i]=(offset+i)%251;return b;}
export function expectedHash(size=SIZE){const h=createHash('sha256');for(let o=0;o<size;o+=65536)h.update(block(o,Math.min(65536,size-o)));return h.digest('hex');}
export async function startFixture(port=0){
 const records=[];const used=new Map();
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');const route=url.pathname;const times=(used.get(route)??0)+1;used.set(route,times);
  const record={route,method:req.method,range:req.headers.range??null,ifRange:req.headers['if-range']??null,bytes:0,authorization:!!req.headers.authorization,cookie:!!req.headers.cookie};records.push(record);
  if(req.method==='HEAD'){res.writeHead(405);res.end();return;}
  if(route==='/expired'){res.writeHead(403);res.end();return;}
  if(route==='/retry'){res.writeHead(503,{'Retry-After':'1'});res.end();return;}
  if(route==='/html'){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html>Login fixture</html>');return;}
  if(route==='/gzip'){res.writeHead(200,{'Content-Encoding':'gzip'});res.end('not an identity representation');return;}
  if(route==='/redirect'){res.writeHead(302,{Location:`http://localhost:${server.address().port}/file`});res.end();return;}
  if(route==='/one-use'&&times>1){res.writeHead(410);res.end();return;}
  const size=route==='/zero'?0:route==='/byte'?1:SIZE;
  const etag=route==='/changed'&&req.headers.range?'"v2"':'"v1"';
  let start=0;let status=200;const headers={'Content-Type':'application/octet-stream',ETag:etag};
  const match=/^bytes=(\d+)-$/.exec(req.headers.range??'');
  if(match&&route!=='/ignore-range'){start=Number(match[1]);status=206;if(start>=size){res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});res.end();return;}headers['Content-Range']=`bytes ${route==='/bad-range'?start+1:start}-${size-1}/${size}`;}
  if(route!=='/unknown')headers['Content-Length']=size-start;
  // Deliberately omit Accept-Ranges: a valid 206 is the actual evidence.
  res.writeHead(status,headers);
  try{for(let offset=start;offset<size;offset+=65536){if(res.destroyed)break;const data=block(offset,Math.min(65536,size-offset));record.bytes+=data.length;if(!res.write(data))await once(res,'drain');if(route==='/cut'&&!match&&offset>=2*1024*1024){res.destroy();return;}await new Promise(r=>setTimeout(r,route==='/slow'?12:2));}res.end();}catch{res.destroy();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 return{server,records,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(r=>{server.closeAllConnections();server.close(r);})};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const f=await startFixture(Number(process.argv[2]??8787));console.log(JSON.stringify({url:f.url+'/slow',size:SIZE,sha256:expectedHash()}));}
