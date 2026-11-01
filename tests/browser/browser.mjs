import fs from 'node:fs/promises';
const targets=await (await fetch(`${process.env.CDP_URL || 'http://127.0.0.1:9227'}/json/list`)).json();
const target=targets.find(t=>t.type==='page');
if (!target) throw new Error('Open a page in the dedicated test browser first.');
const artifacts = new URL('../../test-results/browser/', import.meta.url);
await fs.mkdir(artifacts, {recursive:true});
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map();export const errors=[];
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text+': '+m.params.exceptionDetails.exception?.description);});
export function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});}
export async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
export async function screen(name){const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await fs.writeFile(new URL(name+'.png', artifacts),Buffer.from(data,'base64'));}
export const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function size(width,height,mobile=false){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:mobile?2:1,mobile});await wait(100);}
export async function open(url='http://127.0.0.1:8000'){await send('Runtime.enable');await send('Page.enable');await send('Page.navigate',{url});await wait(600);}
export async function click(x,y){await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});}
export async function drag(x,y,ex,ey){await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});for(let i=1;i<=8;i++){await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+(ex-x)*i/8,y:y+(ey-y)*i/8,button:'left',buttons:1});}await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:ex,y:ey,button:'left',clickCount:1});}
export async function world(x,y){return evaluate(`(()=>{const g=footballGame,r=g.canvas.getBoundingClientRect();return {x:r.left+g.view.x+${x}*g.view.scale,y:r.top+g.view.y+${y}*g.view.scale}})()`);}
export function close(){ws.close();}
