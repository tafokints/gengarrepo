import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {createAuth,passwordHash,verifyPassword} from '../auth.mjs';
import {createServer} from 'node:net';
import {publicCatalog} from '../public-data.mjs';

const config={origin:'http://127.0.0.1',ownerEmail:'owner@gmail.com'};
const card={id:'GNG-1234567890',status:'ready',front:'a',back:'b',fields:{name:'Gengar',set:'Fossil',cert:'private-cert',label_notes:'private-label'},photo_ids:['a','b'],estimate:123,estimate_notes:'private-estimate',comps:[],notes:'private-notes'};
const catalog={source_folder:'private-drive',photos:[{id:'a',preview:'/media/previews/a.jpg',sources:['private-source']},{id:'b',preview:'/media/previews/b.jpg'},{id:'c',preview:'/media/previews/c.jpg'}],cards:[card,{...card,id:'GNG-1234567891',status:'needs_review',front:'c',back:''}]};
test('public export is an allowlist of ready records, not private data',()=>{
 const result=publicCatalog(catalog,{});assert.equal(result.cards.length,1);
 assert.equal(JSON.stringify(result).includes('private'),false);assert.equal('estimate' in result.cards[0],false);
 assert.equal(publicCatalog(catalog,{[card.id]:{...card,status:'excluded'}}).cards.length,0);
});
test('password hashing uses a salted hash and rejects incorrect passwords',async()=>{
 const hash=await passwordHash('correct test password');
 assert.equal(await verifyPassword('correct test password',hash),true);
 assert.equal(await verifyPassword('wrong',hash),false);
 assert.equal(await verifyPassword('anything','bad-hash'),false);
 assert.notEqual(hash,await passwordHash('correct test password'));
});

async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'gengar-access-'));
 await writeFile(join(dir,'catalog.json'),JSON.stringify(catalog));await writeFile(join(dir,'reviews.json'),'{}');
 let time=Date.now();
 const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const origin=`http://127.0.0.1:${port}`;
 const auth=createAuth({...config,origin,passwordHash:await passwordHash('test owner password')},{now:()=>time});
 const server=createApp({dataDir:dir,origin,auth});await new Promise(r=>server.listen(port,'127.0.0.1',r));
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
 async function login(email='owner@gmail.com',password='test owner password'){
  const response=await request('/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  return {response,cookie:response.headers.getSetCookie().find(s=>s.startsWith('gengar_session='))?.split(';')[0]};
 }
 return {request,login,dir,origin,advance(ms){time+=ms;}};
}
test('anonymous visitors cannot read private data, edit, or bypass through admin',async t=>{
 const f=await fixture(t);
 assert.equal((await f.request('/api/catalog')).status,401);
 assert.equal((await f.request('/api/reviews',{method:'POST',body:'{}'})).status,401);
 assert.equal((await f.request('/admin')).headers.get('location'),'/login');
 assert.equal((await f.request('/data/reviews.json')).status,404);
 assert.equal((await f.request('/api/public')).status,200);
 assert.equal((await f.request('/media/labels/'+ 'a'.repeat(64)+'.jpg')).status,404);
 assert.equal(await readFile(join(f.dir,'reviews.json'),'utf8'),'{}');
});
test('login rejects other accounts, incorrect passwords and cross-site login',async t=>{
 const f=await fixture(t);
 assert.equal((await f.login('visitor@gmail.com')).response.status,401);
 assert.equal((await f.login('owner@gmail.com','bad')).response.status,401);
 assert.equal((await f.request('/auth/login',{method:'POST',headers:{Origin:'https://attacker.example'},body:'{}'})).status,403);
});
test('owner edits require CSRF and current revision; logout revokes session',async t=>{
 const f=await fixture(t),login=await f.login();assert.equal(login.response.status,200);
 const cookie=login.cookie;assert.ok(cookie);
 const session=await (await f.request('/auth/session',{headers:{Cookie:cookie}})).json();assert.equal(session.owner,true);
 const db=await (await f.request('/api/catalog',{headers:{Cookie:cookie}})).json();
 const headers={Cookie:cookie,Origin:f.origin,'X-CSRF-Token':session.csrf,'If-Match':db.revision};
 assert.equal((await f.request('/api/reviews',{method:'POST',headers:{Cookie:cookie,Origin:f.origin},body:'{}'})).status,403);
 assert.equal((await f.request('/api/reviews',{method:'POST',headers:{...headers,Origin:'https://attacker.example'},body:'{}'})).status,403);
 const update={[card.id]:{...card,estimate:555}};
 assert.equal((await f.request('/api/reviews',{method:'POST',headers,body:JSON.stringify(update)})).status,200);
 assert.equal((await f.request('/api/reviews',{method:'POST',headers,body:'{}'})).status,409);
 assert.equal(JSON.parse(await readFile(join(f.dir,'reviews.json'),'utf8'))[card.id].estimate,555);
 assert.equal((await f.request('/auth/logout',{method:'POST',headers})).status,204);
 assert.equal((await f.request('/api/catalog',{headers:{Cookie:cookie}})).status,401);
});
test('expired owner sessions cannot edit',async t=>{
 const f=await fixture(t),login=await f.login();f.advance(8*60*60_000+1);
 assert.equal((await f.request('/api/catalog',{headers:{Cookie:login.cookie}})).status,401);
});
test('unconfigured authentication fails closed',()=>assert.equal(createAuth({origin:'http://127.0.0.1'}).configured,false));

test('repeated incorrect login attempts are rate limited',async t=>{
 const f=await fixture(t);for(let i=0;i<20;i++)assert.equal((await f.login('owner@gmail.com','bad')).response.status,401);
 assert.equal((await f.login()).response.status,429);f.advance(61_000);assert.equal((await f.login()).response.status,200);
});
