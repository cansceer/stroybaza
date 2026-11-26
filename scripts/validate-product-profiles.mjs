import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,relative,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const repo=process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../',import.meta.url));
const root=resolve(repo,'chatgpt-skill/references');
const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
const index=read('Сайт/Референсы/Изображения товаров/catalog-index.json');
const registry=read('Сайт/Форматы товаров/profiles.json');
assert.equal(index.schemaVersion,1);assert.equal(registry.schemaVersion,1);
for(const id of ['metalloprokat','insulation','sheet-materials','torch-on-roofing','eps','xps','building-mixes'])assert(registry.profiles.some(p=>p.id===id),`Missing core profile ${id}`);
assert.equal(registry.output.maxBytes,300000);
const productRules=readFileSync(resolve(root,'Сайт/Инструкции/Правила изображений товаров.md'),'utf8');
assert(productRules.includes('profiles.json'),'Product instructions must use the named profile registry');
for(const skill of ['chatgpt-skill','codex-plugin/skills/stroybaza-project'])assert(readFileSync(resolve(repo,skill,'SKILL.md'),'utf8').includes('Сайт/Форматы товаров/profiles.json'),'Skill must route product requests to named profiles');
const refs=new Map();
for(const ref of index.references){
 assert(!refs.has(ref.id),'Duplicate reference ID');refs.set(ref.id,ref);
 const p=resolve(root,ref.image);assert(!relative(root,p).startsWith('..'+sep),'Escaping image path');
 assert(existsSync(p),`Missing source file ${ref.id}`);
 assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),ref.packagedSha256,`Reference bytes changed: ${ref.id}`);
 assert(ref.geometry.layoutBounds.length===4);assert(ref.geometry.layoutAlphaThreshold===8);
 if(['site-current','visually-current','product-source-only'].includes(ref.status)){
  assert(ref.source.card.startsWith('https://stroybaza-'));assert.match(ref.source.sha256,/^[a-f0-9]{64}$/);assert(ref.source.checkedAt);
 }else{assert(['retired-unavailable','unverified-source'].includes(ref.status));assert(ref.image.includes('/Архив товарных референсов/'));}
}
const seen=new Set();
for(const p of registry.profiles){
 assert(!seen.has(p.id));seen.add(p.id);assert(p.aliases.length);assert(p.version===registry.revision);assert(existsSync(resolve(root,p.passport)));
 for(const v of p.variants){const ref=refs.get(v.referenceId);assert(ref,`Unknown source ${v.referenceId}`);assert(['site-current','visually-current'].includes(ref.status),`Inactive style source ${v.referenceId}`);assert.deepEqual(v.layout,ref.geometry);assert(v.geometryKinds.length);}
}
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]);}
const activeRoot=resolve(root,'Сайт/Референсы/Изображения товаров');
const files=walk(activeRoot).filter(p=>/\.(webp|png|jpe?g)$/i.test(p));
for(const p of files)assert([...refs.values()].some(r=>resolve(root,r.image)===p),`Unindexed image ${p}`);
console.log(`Product profiles OK: ${registry.profiles.length} profiles, ${registry.profiles.reduce((s,p)=>s+p.variants.length,0)} variants, ${index.references.length} indexed images; inactive sources excluded.`);
