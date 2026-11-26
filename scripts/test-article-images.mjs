import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildArticleBrief, reviewArticleEdit } from '../chatgpt-skill/scripts/article-image-brief.mjs';
import {resolveArticleSignature,buildArticleExportPlan,reviewArticleExport,signatureRegistryUrl} from '../chatgpt-skill/scripts/article-signature.mjs';
import {buildArticleRepairPlan,assertRepairPageUnchanged,reviewArticleRepairReadiness} from '../chatgpt-skill/scripts/article-repair-plan.mjs';

const valid = () => ({ mode: 'color-correct', role: 'preview', scene: 'Утепление фундамента', baseImage: '/work/best-photo.png', accent: { group: 'Плиты утеплителя', surfaces: ['торцы и верх плит'], reason: 'Главный материал статьи' }, referenceIds: ['foundation-insulation', 'metal-lintel'] });
test('color-only edit targets the supplied master and locks scene/light/detail', () => {
  const result = buildArticleBrief(valid());
  assert.equal(result.targetImage, '/work/best-photo.png');
  assert.equal(result.allowedChanges.length, 1);
  for (const token of ['камера', 'руки', 'микрофактура', 'тени', 'блики', 'объём']) assert.ok(result.preserve.join(' ').includes(token));
  assert.match(result.prompt, /одинакового RGB/u);
  assert.match(result.onFailure, /не продолжать от испорченной/u);
});
test('edit without a master cannot silently become a regeneration', () => {
  const input = valid(); delete input.baseImage;
  assert.throws(() => buildArticleBrief(input), /baseImage/u);
});
test('generation uses the same material palette but no edit target', () => {
  const input = valid(); input.mode = 'generate'; delete input.baseImage;
  const result = buildArticleBrief(input);
  assert.equal(result.targetImage, null);
  assert.match(result.prompt, /люди и кожа нейтрально-серые/u);
  assert.match(result.exportPolicy, /без логотипа/u);
});
test('existing master requires explicit edit mode', () => {
  const input = valid(); input.mode = 'generate';
  assert.throws(() => buildArticleBrief(input), /color-correct/u);
});
test('unknown mode or role is rejected', () => {
  assert.throws(() => buildArticleBrief({ ...valid(), mode: 'redesign' }));
  assert.throws(() => buildArticleBrief({ ...valid(), role: 'ad' }));
});
test('unnamed accent, empty surfaces or all-object recolouring is rejected', () => {
  for (const accent of [{}, { group: 'Материал', reason: 'Тема', surfaces: [] }, { group: 'Все предметы', reason: 'Фирменность', surfaces: ['все объекты'] }]) {
    assert.throws(() => buildArticleBrief({ ...valid(), accent }));
  }
});
test('two or three known distinct references required', () => {
  for (const referenceIds of [[], ['metal-lintel'], ['metal-lintel','metal-lintel'], ['missing','metal-lintel']]) assert.throws(() => buildArticleBrief({ ...valid(), referenceIds }));
});
const allGood = Object.fromEntries(buildArticleBrief(valid()).requiredChecks.map(k => [k, true]));
test('a suitable hue cannot compensate for lost volume, realism or accent control', () => {
  for (const key of Object.keys(allGood)) {
    const result = reviewArticleEdit({ ...allGood, [key]: false });
    assert.equal(result.accepted, false); assert.deepEqual(result.failed, [key]);
  }
});
test('missing/invalid manual judgments never count as a pass', () => {
  assert.equal(reviewArticleEdit({}).accepted, false);
  assert.equal(reviewArticleEdit({ ...allGood, texturePreserved: 'true' }).accepted, false);
});
test('all explicit positive manual judgments permit export only', () => {
  const result = reviewArticleEdit(allGood);
  assert.equal(result.accepted, true); assert.match(result.action, /экспорту/u);
});
test('packaged examples match their recorded hashes and use HTTPS source pages', () => {
  const url = new URL('../chatgpt-skill/references/Сайт/Референсы/Статьи/articles.json', import.meta.url);
  const catalog = JSON.parse(readFileSync(url, 'utf8'));
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(new Set(catalog.references.map(r => r.id)).size, catalog.references.length);
  for (const ref of catalog.references) {
    assert.match(ref.sourcePage, /^https:\/\/stroybaza-(?:samara|kaluga)\.ru\/blog\//u);
    assert.ok(ref.borrow.length > 30);
    assert.equal(createHash('sha256').update(readFileSync(new URL(ref.file, url))).digest('hex'), ref.sha256);
  }
});

test('a professional worker action is explicitly allowed and retained in generation',()=>{
 const input=valid();input.mode='generate';delete input.baseImage;input.humanAction='Строитель держит профиль ПС и показывает сечение';
 const r=buildArticleBrief(input);assert.equal(r.peoplePolicy.ordinaryWorkersAllowed,true);assert.equal(r.peoplePolicy.brandCharactersRequired,false);assert.ok(r.prompt.includes(input.humanAction));
});
test('colour correction cannot silently add a person or change their action',()=>{
 assert.throws(()=>buildArticleBrief({...valid(),humanAction:'Добавь строителя'}),/не относится к коррекции цвета/u);
});
test('article body photo without a domain can be prepared but is not a finished export',()=>{
 const r=buildArticleBrief({...valid(),role:'body'});
 assert.equal(r.finalization.status,'domain-required');assert.equal(r.finalization.signatureRequired,true);
});
test('a known target domain supplies the exact complete signature',()=>{
 const r=buildArticleBrief({...valid(),role:'body',domain:'https://stroybaza-kaluga.ru/blog/example/'});
 assert.equal(r.finalization.status,'pending-signature');assert.equal(r.finalization.signature.city,'Калуга');
 assert.equal(resolveArticleSignature('www.stroybaza-moscow.ru').city,'Москва');
 assert.equal(resolveArticleSignature('stroybaza-tveri.ru').city,'Тверь');
 assert.equal(resolveArticleSignature('stroybazaufa.ru').city,'Уфа');
});
test('an unknown domain never inherits the Moscow or similar-host signature',()=>{
 for(const domain of ['', 'stroybaza-kaluga.ru.example.org','stroybaza-unknown.ru']) assert.throws(()=>resolveArticleSignature(domain));
});
test('placement is calibrated on the observed full Kaluga signature',()=>{
 const r=buildArticleExportPlan({role:'body',domain:'stroybaza-kaluga.ru',width:1536,height:1024});
 assert.equal(r.signature.width,171);assert.equal(r.signature.x,1297);assert.equal(r.signature.y,785);assert.equal(r.signature.right,68);assert.equal(r.signature.bottom,68);assert.equal(r.signature.opacity,0.8);
 assert.equal(buildArticleExportPlan({role:'preview',width:1536,height:1024}).signatureRequired,false);
});
const exported=()=>({role:'body',domain:'stroybaza-kaluga.ru',signaturePresent:true,originalAssetUsed:true,cityLabel:'Калуга',signatureVisible:true,placementChecked:true,finalFileChecked:true});
test('accepting the photo does not accept an unbranded final image',()=>{
 assert.equal(reviewArticleEdit(allGood).accepted,true);
 assert.equal(reviewArticleExport({...exported(),signaturePresent:false}).accepted,false);
});
test('a wrong city, isolated X, invisible stamp or unchecked final file fails final review',()=>{
 for(const [key,value]of [['cityLabel','Москва'],['cityLabel',''],['originalAssetUsed',false],['signatureVisible',false],['placementChecked',false],['finalFileChecked',false]])assert.equal(reviewArticleExport({...exported(),[key]:value}).accepted,false);
 assert.equal(reviewArticleExport(exported()).accepted,true);
});
test('blog card previews stay unbranded while every article frame needs its signature',()=>{
 assert.equal(reviewArticleExport({role:'preview',signaturePresent:false,finalFileChecked:true}).accepted,true);
 assert.equal(reviewArticleExport({role:'preview',signaturePresent:true,finalFileChecked:true}).accepted,false);
 assert.equal([exported(),{...exported(),signaturePresent:false}].every(f=>reviewArticleExport(f).accepted),false);
});
test('all 28 signatures use original mark/wordmark paths and outlined city labels',()=>{
 const data=JSON.parse(readFileSync(signatureRegistryUrl,'utf8'));
 assert.equal(data.domains.length,28);assert.equal(new Set(data.domains.map(r=>r.domain)).size,28);
 const inner=p=>readFileSync(new URL(p,signatureRegistryUrl),'utf8').trim().replace(/^<svg\b[^>]*>/u,'').replace(/<\/svg>$/u,'').trim();
 for(const row of data.domains){
  const svg=readFileSync(new URL(row.asset,signatureRegistryUrl),'utf8');
  assert.equal(createHash('sha256').update(svg).digest('hex'),row.sha256);
  assert.ok(svg.includes(`<title>Стройбаза — ${row.city}</title>`));assert.ok(svg.includes(inner(data.sources.mark)));assert.ok(svg.includes(inner(data.sources.wordmark)));
  assert.match(svg,/id="article-city"/u);assert.doesNotMatch(svg,/<text\b|<image\b|@font-face/u);
 }
});
const repair=()=>({pageUrl:'https://stroybaza-kaluga.ru/blog/example/',intent:'replace',credentialState:'available',pageImages:[{id:'hero',role:'body',url:'/media/original.webp'}],imageId:'hero',pageSnapshotHash:'a'.repeat(64)});
test('a new participant is asked for their domain token before any image generation',()=>{
 const r=buildArticleRepairPlan({...repair(),credentialState:'missing',pageImages:[],imageId:undefined});
 assert.equal(r.status,'credentials-required');assert.equal(r.canGenerate,false);assert.equal(r.canPublish,false);assert.match(r.question,/API-токен/u);assert.match(r.question,/stroybaza-kaluga.ru/u);
});
test('access to a previous domain is not the default for a new participant',()=>{
 const input=repair();delete input.credentialState;
 assert.equal(buildArticleRepairPlan(input).status,'credentials-required');
});
test('inspection without a publication request does not require a token or authorize a write',()=>{
 const r=buildArticleRepairPlan({...repair(),intent:'inspect',credentialState:'missing'});
 assert.equal(r.status,'inspect-only');assert.equal(r.publicationAuthorized,false);assert.equal(r.canGenerate,false);assert.equal(r.canPublish,false);
});
test('an explicit replacement keeps original resource and limits publication to the selected page image',()=>{
 const r=buildArticleRepairPlan(repair());assert.equal(r.status,'ready-to-prepare');assert.equal(r.canGenerate,true);assert.equal(r.canPublish,false);
 assert.equal(r.scope,'one-selected-image-on-this-page');assert.equal(r.signature.city,'Калуга');assert.match(r.resourcePolicy,/без перезаписи/u);
});
test('missing or ambiguous target cannot fall back to the first image',()=>{
 for(const imageId of [undefined,'missing'])assert.equal(buildArticleRepairPlan({...repair(),imageId}).status,'target-required');
 const input=repair();input.pageImages.push({...input.pageImages[0]});assert.equal(buildArticleRepairPlan(input).status,'target-required');
});
test('publication requires a saved current snapshot and preserves concurrent edits',()=>{
 assert.equal(buildArticleRepairPlan({...repair(),pageSnapshotHash:undefined}).status,'snapshot-required');
 assert.equal(assertRepairPageUnchanged('a'.repeat(64),'a'.repeat(64)),true);
 assert.throws(()=>assertRepairPageUnchanged('a'.repeat(64),'b'.repeat(64)),/Страница изменилась/u);
});
test('repairing a catalog product does not add an article watermark',()=>{
 const input=repair();input.pageImages[0].role='product';assert.equal(buildArticleRepairPlan(input).signature,null);
});
test('an accepted branded export, access, new file and unchanged page allow the authorized write',()=>{
 const input={plan:buildArticleRepairPlan(repair()),credentialsVerified:true,exportReview:reviewArticleExport(exported()),uploadedResourceUrl:'/media/new-corrected.webp',currentPageHash:'a'.repeat(64)};
 assert.equal(reviewArticleRepairReadiness(input).canPublish,true);
 assert.equal(reviewArticleRepairReadiness({...input,exportReview:reviewArticleExport({...exported(),signaturePresent:false})}).canPublish,false);
 assert.equal(reviewArticleRepairReadiness({...input,currentPageHash:'b'.repeat(64)}).canPublish,false);
 assert.equal(reviewArticleRepairReadiness({...input,credentialsVerified:false}).canPublish,false);
 assert.equal(reviewArticleRepairReadiness({...input,uploadedResourceUrl:undefined}).canPublish,false);
});
test('a query-string change is not a new resource and inspection cannot become publication',()=>{
 const input={plan:buildArticleRepairPlan(repair()),credentialsVerified:true,exportReview:{accepted:true},uploadedResourceUrl:'/media/original.webp?v=2',currentPageHash:'a'.repeat(64)};
 assert.equal(reviewArticleRepairReadiness(input).canPublish,false);
 assert.equal(reviewArticleRepairReadiness({...input,plan:buildArticleRepairPlan({...repair(),intent:'inspect'}),uploadedResourceUrl:'/media/new.webp'}).canPublish,false);
});
