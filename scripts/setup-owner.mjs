import {randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {passwordHash} from '../auth.mjs';
const email=process.argv[2];
if(!email||!email.includes('@'))throw Error('Usage: node scripts/setup-owner.mjs owner@example.com [--rotate]');
let env='';try{env=await readFile('.env','utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
if(/^OWNER_PASSWORD_HASH=.+$/m.test(env)&&!process.argv.includes('--rotate'))throw Error('Owner is already configured. Use --rotate deliberately to generate a new password.');
const password=randomBytes(24).toString('base64url');
const hash=await passwordHash(password);
env=env.split('\n').filter(x=>!/^OWNER_|^GOOGLE_/.test(x)).join('\n').trim();
if(!env.includes('APP_ORIGIN='))env+='\nAPP_ORIGIN=http://127.0.0.1:4317';
await writeFile('.env',env+'\nOWNER_EMAIL='+email+'\nOWNER_PASSWORD_HASH='+hash+'\n',{mode:0o600});
await writeFile('Owner-Access.txt','Gengar Archive — private owner access\n\nLogin: http://127.0.0.1:4317/login\nEmail: '+email+'\nPassword: '+password+'\n\nSave this password in your password manager. This file is private and excluded from Git.\nUse this website password, not your email-account password.\nRender needs OWNER_PASSWORD_HASH from .env, never the plain password.\nRotate: node scripts/setup-owner.mjs '+email+' --rotate, then restart the server.\n',{mode:0o600});
console.log('Owner login configured. Your generated password is in Owner-Access.txt. No credentials printed.');
