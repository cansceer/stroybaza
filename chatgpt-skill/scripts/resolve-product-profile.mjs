import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const registryPath = fileURLToPath(new URL('../references/Сайт/Форматы товаров/profiles.json', import.meta.url));
export function loadRegistry(path = registryPath) { return JSON.parse(readFileSync(path, 'utf8')); }
export function normalize(value = '') { return value.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[«»"']/gu, '').replace(/\s+/gu, ' ').trim(); }
function includesAlias(text, alias) {
  const escaped = normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'u').test(text);
}
function candidates(text, profiles) {
  return profiles.filter(p => p.aliases.some(alias => includesAlias(text, alias)));
}
export function inferGeometry(product = '') {
  const full = normalize(product);
  // A material in "для ГКЛ/фанеры" is not the geometry of the sold item.
  const p = full.split(/\s+для\s+/u)[0];
  // Explicit container type takes precedence over brand or material names.
  if (/канистр/u.test(p) || /(?:^|\s)в\s+канистр/u.test(full)) return 'canister';
  if (/ведр/u.test(p) || /(?:^|\s)в\s+ведр/u.test(full)) return 'bucket';
  if (/картридж|туб[аеуы]|баллон/u.test(p)) return 'cartridge';
  if (/подвес|соединител|удлинител|краб/u.test(p)) return 'compact-accessory';
  if (/саморез|шуруп|дюбель|анкер/u.test(p)) return 'compact-fastener';
  if (/профил.*(?:направляющ|стоечн|потолочн)|(?:направляющ|стоечн|потолочн).*профил|(?:^|[^\p{L}])(?:пн|пс|пп)(?=$|[^\p{L}])/u.test(p)) return 'gkl-long-profile';
  if (/труб[аыу]|профильная труба/u.test(p)) return 'hollow-profile';
  if (/швеллер/u.test(p)) return 'open-profile';
  if (/уголок/u.test(p)) return 'angle-profile';
  if (/арматур/u.test(p)) return 'rebar';
  if (/полоса/u.test(p)) return 'flat-strip';
  if (/сетк[аиу]/u.test(p)) return 'mesh';
  if (/лист.*(?:металл|сталь|стальн|оцинк|нержав)/u.test(p)) return 'metal-sheet';
  if (/профил/u.test(p)) return null;
  if (/фанер/u.test(p)) return 'plywood-sheet';
  if (/(?:^|[^\p{L}])(?:осб|osb)(?=$|[^\p{L}])/u.test(p)) return 'wood-sheet';
  if (/(?:^|[^\p{L}])цсп(?=$|[^\p{L}])/u.test(p)) return 'cement-sheet';
  if (/(?:^|[^\p{L}])дсп(?=$|[^\p{L}])/u.test(p)) return 'particle-sheet';
  if (/гипсокартон|(?:^|[^\p{L}])гкл(?=$|[^\p{L}])/u.test(p)) return 'gypsum-sheet';
  if (/xps|экструзионн/u.test(p)) return /пачк|упаковк/u.test(p) ? 'wrapped-xps-pack' : null;
  if (/пенопласт|плита\s+ппс/u.test(p)) return 'eps-plate';
  if (/мешок|мешке/u.test(p)) return 'mix-bag';
  if (/тисма|tisma/u.test(p)) return 'tisma-pack';
  if (/техноблок/u.test(p)) return 'rigid-rectangular-pack';
  if (/rockwool|роквул/u.test(p)) return 'mineral-wool-pack';
  if (/knauf.*tr\s*037|кнауф.*tr\s*037/u.test(p)) return 'wrapped-insulation-roll';
  if (/(?:knauf|кнауф).*mini|(?:knauf|кнауф).*мини/u.test(p)) return 'soft-rectangular-pack';
  if (/рулон/u.test(p) && /битум|наплавляем/u.test(p)) return 'bitumen-roll';
  return null;
}
const compositionCue = /(?:по\s+(?:визуальному\s+)?(?:формату|композиции)|в\s+(?:формате|стиле)|как\s+у|по\s+образцу|(?:без|вместо)\s+(?:формата|композиции|стиля|образца)|(?<![\p{L}\p{N}])формат\s*[:—-]?)\s+/gu;
const fileFormat = /(?:^|[^\p{L}\p{N}])(?<format>webp|png|jpe?g|svg|pdf)(?=$|[^\p{L}\p{N}])/gu;
function isNegative(prefix, suffix = '') {
  return /(?:^|[^\p{L}])(?:не|без|вместо)\s+(?:(?:по|в)\s+)?(?:(?:визуальному\s+)?формат[\p{L}]*\s+)?$/u.test(prefix)
    || /^\s+(?:не\s+(?:нужен|нужно|используй|надо)|исключи)/u.test(suffix);
}
function extractExport(text, defaults) {
  const requested = [];
  for (const match of text.matchAll(fileFormat)) {
    const offset = match.index + match[0].lastIndexOf(match.groups.format);
    const prefix = text.slice(0, offset);
    if (isNegative(prefix, text.slice(offset + match.groups.format.length))) continue;
    // A source JPEG is not an instruction to export another JPEG.
    if (/(?:из|исходник|оригинал|референс)\s+(?:в\s+)?$/u.test(prefix) || /исходн[\p{L}]*\s+формат[\p{L}]*\s+$/u.test(prefix)) continue;
    const format = match.groups.format.replace(/^jpg$/u, 'jpeg');
    if (!requested.includes(format)) requested.push(format);
  }
  if (requested.length > 1) {
    const exports = requested.map(format => ({...defaults, format, alpha: format === 'jpeg' ? false : ['png','webp'].includes(format) ? true : null, ...(['svg','pdf'].includes(format) ? {requiresAdaptation:true} : {})}));
    const ambiguous = /(?:^|\s)или(?:\s|$)/u.test(text);
    return {output: {...defaults, format:null, alpha:null, requestedExports:requested, exports, multipleExports:!ambiguous}, ambiguous};
  }
  if (!requested.length) return {output: {...defaults}, ambiguous: false};
  const format = requested[0];
  return {output: {...defaults, format, explicitExport: format, alpha: format === 'jpeg' ? false : ['png','webp'].includes(format) ? true : null, ...(['svg','pdf'].includes(format) ? {requiresAdaptation: true} : {})}, ambiguous: false};
}
function extractCompositions(text, profiles) {
  const cues = [...text.matchAll(compositionCue)];
  const positive = [], negative = [], unknown = [];
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i], start = cue.index + cue[0].length;
    const argument = text.slice(start, cues[i+1]?.index ?? text.length).split(/[,;.!?]|\s+для\s+раздела/u)[0].trim();
    if (/^(?:(?:файла|экспорта|выдачи|изображения)\s+)?(?:webp|png|jpe?g|svg|pdf)(?=$|\s)/u.test(argument)) continue;
    const found = candidates(argument, profiles);
    if (/^(?:без|вместо)\s/u.test(cue[0]) || isNegative(text.slice(0, cue.index)) || /\s+не\s+(?:нужно|нужен|надо|использовать|используй)(?:\s|$)/u.test(argument)) negative.push(...found);
    else if (found.length) positive.push(...found);
    else unknown.push(argument);
  }
  // Also exclude a directly negated bare family, e.g. "без пенопласта".
  for (const profile of profiles) for (const alias of profile.aliases) {
    const escaped = normalize(alias).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'gu');
    for (const match of text.matchAll(pattern)) {
      const offset = match.index + match[0].lastIndexOf(normalize(alias));
      if (isNegative(text.slice(0, offset))) negative.push(profile);
    }
  }
  return {positive: [...new Set(positive)], negative: [...new Set(negative)], unknown};
}
function extractTarget(request) {
  const match = request.match(/(?:для\s+раздела|в\s+разделе|раздел)\s*:?\s+[«"']?(.+?)(?=\s+(?:по\s+(?:визуальному\s+)?(?:формату|композиции)|в\s+(?:формате|стиле)|как\s+у|по\s+образцу)\s+|[,;.!?]|$)/iu);
  return match ? match[1].replace(/[«»"']/gu, '').replace(/\s+(?:не|а|вместо)\s*$/iu, '').trim() : null;
}
export function resolveRequest(request, {category, geometry, product, registry = loadRegistry()} = {}) {
  const text = normalize(request);
  const targetCategory = category || extractTarget(request);
  const {output, ambiguous: ambiguousExport} = extractExport(text, registry.output);
  const explicit = extractCompositions(text, registry.profiles);
  const base = {targetCategory, output, readyForGeneration:false, variants:[]};
  let matches = [], selectedBy = 'catalog-by-sku';
  if (explicit.positive.length || explicit.negative.length || explicit.unknown.length) {
    matches = explicit.positive;
    selectedBy = 'explicit-format';
    if (explicit.unknown.length || matches.length !== 1 || explicit.negative.includes(matches[0])) return {
      ...base, status: explicit.unknown.length ? 'unknown-format' : matches.length > 1 ? 'ambiguous-format' : 'format-clarification-required',
      requestedFormat: explicit.unknown.join('; ') || null, candidates: matches.map(p => p.id), excludedFormats: explicit.negative.map(p => p.id),
      action: 'Уточнить только положительно выбранный именованный формат; не выбирать отрицаемое семейство.'
    };
  } else {
    const target = normalize(targetCategory || '');
    matches = registry.profiles.filter(p => p.defaultCategories.some(c => normalize(c) === target));
    if (matches.length) selectedBy = 'exact-category';
    else if (!/профил|подвес|соединител|удлинител|краб/u.test(text) && target !== 'теплоизоляция') {
      matches = candidates(text, registry.profiles);
      if (matches.length === 1) selectedBy = 'named-product-family';
    }
  }
  if (matches.length !== 1) return {...base, status: ambiguousExport ? 'ambiguous-export' : 'catalog-by-sku', profileId: null, action: ambiguousExport ? 'Уточнить состав экспорта; не подменять несколько форматов одним.' : 'Определить тип каждого SKU и выбрать его текущий активный карточный образец; не назначать один формат широкой смешанной категории.'};
  const p = matches[0];
  const kind = geometry || inferGeometry(product);
  const variants = kind ? p.variants.filter(v => v.geometryKinds.includes(kind)) : [];
  const status = ambiguousExport ? 'ambiguous-export' : !kind ? (product ? 'geometry-required' : 'family-selected') : !variants.length ? 'sku-reference-required' : 'resolved';
  const describe = v => ({id:v.id, referenceId:v.referenceId, description:v.description});
  return {
    ...base, status, readyForGeneration: status === 'resolved',
    profileId: p.id, profile: p.label, version: p.version, passport: p.passport, selectedBy,
    geometryKind: kind, variantSelection: kind ? 'sku-geometry' : 'classify-each-sku',
    variants: status === 'resolved' ? variants.map(describe) : [],
    candidateVariants: kind ? variants.map(describe) : p.variants.map(describe),
    action: status === 'resolved' ? 'Открыть паспорт и источник точного SKU, затем готовить изображение и проверить результат.' : status === 'ambiguous-export' ? 'Уточнить только состав экспорта; выбранная композиция сохранена.' : !kind ? 'Семейство выбрано. Определить геометрию каждого SKU по карточке; кандидаты ещё не являются выбранными вариантами.' : 'Открыть предметный образец этого SKU; совместимого подварианта в семействе нет.',
    exception: kind && !variants.length ? 'Для этого типа нет совместимого подварианта. Сохранить геометрию SKU, использовать его текущий предметный источник; не растягивать компактную деталь в длинномер.' : null,
    preserve: ['SKU geometry', 'nominal dimensions', 'material', 'perforation', 'manufacturer markings'],
    excludedFormats: explicit.negative.map(profile => profile.id)
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), options = {}; let request = '';
  for (let i=0;i<args.length;i++) {
    if (!['--request','--category','--geometry','--product'].includes(args[i]) || !args[i+1]) throw new Error('Usage: node resolve-product-profile.mjs --request "..." [--category "..."] [--product "..."] [--geometry kind]');
    const key = args[i++].slice(2); if (key === 'request') request = args[i]; else options[key] = args[i];
  }
  if (!request) throw new Error('--request is required');
  console.log(JSON.stringify(resolveRequest(request,options),null,2));
}
