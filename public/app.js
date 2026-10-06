import {summarizeSales} from './valuation.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let authSession;
let db,mode='cards',current,side='front',dirty=false;
const fields={name:'Card name',year:'Year',set:'Set / label set text',number:'Card number',language:'Language',set_code:'Printed set code',language_code:'Printed language code',edition:'Edition',variant:'Variant / finish',grader:'Grading company',grade:'Grade',designation:'Grade designation',cert:'Certification number',qualifiers:'Qualifiers',subgrades:'Subgrades (if present)',label_notes:'Other label details / copyright'};
const photo=id=>db.photos.find(p=>p.id===id);
$('#filter').insertAdjacentHTML('beforeend','<option value="unpaired">Unpaired photos</option>');
const cards=()=>db.cards.map(c=>db.reviews[c.id]||c);
$('#comps').insertAdjacentHTML('beforebegin','<section id="market-summary" class="market-summary" aria-label="Sale evidence summary"></section>');
$('#pair-reason').insertAdjacentHTML('afterend','<div id="extra-photos"></div>');
function marketSummary(comps){
 const result=summarizeSales(comps);
 const money=(v,c)=>new Intl.NumberFormat('en-US',{style:'currency',currency:c}).format(v);
 const ranges=result.groups.map(g=>`<p><strong>${esc(money(g.low,g.currency))}${g.low!==g.high?' – '+esc(money(g.high,g.currency)):''}</strong> · ${g.count} exact-match sale${g.count===1?'':'s'} in the past 180 days (${esc(g.currency)})</p>`).join('');
 $('#market-summary').innerHTML=(ranges||'<p>No recent exact-match sale evidence yet.</p>')+'<p class="muted">Observed sale prices, not a market estimate. Shipping and fees may differ. Your estimate stays separate.</p>'+result.sales.map(c=>`<p class="sale-row"><a href="${esc(c.url)}" target="_blank" rel="noreferrer">${esc(c.date)} ↗</a> <strong>${esc(money(c.price,c.currency))}</strong> <span class="badge">${c.age>180?'older sale':c.match==='exact'?'exact match':'context only'}</span></p>`).join('');
}
function toast(text){$('#toast').textContent=text;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',2800);}
function render(){
 if(!db)return;
 const items=cards(), ready=items.filter(c=>c.status==='ready').length;
 $('#stats').innerHTML=[[db.source_files,'Source files'],[db.unique_photos,'Unique photos'],[db.exact_duplicate_files,'Exact duplicate uploads'],[ready,'Reviewed card records']].map(([n,t])=>`<div class="stat"><strong>${n}</strong><span>${t}</span></div>`).join('');
 $('#drive').href=db.source_folder;
 const query=$('#search').value.toLowerCase(),filter=$('#filter').value;
 $('#filter').disabled=mode!=='cards';
 let shown;
 if(mode==='cards'){
  shown=items.filter(c=>((filter==='all'&&c.status!=='excluded')||c.status===filter||(filter==='unpaired'&&c.status!=='excluded'&&!(c.front&&c.back)))&&JSON.stringify([c.fields,c.front&&photo(c.front)?.filename,c.back&&photo(c.back)?.filename]).toLowerCase().includes(query));
  $('#notice').textContent=`${shown.length} draft or reviewed records · ${items.filter(c=>c.status==='needs_review').length} need review. Pair suggestions are unverified; record count is not a confirmed card count.`;
  $('#grid').innerHTML=shown.map(c=>{const p=photo(c.front||c.back||c.photo_ids[0]);return `<button class="card" data-id="${c.id}">${p?`<img loading="lazy" src="${p.preview}" alt="${esc(p.filename)}">`:''}<div class="body"><span class="badge ${c.status}">${esc(c.status.replaceAll('_',' '))}</span><h3>${esc(c.fields.name||'Unidentified card / photo')}</h3><p class="card-printing">${esc(c.fields.set||'Set needs review')} · ${esc(c.fields.number?'#'+c.fields.number:'Number needs review')}</p><p class="card-variant">${esc([c.fields.edition,c.fields.variant].filter(Boolean).join(' · ')||'Variant needs review')}</p><p>${esc([c.fields.year,c.fields.grader,c.fields.grade].filter(Boolean).join(' · ')||'Label needs review')}</p><p>${esc(p?.filename)}${c.back&&c.front?' · 2 sides':' · 1 side'}</p></div></button>`;}).join('');
 }else{
  shown=db.photos.filter(p=>(mode!=='duplicates'||p.sources.length>1)&&JSON.stringify([p.filename,p.fields]).toLowerCase().includes(query));
  $('#notice').textContent=mode==='duplicates'?'Identical SHA-256 file hashes. All original Drive uploads are retained; nothing was deleted.':`${shown.length} unique photos · Click to inspect a preview. Original names and source links are retained in the export.`;
  $('#grid').innerHTML=shown.map(p=>`<a class="card" href="${p.preview}" target="_blank"><img loading="lazy" src="${p.preview}" alt="${esc(p.filename)}"><div class="body"><span class="badge">${esc(p.fields.side)}</span><h3>${esc(p.filename)}</h3><p>${p.sources.length} source file${p.sources.length===1?'':'s'}</p><p>${esc(p.flags.join(' · '))}</p></div></a>`).join('');
 }
 if(!shown.length)$('#grid').innerHTML='<p class="empty">No matching records.</p>';
 $('#grid').querySelectorAll('button[data-id]').forEach(el=>el.onclick=()=>openCard(el.dataset.id));
}
function showPhoto(){
 const id=side==='back'?$('#back').value:$('#front').value;const p=photo(id);
 const src=p?(side==='label'?p.label:p.preview):'';
 $('#main-photo').hidden=!p;if(p){$('#main-photo').src=src;$('#main-photo').alt=p.filename;$('#zoom').href=src;$('#source').href=p.sources[0].url;}
 $('#source').hidden=!p;
 $('#ocr').textContent=p?p.ocr.map(x=>`${Math.round(x.score*100)}%  ${x.text}`).join('\n'):'No photo selected';
 document.querySelectorAll('[data-side]').forEach(b=>b.classList.toggle('active',b.dataset.side===side));
}
function compHtml(c={}){return `<div class="comp"><label>Sale source URL<input data-comp="url" type="url" value="${esc(c.url)}" placeholder="https://…"></label><div class="field-grid"><label>Sold price<input data-comp="price" type="number" min="0.01" step="0.01" value="${esc(c.price)}"></label><label>Currency<input data-comp="currency" value="${esc(c.currency||'USD')}" maxlength="3"></label><label>Sale date<input data-comp="date" type="date" value="${esc(c.date)}"></label><label>Match quality<select data-comp="match"><option value="exact" ${c.match==='exact'?'selected':''}>Exact printing / grader / grade</option><option value="context" ${c.match!=='exact'?'selected':''}>Context only / uncertain</option></select></label></div><label>Grade, variant, fees, shipping & source notes<textarea data-comp="notes" rows="2">${esc(c.notes)}</textarea></label><button type="button" class="remove-comp">Remove draft evidence</button></div>`;}
function bindComps(){$$('.remove-comp').forEach(b=>b.onclick=()=>{b.closest('.comp').remove();dirty=true;});}
function $$(s){return [...document.querySelectorAll(s)];}
function openCard(id){
 current=structuredClone(cards().find(c=>c.id===id));dirty=false;side='front';
 $('#record-title').textContent=current.id;
 const opts='<option value="">Not assigned</option>'+db.photos.map(p=>`<option value="${p.id}">${esc(p.filename)} · ${esc(p.fields.side)}</option>`).join('');
 $('#front').innerHTML=opts;$('#back').innerHTML=opts;$('#front').value=current.front;$('#back').value=current.back;
 $('#metadata').innerHTML=Object.entries(fields).map(([key,title])=>`<label>${title}<input data-field="${key}" value="${esc(current.fields[key])}" autocomplete="off"></label>`).join('');
 for(const key of ['notes','estimate','estimate_date','estimate_notes','status'])$('#'+key).value=current[key]??'';
 $('#pair-reason').textContent=current.pair_reason;$('#save-error').textContent='';
 $('#extra-photos').innerHTML=(current.photo_ids||[]).filter(id=>id!==current.front&&id!==current.back).map(id=>{const p=photo(id);return p?`<a href="${p.preview}" target="_blank">Additional photo: ${esc(p.filename)} ↗</a>`:'';}).join('<br>');
 marketSummary(current.comps);
 $('#comps').innerHTML=current.comps.map(compHtml).join('');$$('#comps .comp').forEach((el,i)=>el.dataset.original=JSON.stringify(current.comps[i]));bindComps();showPhoto();$('#editor').showModal();
}
$('#card-form').oninput=()=>dirty=true;
$('#close').onclick=()=>{if(!dirty||confirm('Discard unsaved changes to this record?'))$('#editor').close();};
$('#editor').addEventListener('cancel',e=>{if(dirty&&!confirm('Discard unsaved changes to this record?'))e.preventDefault();});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
$('#front').onchange=$('#back').onchange=()=>{dirty=true;showPhoto();};
$$('[data-side]').forEach(b=>b.onclick=()=>{side=b.dataset.side;showPhoto();});
$('#add-comp').onclick=()=>{$('#comps').insertAdjacentHTML('beforeend',compHtml());bindComps();dirty=true;};
$('#card-form').onsubmit=async e=>{
 e.preventDefault();$('#save-error').textContent='';$('#save').disabled=true;
 const record=structuredClone(current);
 record.front=$('#front').value;record.back=$('#back').value;
 $$('[data-field]').forEach(el=>record.fields[el.dataset.field]=el.value.trim());
 for(const key of ['notes','estimate_date','estimate_notes','status'])record[key]=$('#'+key).value;
 record.estimate=$('#estimate').value===''?null:Number($('#estimate').value);
 record.comps=$$('#comps .comp').map(el=>({...JSON.parse(el.dataset.original||'{}'),...Object.fromEntries([...el.querySelectorAll('[data-comp]')].map(input=>[input.dataset.comp,input.value]))}));
 record.reviewed_at=new Date().toISOString();
 // Validate the complete effective catalog, so assignment conflicts cannot hide in unedited drafts.
 const proposed={...db.reviews,[record.id]:record};
 try{const r=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':authSession.csrf,'If-Match':db.revision},body:JSON.stringify(proposed)});const result=await r.json();if(!r.ok)throw Error(result.error);db.reviews=proposed;db.revision=result.revision;dirty=false;$('#editor').close();render();toast('Record saved locally');}
 catch(err){$('#save-error').textContent=err.message;}finally{$('#save').disabled=false;}
};
$$('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;$$('[data-mode]').forEach(x=>x.classList.toggle('active',x===b));render();});
$('#search').oninput=render;$('#filter').onchange=render;
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({...db,cards:cards()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='gengar-catalog.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
try{authSession=await (await fetch('/auth/session')).json();if(!authSession.owner){location.replace('/login');throw Error('Owner sign-in required');}const r=await fetch('/api/catalog');if(!r.ok)throw Error('Catalog is not ready. Run the photo processing script first.');db=await r.json();render();}catch(e){$('#notice').textContent=e.message;}

document.querySelector('#logout').onclick=async()=>{if(dirty&&!confirm('Discard unsaved changes and sign out?'))return;const r=await fetch('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':authSession.csrf}});if(r.ok){dirty=false;location.href='/';}else toast('Could not sign out. Try again.');};
