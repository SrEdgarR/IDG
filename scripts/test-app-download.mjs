import {spawn, execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startSegments, expectedHash} from '../fixtures/http/segments.mjs';
const root=process.cwd(), exe=name=>path.join(root,`target/debug/${name}.exe`);
const probe=args=>JSON.parse(execFileSync(exe('idg-probe'),args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}));
let existing=false;try{probe(['ping']);existing=true;}catch{}if(existing)throw Error('Runtime personal activo; no se toca.');
await mkdir('.local',{recursive:true});const dir=await mkdtemp(path.join(root,'.local/app-download-'));const files=path.join(dir,'files');await mkdir(files);
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const fixture=await startSegments({size:2*1024*1024,rate:512*1024});
const env={...process.env,IDG_DATA_DIR:path.join(dir,'state'),WEBVIEW2_USER_DATA_FOLDER:path.join(dir,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`};
let runtime,desktop,browser;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 runtime=spawn(exe('idg-runtime'),[],{env,windowsHide:true,stdio:'ignore'});
 for(let i=0;i<100;i++){try{assert.equal(probe(['ping']).process_id,runtime.pid);break;}catch{await sleep(50);}}
 desktop=spawn(exe('idg-desktop'),[],{env,windowsHide:true,stdio:'ignore'});
 for(let i=0;i<100;i++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await sleep(100);}}
 assert.ok(browser);const page=browser.contexts()[0].pages()[0];
 await page.getByRole('status').filter({hasText:/^Conectado$/}).waitFor();
 await page.getByRole('button',{name:'Nueva descarga',exact:true}).click();
 await page.getByLabel('URL del archivo',{exact:true}).fill(fixture.url+'/file');
 await page.getByLabel('Nombre del archivo',{exact:true}).fill('real.bin');
 await page.getByLabel('Carpeta',{exact:true}).fill(files);
 assert.equal(fixture.records.length,0,'editing never consumes the URL');
 await page.getByRole('button',{name:'Descargar ahora',exact:true}).click();
 await page.getByRole('dialog',{name:'Nueva descarga',exact:true}).waitFor({state:'hidden'});
 await page.locator('.download-row').filter({hasText:'real.bin'}).waitFor();
 const deadline=Date.now()+30000;let job;
 while(Date.now()<deadline){job=probe(['list']).jobs.find(j=>j.name==='real.bin');if(job?.state==='completed')break;await sleep(100);}
 assert.equal(job?.state,'completed');assert.equal(probe(['list']).jobs.length,1);
 assert.equal(createHash('sha256').update(await readFile(path.join(files,'real.bin'))).digest('hex'),expectedHash(fixture.size));
 assert.equal(fixture.records.length,1,'uncertain replay capability keeps one GET');
 await page.locator('.download-row').filter({hasText:'Completadas'}).waitFor();
 console.log('PASS Tauri → IPC → runtime → archivo real; aceptación durable, fila real, hash y ningún GET previo/repetido.');
}finally{
 desktop?.kill();
 if(runtime?.exitCode===null){try{assert.equal(probe(['ping']).process_id,runtime.pid);execFileSync(exe('idg-probe'),['shutdown'],{windowsHide:true,stdio:'ignore'});}catch{runtime.kill();}}
 await fixture.close();
}
