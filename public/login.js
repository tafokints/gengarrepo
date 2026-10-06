const status=document.querySelector('#login-status');
try{
 const r=await fetch('/auth/session');if(!r.ok)throw Error('Sign-in is temporarily unavailable.');const s=await r.json();
 if(s.owner)location.replace('/admin');
 else {document.querySelector('#login-form').hidden=!s.configured;status.textContent=s.configured?'Only the collection owner can edit.':'Owner login is awaiting configuration. The collection is available in read-only mode.';}
}catch(e){status.textContent=e.message;}
document.querySelector('#login-form').onsubmit=async e=>{
 e.preventDefault();const button=document.querySelector('#login-submit');button.disabled=true;
 try{
  const r=await fetch('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.querySelector('#login-email').value.trim(),password:document.querySelector('#login-password').value})});
  const result=await r.json();if(!r.ok)throw Error(result.error||'Sign-in failed.');location.replace('/admin');
 }catch(e){status.textContent=e.message;}finally{document.querySelector('#login-password').value='';button.disabled=false;}
};
