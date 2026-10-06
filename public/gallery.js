const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let cards=[],current;
function showSide(side){
  $('#view-photo').src=current[side];$('#view-photo').alt=`${current.fields.name} — ${side}`;$('#view-zoom').href=current[side];
  for(const s of ['front','back']){$('#view-'+s).classList.toggle('active',s===side);$('#view-'+s).setAttribute('aria-pressed',String(s===side));}
}
function openCard(id){
  current=cards.find(c=>c.id===id);$('#view-title').textContent=current.fields.name;
  const labels={set:'Set',number:'Card number',year:'Year',edition:'Edition',variant:'Variant',language:'Language',language_code:'Printed language code',grader:'Grading company',grade:'Grade',designation:'Designation'};
  $('#view-details').innerHTML=Object.entries(labels).filter(([k])=>current.fields[k]).map(([k,label])=>`<dt>${label}</dt><dd>${esc(current.fields[k])}</dd>`).join('');
  showSide('front');$('#viewer').showModal();
}
function render(){
  const q=$('#search').value.toLowerCase(),set=$('#set-filter').value,grade=$('#grade-filter').value;
  const shown=cards.filter(c=>(!set||c.fields.set===set)&&(!grade||[c.fields.grader,c.fields.grade].join(' ')===grade)&&Object.values(c.fields).join(' ').toLowerCase().includes(q));
  $('#notice').textContent=`${shown.length} cards · More of the collection will appear as review is completed.`;
  $('#grid').innerHTML=shown.map(c=>`<button class="card" data-id="${c.id}"><img loading="lazy" src="${esc(c.front)}" alt="${esc(c.fields.name)} front"><div class="body"><span class="badge">${esc([c.fields.grader,c.fields.grade].filter(Boolean).join(' '))}</span><h3>${esc(c.fields.name)}</h3><p class="card-printing">${esc(c.fields.set)} · #${esc(c.fields.number)}</p><p class="card-variant">${esc([c.fields.edition,c.fields.variant].filter(Boolean).join(' · '))}</p><p>${esc(c.fields.year)} · View front & back ↗</p></div></button>`).join('')||'<p class="empty">No cards match these filters.</p>';
  $('#grid').querySelectorAll('[data-id]').forEach(el=>el.onclick=()=>openCard(el.dataset.id));
}
$('#view-close').onclick=()=>$('#viewer').close();$('#view-front').onclick=()=>showSide('front');$('#view-back').onclick=()=>showSide('back');
$('#search').oninput=render;$('#set-filter').onchange=render;$('#grade-filter').onchange=render;
try{
  const response=await fetch('/api/public');if(!response.ok)throw Error('Collection is temporarily unavailable.');cards=(await response.json()).cards;
  for(const [id,values] of [['set-filter',cards.map(c=>c.fields.set)],['grade-filter',cards.map(c=>[c.fields.grader,c.fields.grade].join(' '))]]){
    for(const value of [...new Set(values)].filter(Boolean).sort()){$('#'+id).add(new Option(value,value));}
  }render();
}catch(e){$('#notice').textContent=e.message;}
