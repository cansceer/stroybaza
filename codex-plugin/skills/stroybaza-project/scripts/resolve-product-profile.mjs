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
  const p = normalize(product);
  if (/подвес|соединител|удлинител|краб/u.test(p)) return 'compact-accessory';
  if (/профил.*(?:направляющ|стоечн|потолочн)|(?:^|\s)(?:пн|пс|пп)(?:\s|$)/u.test(p)) return 'gkl-long-profile';
  if (/тисма|tisma/u.test(p)) return 'tisma-pack';
  if (/техноблок/u.test(p)) return 'rigid-rectangular-pack';
  if (/rockwool|роквул/u.test(p)) return 'mineral-wool-pack';
  if (/knauf.*tr\s*037|кнауф.*tr\s*037/u.test(p)) return 'wrapped-insulation-roll';
  return null;
}
function extractTarget(request) {
  const match = request.match(/(?:для\s+раздела|в\s+разделе|раздел)\s+[«"']?(.+?)(?=\s+(?:по\s+(?:визуальному\s+)?(?:формату|композиции)|в\s+(?:формате|стиле)|как\s+у|по\s+образцу)\s+|[.!?]|$)/iu);
  return match ? match[1].replace(/[«»"']/gu, '').trim() : null;
}
export function resolveRequest(request, {category, geometry, product, registry = loadRegistry()} = {}) {
  const text = normalize(request);
  const targetCategory = category || extractTarget(request);
  const explicit = text.match(/(?:по\s+(?:визуальному\s+)?(?:формату|композиции)|в\s+(?:формате|стиле)|как\s+у|по\s+образцу)\s+(.+?)(?=[,;.!?]|$)/u);
  const exportOnly = explicit && /^(?:webp|png|jpe?g|svg|pdf)(?:\s|$)/u.test(explicit[1]);
  let matches = [], selectedBy = 'catalog-by-sku';
  if (explicit && !exportOnly) {
    matches = candidates(explicit[1], registry.profiles);
    selectedBy = 'explicit-format';
    if (matches.length !== 1) return {status: matches.length ? 'ambiguous-format' : 'unknown-format', targetCategory, requestedFormat: explicit[1], candidates: matches.map(p => p.id), action: 'Уточнить только именованный формат; не заменять его похожим.'};
  } else {
    const target = normalize(targetCategory || '');
    matches = registry.profiles.filter(p => p.defaultCategories.some(c => normalize(c) === target));
    if (matches.length) selectedBy = 'exact-category';
    else if (!/профил|подвес|соединител|удлинител|краб/u.test(text) && target !== 'теплоизоляция') {
      matches = candidates(text, registry.profiles);
      if (matches.length === 1) selectedBy = 'named-product-family';
    }
  }
  if (matches.length !== 1) return {status: 'catalog-by-sku', targetCategory, profileId: null, action: 'Определить тип каждого SKU и выбрать его текущий активный карточный образец; не назначать один формат широкой смешанной категории.', output: registry.output};
  const p = matches[0];
  const kind = geometry || inferGeometry(product);
  const variants = kind ? p.variants.filter(v => v.geometryKinds.includes(kind)) : p.variants;
  return {
    status: kind && !variants.length ? 'sku-reference-required' : 'resolved',
    targetCategory, profileId: p.id, profile: p.label, version: p.version, passport: p.passport, selectedBy,
    geometryKind: kind, variantSelection: kind ? 'sku-geometry' : 'classify-each-sku',
    variants: variants.map(v => ({id:v.id, referenceId:v.referenceId, description:v.description})),
    exception: kind && !variants.length ? 'Для этого типа нет совместимого подварианта. Сохранить геометрию SKU, использовать его текущий предметный источник; не растягивать компактную деталь в длинномер.' : null,
    preserve: ['SKU geometry', 'nominal dimensions', 'material', 'perforation', 'manufacturer markings'],
    output: {...registry.output, ...(exportOnly ? {format:explicit[1].split(' ')[0].replace(/^jpg$/u,'jpeg'),explicitExport:explicit[1].split(' ')[0],alpha:!/^jpe?g(?:\s|$)/u.test(explicit[1])} : {})}
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
