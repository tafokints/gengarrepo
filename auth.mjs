import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(scryptCallback);
const random=()=>randomBytes(32).toString('base64url');
const cookies=req=>Object.fromEntries((req.headers.cookie||'').split(';').map(v=>v.trim().split('=')));
export async function passwordHash(password){
  const salt=randomBytes(16).toString('hex');
  const key=await scrypt(password,salt,64);
  return `scrypt$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(password,stored){
  if(typeof password!=='string'||password.length>1024)return false;
  const [algorithm,salt,hex]=String(stored||'').split('$');
  if(algorithm!=='scrypt'||!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hex||''))return false;
  const actual=await scrypt(password,salt,64);return timingSafeEqual(actual,Buffer.from(hex,'hex'));
}
export function createAuth(config,{now=Date.now}={}){
  const configured=!!(config.ownerEmail&&/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(config.passwordHash||''));
  const sessions=new Map(),attempts=new Map();let inFlight=0;
  const secure=config.origin.startsWith('https:');
  const sessionName=secure?'__Host-gengar_session':'gengar_session';
  const cookie=(value,age)=>`${sessionName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
  const prune=()=>{for(const map of [sessions,attempts])for(const [key,v] of map)if(v.expires<=now())map.delete(key);};
  function session(req){prune();return sessions.get(cookies(req)[sessionName])||null;}
  return {configured,session,
    async login(req,res,input){
      prune();
      const reply=(code,message)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify({error:message}));};
      if(!configured)return reply(503,'Owner login is not configured.');
      // Use the actual socket address, never a user-controlled forwarded header.
      // A shared reverse proxy gets a conservative shared limit.
      const key=req.socket.remoteAddress||'unknown',bucket=attempts.get(key)||{count:0,expires:now()+60_000};
      bucket.count++;attempts.set(key,bucket);
      if(bucket.count>20||inFlight>=4)return reply(429,'Too many attempts. Please wait a minute.');
      inFlight++;
      try{
        const correct=await verifyPassword(input.password,config.passwordHash);
        if(!correct||typeof input.email!=='string'||input.email.toLowerCase()!==config.ownerEmail.toLowerCase())return reply(401,'Email or password was not accepted.');
        const old=cookies(req)[sessionName];if(old)sessions.delete(old);
        if(sessions.size>=1000)sessions.delete(sessions.keys().next().value);
        const id=random();sessions.set(id,{email:config.ownerEmail,csrf:random(),expires:now()+8*60*60_000});
        res.writeHead(200,{'Set-Cookie':cookie(id,8*60*60),'Content-Type':'application/json'});res.end(JSON.stringify({ok:true}));
      }finally{inFlight--;}
    },
    logout(req,res){sessions.delete(cookies(req)[sessionName]);res.writeHead(204,{'Set-Cookie':cookie('',0)});res.end();}
  };
}
