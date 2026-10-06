import http from 'node:http';
import {createHash} from 'node:crypto';
import {createAuth} from './auth.mjs';
import {publicCatalog} from './public-data.mjs';
import { readFile, writeFile, mkdir, rename, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {validDate} from './public/valuation.js';
const root=dirname(fileURLToPath(import.meta.url));
function send(res,status,body,type='application/json'){res.writeHead(status,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(body):body);}
const revision=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function validateReviews(reviews,photoIds){
  if(!reviews||typeof reviews!=='object'||Array.isArray(reviews))throw Error('Invalid review data');
  const assigned=new Set();
  for(const [id,c] of Object.entries(reviews)){
    if(!/^GNG-[A-F0-9]{10}$/.test(id)||!c||typeof c!=='object')throw Error('Invalid card ID');
    if(!['needs_review','ready','excluded'].includes(c.status))throw Error('Invalid status');
    if(c.status==='excluded')continue;
    if(c.front&&c.front===c.back)throw Error('Front and back must be different photos');
    for(const p of [c.front,c.back].filter(Boolean)){
      if(!photoIds.has(p))throw Error('Unknown photo');
      if(assigned.has(p))throw Error('A photo is assigned to more than one active record. Exclude its old record first.');
      assigned.add(p);
    }
    if(c.status==='ready'&&(!c.front||!c.back||!c.fields?.name))throw Error('Ready records need both photos and a card name');
    if(c.estimate!==null&&c.estimate!==''&&(!Number.isFinite(Number(c.estimate))||Number(c.estimate)<0))throw Error('Estimate must be a nonnegative number');
    if(!Array.isArray(c.comps))throw Error('Invalid comparable sales');
    for(const comp of c.comps){if(!/^https?:\/\//.test(comp.url)||!validDate(comp.date)||comp.date>new Date().toISOString().slice(0,10)||!Number.isFinite(Number(comp.price))||Number(comp.price)<=0||!/^[A-Z]{3}$/.test(comp.currency||''))throw Error('Each comp needs a source URL, valid past sale date, positive price, and three-letter currency');}
  }
}
export function createApp(options={}){
  const data=options.dataDir||process.env.DATA_DIR||join(root,'data');
  const port=Number(process.env.PORT||4317);
  const origin=options.origin||process.env.APP_ORIGIN||`http://127.0.0.1:${port}`;
  const parsedOrigin=new URL(origin);
  if(parsedOrigin.origin!==origin)throw Error('APP_ORIGIN must be an origin without a trailing slash');
  if(parsedOrigin.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(parsedOrigin.hostname))throw Error('Public origins require HTTPS');
  const auth=options.auth||createAuth({origin,ownerEmail:process.env.OWNER_EMAIL,passwordHash:process.env.OWNER_PASSWORD_HASH});
  let saving=Promise.resolve();
  async function jsonFile(name,fallback){try{return JSON.parse(await readFile(join(data,name),'utf8'));}catch(e){if(e.code==='ENOENT'&&fallback!==undefined)return fallback;throw e;}}
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(parsedOrigin.protocol==='https:')res.setHeader('Strict-Transport-Security','max-age=31536000');
    try{
      if(req.headers.host!==parsedOrigin.host)return send(res,403,{error:'Invalid host'});
      const url=new URL(req.url,origin),owner=auth.session(req);
      if(req.method==='GET'&&url.pathname==='/auth/session')return send(res,200,{owner:!!owner,configured:auth.configured,...(owner?{email:owner.email,csrf:owner.csrf}:{})});
      if(req.method==='GET'&&url.pathname==='/healthz')return send(res,200,{ok:true});
      if(req.method==='POST'&&url.pathname==='/auth/login'){
        if(req.headers.origin!==origin)return send(res,403,{error:'Invalid request origin'});
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>4096)return send(res,413,{error:'Too much data'});}
        return await auth.login(req,res,JSON.parse(body));
      }
      if(req.method==='POST'){
        if(!owner)return send(res,401,{error:'Owner sign-in required'});
        if(req.headers.origin!==origin||req.headers['x-csrf-token']!==owner.csrf)return send(res,403,{error:'Invalid request verification'});
        if(url.pathname==='/auth/logout')return auth.logout(req,res);
      }
      if(req.method==='GET'&&url.pathname==='/api/public')return send(res,200,publicCatalog(await jsonFile('catalog.json'),await jsonFile('reviews.json',{})));
      if(req.method==='GET'&&url.pathname==='/api/catalog'){
        if(!owner)return send(res,401,{error:'Owner sign-in required'});
        const reviews=await jsonFile('reviews.json',{});
        return send(res,200,{...await jsonFile('catalog.json'),reviews,revision:revision(reviews)});
      }
      if(req.method==='POST'&&url.pathname==='/api/reviews'){
        let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2_000_000)return send(res,413,{error:'Too much data'});}
        const payload=JSON.parse(body),catalog=await jsonFile('catalog.json');
        const generated=Object.fromEntries(catalog.cards.map(c=>[c.id,c]));
        if(Object.keys(payload).some(id=>!generated[id]))throw Error('Unknown card record');
        validateReviews({...generated,...payload},new Set(catalog.photos.map(p=>p.id)));
        const operation=saving.catch(()=>{}).then(async()=>{
          const current=await jsonFile('reviews.json',{});
          if(req.headers['if-match']!==revision(current)){const e=Error('Catalog changed in another window. Reload before editing.');e.status=409;throw e;}
          await mkdir(join(data,'backups'),{recursive:true});
          try{await copyFile(join(data,'reviews.json'),join(data,'backups',Date.now()+'-reviews.json'));}catch(e){if(e.code!=='ENOENT')throw e;}
          await writeFile(join(data,'reviews.tmp'),JSON.stringify(payload,null,2));await rename(join(data,'reviews.tmp'),join(data,'reviews.json'));
        });saving=operation;await operation;return send(res,200,{saved:true,revision:revision(payload)});
      }
      if(req.method!=='GET')return send(res,405,{error:'Method not allowed'});
      let file;
      if(/^\/media\/(previews|labels)\/[a-f0-9]{64}\.jpg$/.test(url.pathname)){
        if(!owner){
          const visible=publicCatalog(await jsonFile('catalog.json'),await jsonFile('reviews.json',{}));
          if(!visible.cards.some(c=>c.front===url.pathname||c.back===url.pathname))return send(res,404,{error:'Not found'});
        }
        file=join(data,url.pathname.slice(7));
      }else if(url.pathname==='/admin'){
        if(!owner){res.writeHead(302,{Location:'/login'});res.end();return;}
        file=join(root,'public','index.html');
      }else if(url.pathname==='/')file=join(root,'public','gallery.html');
      else if(url.pathname==='/login')file=join(root,'public','login.html');
      else if(['/app.js','/gallery.js','/login.js','/valuation.js','/style.css'].includes(url.pathname))file=join(root,'public',url.pathname.slice(1));
      else return send(res,404,{error:'Not found'});
      const ext=file.split('.').pop();return send(res,200,await readFile(file),{html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8',jpg:'image/jpeg'}[ext]);
    }catch(e){send(res,e.code==='ENOENT'?404:e.status||400,{error:e.code?'Unable to read collection data':e.message});}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{process.loadEnvFile(join(root,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const port=Number(process.env.PORT||4317);
  if(process.env.NODE_ENV==='production'&&(!process.env.APP_ORIGIN?.startsWith('https:')||!process.env.OWNER_PASSWORD_HASH||!process.env.OWNER_EMAIL))throw Error('Production requires HTTPS APP_ORIGIN and owner credentials');
  createApp().listen(port,process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1',()=>console.log('Gengar gallery: '+(process.env.APP_ORIGIN||`http://127.0.0.1:${port}`)));
}
