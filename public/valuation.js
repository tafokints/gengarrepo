// Sale evidence is not a valuation. Never mix currencies or replace the owner estimate.
export function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function summarizeSales(comps,now=new Date()){
 const today=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
 const seen=new Set();let duplicates=0,invalid=0;
 const sales=[];
 for(const c of comps){
  const price=Number(c.price),currency=String(c.currency||'').toUpperCase();
  if(!validDate(c.date)||!Number.isFinite(price)||price<=0||!/^[A-Z]{3}$/.test(currency)){invalid++;continue;}
  const age=Math.floor((today-Date.parse(c.date+'T00:00:00Z'))/86400000);
  if(age<0){invalid++;continue;}
  const key=c.sale_id?`sale:${c.sale_id}`:`${c.url}|${c.date}|${price}|${currency}`;
  if(seen.has(key)){duplicates++;continue;}seen.add(key);
  sales.push({...c,price,currency,age,recent:age<=180});
 }
 const groups={};
 for(const c of sales.filter(c=>c.match==='exact'&&c.recent)){
  (groups[c.currency]??=[]).push(c.price);
 }
 return {sales:sales.sort((a,b)=>b.date.localeCompare(a.date)),duplicates,invalid,groups:Object.entries(groups).map(([currency,prices])=>({currency,count:prices.length,low:Math.min(...prices),high:Math.max(...prices)}))};
}
