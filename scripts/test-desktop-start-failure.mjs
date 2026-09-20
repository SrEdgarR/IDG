import {spawn,execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,copyFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=process.cwd();let existing=false;try{execFileSync(path.join(root,'target/debug/idg-probe.exe'),['ping'],{stdio:'ignore',windowsHide:true});existing=true;}catch{}if(existing)throw Error('Runtime anterior activo; no se toca.');
await mkdir('.local',{recursive:true});const dir=await mkdtemp(path.join(root,'.local/start-failure-'));
await copyFile(path.join(root,'target/debug/idg-desktop.exe'),path.join(dir,'idg-desktop.exe'));
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const desktop=spawn(path.join(dir,'idg-desktop.exe'),[],{windowsHide:true,stdio:'ignore',env:{...process.env,IDG_DATA_DIR:path.join(dir,'state'),WEBVIEW2_USER_DATA_FOLDER:path.join(dir,'webview'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let browser;
try{
 for(let i=0;i<100;i++){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break;}catch{await sleep(100);}}
 assert.ok(browser);const page=browser.contexts()[0].pages()[0];page.setDefaultTimeout(15000);
 await page.getByRole('alert').filter({hasText:'Falta el motor'}).waitFor();
 await page.getByRole('button',{name:'Iniciar motor',exact:true}).click();
 await page.locator('.runtime-message').filter({hasText:'Falta el motor'}).waitFor();
 assert.throws(()=>execFileSync(path.join(root,'target/debug/idg-probe.exe'),['ping'],{stdio:'ignore',windowsHide:true}));
 console.log('PASS fallo real de arranque con ejecutable adjunto ausente: error visible, sin PATH, sin otra copia y reintento explícito.');
}finally{desktop.kill();}
