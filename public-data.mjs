const visibleFields=['name','year','set','number','language','language_code','set_code','edition','variant','grader','grade','designation'];
export function publicCatalog(catalog,reviews){
  const photos=new Map(catalog.photos.map(p=>[p.id,p]));
  return {cards:catalog.cards.map(c=>reviews[c.id]||c).filter(c=>c.status==='ready'&&c.front&&c.back&&photos.has(c.front)&&photos.has(c.back)).map(c=>({
    id:c.id,fields:Object.fromEntries(visibleFields.map(k=>[k,c.fields[k]||''])),
    front:photos.get(c.front).preview,back:photos.get(c.back).preview
  }))};
}
