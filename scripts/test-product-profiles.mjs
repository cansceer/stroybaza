import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRequest,inferGeometry} from '../chatgpt-skill/scripts/resolve-product-profile.mjs';
test('explicit format is separate from target category',()=>{
 const r=resolveRequest('Подготовь изображения для раздела Профили для ГКЛ по формату металлопроката');
 assert.equal(r.profileId,'metalloprokat');assert.equal(r.targetCategory,'Профили для ГКЛ');assert.equal(r.selectedBy,'explicit-format');assert.equal(r.variantSelection,'classify-each-sku');
});
test('GKL open profile gets open beams, not a closed tube',()=>{
 const r=resolveRequest('Профили для ГКЛ по формату металлопроката',{product:'Профиль направляющий ПН 3000х50х40 мм'});
 assert.deepEqual(r.variants.map(v=>v.id),['open-profiles']);
});
test('hanger cannot inherit long profile geometry',()=>{
 const r=resolveRequest('Профили для ГКЛ по формату металлопроката',{product:'Подвес прямой ПП 60х27'});
 assert.equal(r.status,'sku-reference-required');assert.equal(r.variants.length,0);
});
test('connector cannot become a tube',()=>assert.equal(resolveRequest('по формату металлопроката',{product:'Соединитель Краб'}).status,'sku-reference-required'));
test('GKL profiles do not inherit sheet defaults',()=>assert.equal(resolveRequest('Изображения для раздела Профили для ГКЛ').profileId,null));
test('explicit EPS overrides sheet category',()=>assert.equal(resolveRequest('Фанера по формату пенопласта',{category:'Фанера'}).profileId,'eps'));
test('EPS request resolves its own profile',()=>assert.equal(resolveRequest('Подготовь изображения пенопласта').profileId,'eps'));
test('XPS is separate from EPS and insulation',()=>assert.equal(resolveRequest('Изображения по формату XPS').profileId,'xps'));
test('leaf category default resolves without style phrase',()=>assert.equal(resolveRequest('Подготовь изображения',{category:'Наплавляемая кровля'}).profileId,'torch-on-roofing'));
test('TISMA retains its own variant',()=>assert.deepEqual(resolveRequest('По формату утеплителя',{product:'Кнауф Тисма S38MR'}).variants.map(v=>v.id),['tisma']));
test('generic thermal insulation category is mixed',()=>assert.equal(resolveRequest('Подготовь изображения для раздела Теплоизоляция').profileId,null));
test('unknown explicit format is not silently guessed',()=>assert.equal(resolveRequest('Профили ГКЛ по формату космоса').status,'unknown-format'));
test('ambiguous named formats require only format clarification',()=>assert.equal(resolveRequest('по формату утеплителя и пенопласта').status,'ambiguous-format'));
test('file format is not a composition name',()=>{
 const r=resolveRequest('Подготовь изображения для раздела Пенопласт в формате PNG');assert.equal(r.profileId,'eps');assert.equal(r.output.explicitExport,'png');assert.equal(r.output.format,'png');
});
test('style aliases are recognized',()=>{
 for(const q of ['как у металлопроката','по композиции металлопроката','в стиле металлопроката']) assert.equal(resolveRequest(q).profileId,'metalloprokat');
});
test('sheet profile does not merge metal sheet automatically',()=>assert.equal(resolveRequest('Подготовь изображения',{category:'Лист металлический'}).profileId,'metalloprokat'));
test('SKU geometry keeps nominal type',()=>{assert.equal(inferGeometry('Профиль стоечный ПС 3000х75х50'),'gkl-long-profile');assert.equal(inferGeometry('Удлинитель профиля'),'compact-accessory');});
