// Preflight and scope guards only. Actual CMS actions use the participant's configured access.
import {resolveArticleSignature} from './article-signature.mjs';

export function buildArticleRepairPlan({pageUrl, intent, credentialState='missing', pageImages=[], imageId, pageSnapshotHash}) {
  if(!['inspect','prepare','replace'].includes(intent)) throw new Error('Нужно определить фактическое поручение: inspect, prepare или replace. Цитата-пример не является командой публикации.');
  const page=new URL(pageUrl);
  if(!['https:','http:'].includes(page.protocol)) throw new Error('Нужен URL публичной страницы HTTP(S).');
  if(!['missing','available'].includes(credentialState)) throw new Error('credentialState: missing или available для этого участника и домена');
  const base={pageUrl:page.href,domain:page.hostname,intent,publicationAuthorized:intent==='replace',canPublish:false,scope:'one-selected-image-on-this-page'};
  if(intent==='replace' && credentialState==='missing') return {...base,status:'credentials-required',canGenerate:false,
    question:`Для замены изображения на ${page.hostname} нужен ваш API-токен доступа к этому сайту. Предоставьте токен или подключите готовый доступ.`,
    nextStep:'Спросить сразу, до генерации/подготовки замены. Использовать доступ этого участника к этому домену; не наследовать токен автора плагина.'};
  const matches=pageImages.filter(image=>image.id===imageId);
  if(!imageId || matches.length!==1) return {...base,status:'target-required',canGenerate:false,nextStep:'Открыть страницу и сопоставить изображение с описанием/скриншотом. Уточнить только цель, если после просмотра остаётся несколько подходящих изображений.'};
  const target=matches[0];
  if(!['body','preview','product','category-teaser','promotion','banner'].includes(target.role)) throw new Error('Нужно определить роль выбранного изображения по странице и его профильные правила.');
  if(typeof target.url!=='string' || !target.url.trim()) throw new Error('Нет URL выбранного исходного изображения.');
  const sourceImageUrl=new URL(target.url,page).href;
  if(!/^https?:/u.test(sourceImageUrl)) throw new Error('Нужен исходный HTTP(S) URL изображения.');
  if(intent==='replace' && !/^[a-f0-9]{64}$/iu.test(pageSnapshotHash||'')) return {...base,status:'snapshot-required',canGenerate:false,nextStep:'Прочитать актуальные данные страницы через разрешённый API и сохранить снимок для точечного изменения и возврата.'};
  const signature=target.role==='body'?resolveArticleSignature(page.href):null;
  return {...base,status:intent==='inspect'?'inspect-only':'ready-to-prepare',canGenerate:intent!=='inspect',target:{...target,url:sourceImageUrl},signature,pageSnapshotHash,
    steps:[
      'Сопоставить исходник и отображение; назвать дефект и неизменяемые свойства.',
      'Сохранить исходный файл и снимок текущего содержимого вне пакета плагина и Git.',
      'Исправить нужный фотослой/кадрирование, принять качество, сохранить чистый мастер.',
      'Проверить полную подпись и город для внутренних изображений; не создавать двойной знак.',
      intent==='replace'?'Через доступ этого участника загрузить новый отдельный ресурс, сохранив старый.':'Подготовить результат без загрузки и изменения страницы.',
      intent==='replace'?'Повторно прочитать страницу и проверить неизменность снимка; обновить только выбранное изображение и связанные варианты/ссылки.':'Выдать вывод или подготовленное изображение по фактическому поручению.',
      intent==='replace'?'Открыть публичную страницу, проверить реальную замену, подпись, город и соседний контент; сообщить результат.':'Не публиковать без явной команды замены.'
    ],
    resourcePolicy:'Новый URL, без перезаписи/удаления прежнего общего файла; не затрагивать другие страницы или домены.',
    accessPolicy:'До API сообщить домен и действия; после — результат. Секреты не выводить и не включать в плагин, Git или отчёт.'};
}

export function assertRepairPageUnchanged(expectedHash,currentHash) {
  if(!/^[a-f0-9]{64}$/iu.test(expectedHash||'') || !/^[a-f0-9]{64}$/iu.test(currentHash||'') || expectedHash.toLowerCase()!==currentHash.toLowerCase()) {
    throw new Error('Страница изменилась или нет достоверного снимка: перечитать и повторно применить только точечную замену, не затирать чужие изменения.');
  }
  return true;
}

export function reviewArticleRepairReadiness({plan,credentialsVerified,exportReview,uploadedResourceUrl,currentPageHash}) {
  const failed=[];
  if(plan?.intent!=='replace' || plan?.publicationAuthorized!==true || plan?.status!=='ready-to-prepare') failed.push('explicitReplacementPlan');
  if(credentialsVerified!==true) failed.push('credentialsVerified');
  if(exportReview?.accepted!==true) failed.push('finalExportAccepted');
  try {assertRepairPageUnchanged(plan?.pageSnapshotHash,currentPageHash);} catch {failed.push('currentPageSnapshot');}
  try {
    if(typeof uploadedResourceUrl!=='string' || !uploadedResourceUrl.trim()) throw new Error('Нет URL загрузки');
    const uploaded=new URL(uploadedResourceUrl,plan?.pageUrl), original=new URL(plan?.target?.url);
    if(!/^https?:$/u.test(uploaded.protocol) || uploaded.origin+uploaded.pathname===original.origin+original.pathname) failed.push('newSeparateResource');
  } catch {failed.push('newSeparateResource');}
  return {canPublish:failed.length===0,failed,
    nextStep:failed.length?'Не записывать страницу: завершить недостающую проверку, не обходить отказ.':'Выполнить разрешённую точечную замену и затем проверить фактический результат на публичной странице.',
    assessment:'Готовность к записи по предоставленным данным; не утверждение об уже выполненной публикации.'};
}
