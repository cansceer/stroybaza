import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const index=JSON.parse(readFileSync(fileURLToPath(new URL('../references/Сайт/Референсы/Изображения товаров/catalog-index.json',import.meta.url)),'utf8'));
const args=process.argv.slice(2);
if (!(args.length===1 && args[0]==='--all') && !(args.length===2 && args[0]==='--id')) throw new Error('Usage: node check-product-reference.mjs --id catalog-001 | --all');
const allowed=new Set(['site-current','visually-current','product-source-only']);
const selected=args[0]==='--all' ? index.references.filter(r=>allowed.has(r.status)) : index.references.filter(r=>r.id===args[1]);
if (!selected.length) throw new Error('Unknown reference ID');
const cache=new Map();
async function check(reference) {
  if (!allowed.has(reference.status)) return {id:reference.id,status:'inactive-reference',reason:reference.reason};
  const source=reference.source;
  if (!cache.has(source.card)) cache.set(source.card,(async()=>{
    try {
      const page=await fetch(source.card,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'Stroybaza-reference-check/1.2'}});
      if (!page.ok) return {status:'unavailable',httpStatus:page.status};
      const html=await page.text();
      const meta=html.match(/<meta\b[^>]*property=["']og:image["'][^>]*>/iu)?.[0];
      const url=meta?.match(/\bcontent=["']([^"']+)["']/iu)?.[1];
      if (!url) return {status:'missing-main-image'};
      const imageUrl=new URL(url.replaceAll('&amp;','&'),page.url).href;
      const response=await fetch(imageUrl,{signal:AbortSignal.timeout(25000)});
      if (!response.ok) return {status:'image-unavailable',httpStatus:response.status,image:imageUrl};
      const data=Buffer.from(await response.arrayBuffer());
      return {status:'fetched',image:imageUrl,sha256:createHash('sha256').update(data).digest('hex')};
    } catch(error) {return {status:'unavailable',error:error.message};}
  })());
  const observed=await cache.get(source.card);
  return {id:reference.id,checkedAt:new Date().toISOString(),lastPackagedCheck:source.checkedAt,card:source.card,...observed,status:observed.status==='fetched' ? (observed.sha256===source.sha256 ? 'source-unchanged':'source-changed-needs-comparison') : observed.status};
}
const results=[];
for (let offset=0;offset<selected.length;offset+=3) results.push(...await Promise.all(selected.slice(offset,offset+3).map(check)));
console.log(JSON.stringify(results,null,2));
if (results.some(r=>r.status!=='source-unchanged')) process.exitCode=2;
