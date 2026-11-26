// Plans for an obligatory post-production step; never asks an image generator to paint a logo.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export const signatureRegistryUrl = new URL('../references/Сайт/Референсы/Статьи/Подписи/signatures.json', import.meta.url);
const registry = JSON.parse(readFileSync(signatureRegistryUrl, 'utf8'));

export function resolveArticleSignature(domain) {
  if (typeof domain !== 'string' || !domain.trim()) throw new Error('Нужен целевой домен статьи; не подставлять город по умолчанию.');
  let host;
  try {host = new URL(domain.includes('://') ? domain : `https://${domain}`).hostname.toLowerCase().replace(/^www\./u,'');}
  catch {throw new Error('Неверный домен статьи.');}
  const entry = registry.domains.find(r => r.domain === host);
  if (!entry) throw new Error(`Нет подтверждённой подписи для ${host}; уточнить город и обновить соответствие домена, не угадывать его.`);
  return {...entry, assetPath:fileURLToPath(new URL(entry.asset, signatureRegistryUrl)), opacity:registry.opacity};
}

export function buildArticleExportPlan({role, domain, width, height}) {
  if (!['preview','body'].includes(role)) throw new Error('role: preview или body');
  if (![width,height].every(v => Number.isInteger(v) && v > 0)) throw new Error('Нужны фактические положительные width/height после кадрирования.');
  if (role === 'preview') return {role, width, height, signatureRequired:false, signature:null, completeOnlyAfter:'Проверить конечный WebP превью без подписи.'};
  const signature = resolveArticleSignature(domain);
  // Calibrated on the 1536×1024 Kaluga reference: ~170 px, ~68 px insets.
  // Use the short edge for differently shaped approved article frames, then inspect readability.
  const edge = Math.min(width,height), size = Math.round(edge / 6), inset = Math.round(edge / 15);
  return {role, width, height, signatureRequired:true,
    signature:{...signature, width:size, height:size, x:width-inset-size, y:height-inset-size, right:inset, bottom:inset},
    completeOnlyAfter:'Наложить весь оригинальный SVG X + СТРОЙБАЗА + город, затем открыть и проверить именно конечный WebP каждого кадра.',
    assessment:'Размеры — стартовая калибровка по референсу; читаемость, контраст и сохранность важных деталей проверяются визуально.'};
}

export function reviewArticleExport(input) {
  if (!input || !['preview','body'].includes(input.role)) throw new Error('role: preview или body');
  const failed=[];
  if (input.finalFileChecked !== true) failed.push('finalFileChecked');
  if (input.role === 'preview') {
    if (input.signaturePresent !== false) failed.push('previewMustHaveNoSignature');
  } else {
    const expected=resolveArticleSignature(input.domain);
    for (const key of ['signaturePresent','originalAssetUsed','signatureVisible','placementChecked']) if(input[key] !== true) failed.push(key);
    if(input.cityLabel !== expected.city) failed.push('cityLabel');
  }
  return {accepted:failed.length===0, failed,
    action:failed.length ? 'Финал не принят: исправить монтаж/подпись и проверить конечный экспорт, фотографию не перегенерировать.' : 'Конечный файл проверен; повторить приёмку для каждого файла комплекта.',
    assessment:'Проверка полноты ручной оценки, не распознавание логотипа или города по пикселям.'};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const review=process.argv[2]==='--review';
    const path=process.argv[review?3:2];
    if(!path) throw new Error('Использование: article-signature.mjs [--review] input.json');
    const input=JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/u,''));
    const result=review?reviewArticleExport(input):buildArticleExportPlan(input);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(review&&!result.accepted) process.exitCode=2;
  } catch(error) {process.stderr.write(error.message+'\n');process.exitCode=1;}
}
