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

test('negative composition is excluded and positive correction wins',()=>{
 const r=resolveRequest('Подготовь изображения для раздела Профили для ГКЛ не по формату пенопласта, а по формату металлопроката');
 assert.equal(r.profileId,'metalloprokat');assert.equal(r.targetCategory,'Профили для ГКЛ');assert.deepEqual(r.excludedFormats,['eps']);
});
test('negation without a positive format cannot silently use the rejected family',()=>{
 for(const request of ['не по формату пенопласта','без формата пенопласта','без композиции пенопласта','без пенопласта','вместо формата пенопласта','формат пенопласта не нужен']){
  const r=resolveRequest(request,{category:'Пенопласт'});
  assert.equal(r.status,'format-clarification-required');assert.notEqual(r.profileId,'eps');
 }
});
test('contradictory positive formats require clarification',()=>{
 assert.equal(resolveRequest('По формату утеплителя, по формату пенопласта').status,'ambiguous-format');
});
test('the same format requested and rejected is not treated as resolved',()=>{
 assert.equal(resolveRequest('не по формату пенопласта, а по формату пенопласта').status,'format-clarification-required');
});
test('all permutations preserve composition and explicit PNG export',()=>{
 for(const request of [
  'Подготовь изображения для раздела Профили для ГКЛ по формату металлопроката в формате PNG',
  'Подготовь изображения для раздела Профили для ГКЛ в формате PNG по формату металлопроката',
  'В формате PNG подготовь изображения для раздела Профили для ГКЛ по формату металлопроката',
  'По формату металлопроката для раздела Профили для ГКЛ, сохрани PNG',
  'Профили для ГКЛ, формат: металлопроката, PNG',
 ]){
  const r=resolveRequest(request);assert.equal(r.profileId,'metalloprokat',request);assert.equal(r.output.format,'png',request);assert.equal(r.output.alpha,true);
 }
});
test('explicit export survives unknown composition and SKU fallback',()=>{
 for(const request of ['ГКЛ по формату космоса, сохрани PNG','Для раздела Профили для ГКЛ в формате PNG']){
  assert.equal(resolveRequest(request).output.format,'png');
 }
});
test('source file type does not become a requested output type',()=>{
 const r=resolveRequest('Используй исходник JPEG, сохрани PNG по формату пенопласта');
 assert.equal(r.profileId,'eps');assert.equal(r.output.format,'png');
});
test('negative export is ignored and JPEG disables alpha',()=>{
 const r=resolveRequest('По формату пенопласта, не PNG, а JPEG');
 assert.equal(r.output.format,'jpeg');assert.equal(r.output.alpha,false);
});
test('an explicit pair of output formats is a set, not an unnecessary question',()=>{
 const r=resolveRequest('По формату пенопласта, PNG и WebP',{geometry:'eps-plate'});
 assert.equal(r.status,'resolved');assert.equal(r.profileId,'eps');assert.equal(r.readyForGeneration,true);
 assert.deepEqual(r.output.requestedExports,['png','webp']);assert.equal(r.output.format,null);
 assert.equal(r.output.multipleExports,true);assert.deepEqual(r.output.exports.map(v=>v.format),['png','webp']);
});
test('alternative output formats require only an export choice',()=>{
 const r=resolveRequest('По формату пенопласта, PNG или WebP',{geometry:'eps-plate'});
 assert.equal(r.status,'ambiguous-export');assert.equal(r.profileId,'eps');assert.equal(r.readyForGeneration,false);
 assert.deepEqual(r.output.requestedExports,['png','webp']);assert.equal(r.output.multipleExports,false);
});
test('canisters and buckets cannot inherit a bag composition',()=>{
 for(const product of ['Грунтовка глубокого проникновения в канистре 10 л','Шпаклевка готовая в ведре 5 кг']){
  const r=resolveRequest('Подготовь изображения по формату строительных смесей',{product});
  assert.equal(r.status,'sku-reference-required');assert.equal(r.readyForGeneration,false);assert.deepEqual(r.variants,[]);
 }
});
test('container type has priority over a familiar material name',()=>{
 assert.equal(inferGeometry('Шпатлевка для фанеры в ведре'),'bucket');
});
test('unknown product geometry never picks the only variant by default',()=>{
 const r=resolveRequest('По формату строительных смесей',{product:'Новый товар без данных об упаковке'});
 assert.equal(r.status,'geometry-required');assert.equal(r.readyForGeneration,false);assert.deepEqual(r.variants,[]);assert.equal(r.candidateVariants.length,1);
});
test('family selection is a plan, not a ready SKU variant',()=>{
 const r=resolveRequest('По формату металлопроката');
 assert.equal(r.status,'family-selected');assert.equal(r.readyForGeneration,false);assert.deepEqual(r.variants,[]);assert.ok(r.candidateVariants.length>1);
});
test('an explicitly identified bag can select its compatible variant',()=>{
 const r=resolveRequest('По формату строительных смесей',{product:'Штукатурка UNIS Теплон мешок 30 кг'});
 assert.equal(r.status,'resolved');assert.equal(r.readyForGeneration,true);assert.deepEqual(r.variants.map(v=>v.id),['mix-bag']);
});
test('a new pack name does not become the Knauf MINI pack automatically',()=>{
 const r=resolveRequest('По формату утеплителя',{product:'Утеплитель KNAUF NORD 50 мм'});
 assert.equal(r.status,'geometry-required');assert.deepEqual(r.variants,[]);
});
test('known SKU geometries choose their own compatible variants',()=>{
 for(const [product,format,variant] of [
  ['Фанера ФК 1525х1525х12 мм','листовых материалов','plywood'],
  ['ЦСП 1200х3200х10 мм','листовых материалов','csp'],
  ['Труба профильная 20х20х1.5 мм','металлопроката','hollow-profiles'],
  ['Профиль ПП60х27','металлопроката','open-profiles'],
 ])assert.deepEqual(resolveRequest(`По формату ${format}`,{product}).variants.map(v=>v.id),[variant]);
});
test('unsupported target export remains explicit and marked for adaptation',()=>{
 const r=resolveRequest('По формату пенопласта, сохрани PDF');
 assert.equal(r.output.format,'pdf');assert.equal(r.output.requiresAdaptation,true);assert.equal(r.output.alpha,null);
});
test('file format phrasing is not an unknown named composition',()=>{
 const r=resolveRequest('Формат файла PNG, по формату металлопроката');
 assert.equal(r.profileId,'metalloprokat');assert.equal(r.output.format,'png');
});
test('an input format described separately does not produce an extra export',()=>{
 const r=resolveRequest('Исходный формат JPEG, сохрани PNG по формату пенопласта');
 assert.equal(r.output.format,'png');assert.equal(r.output.multipleExports,undefined);
});
test('a referenced substrate cannot turn a profile, screw or glue into a sheet',()=>{
 for(const product of ['Профиль для ГКЛ','Саморез для ГКЛ','Клей для фанеры']){
  const r=resolveRequest('По формату листовых материалов',{product});
  assert.equal(r.readyForGeneration,false,product);assert.deepEqual(r.variants,[],product);
 }
});
test('a compatible physical item still resolves when its purpose mentions another material',()=>{
 const r=resolveRequest('По формату металлопроката',{product:'Профиль направляющий ПН50 для гипсокартона'});
 assert.deepEqual(r.variants.map(v=>v.id),['open-profiles']);
 assert.equal(inferGeometry('Шпатлевка для фанеры в ведре'),'bucket');
 assert.equal(inferGeometry('Крепление для ведра'),null);
});
