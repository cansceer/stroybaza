#!/usr/bin/env node
// Brief construction and completeness checks only; no automatic image assessment.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { resolveArticleSignature } from './article-signature.mjs';

const catalogUrl = new URL('../references/Сайт/Референсы/Статьи/articles.json', import.meta.url);
const catalog = JSON.parse(readFileSync(catalogUrl, 'utf8'));
const requiredChecks = Object.freeze([
  'sameScene', 'photorealistic', 'volumePreserved', 'texturePreserved',
  'lightingPreserved', 'accentScopePreserved', 'skinNeutral', 'targetHueSuitable',
]);
const preserve = Object.freeze([
  'сюжет и состав предметов', 'камера, кадрирование и перспектива',
  'геометрия и границы поверхностей', 'человек, поза, лицо и руки',
  'микрофактура и мелкие детали', 'яркость и локальный контраст',
  'тени, блики, отражения и фотографический объём',
]);
function nonempty(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Нужно заполнить ${field}`);
  return value.trim();
}

export function buildArticleBrief(input) {
  if (!input || !['generate', 'color-correct'].includes(input.mode)) throw new Error('mode: generate или color-correct');
  if (!['preview', 'body'].includes(input.role)) throw new Error('role: preview или body');
  const scene = nonempty(input.scene, 'scene');
  const group = nonempty(input.accent?.group, 'accent.group');
  const reason = nonempty(input.accent?.reason, 'accent.reason');
  if (!Array.isArray(input.accent?.surfaces) || !input.accent.surfaces.length) throw new Error('Нужны конкретные accent.surfaces');
  const surfaces = input.accent.surfaces.map(s => nonempty(s, 'accent.surfaces[]'));
  if (/вс[её]\s+(предмет|объект)|all\s+(objects|items|surfaces)|entire\s+(image|scene)/iu.test([group, ...surfaces].join(' '))) {
    throw new Error('Укажи смысловую группу и конкретные поверхности вместо окрашивания всего кадра');
  }
  if (!Array.isArray(input.referenceIds) || new Set(input.referenceIds).size !== input.referenceIds.length || input.referenceIds.length < 2 || input.referenceIds.length > 3) {
    throw new Error('Нужно 2–3 разных referenceIds, изображения которых открыты визуально');
  }
  const references = input.referenceIds.map(id => {
    const ref = catalog.references.find(r => r.id === id);
    if (!ref) throw new Error(`Неизвестный referenceId: ${id}`);
    return { ...ref, usage: 'Только обработка/свет/поведение материала; не переносить сюжет и логотип' };
  });
  const edit = input.mode === 'color-correct';
  const humanAction = input.humanAction === undefined ? null : nonempty(input.humanAction, 'humanAction');
  if(edit && humanAction) throw new Error('Добавление человека/смена действия не относится к коррекции цвета; менять сюжет нужно отдельной задачей.');
  const baseImage = edit ? nonempty(input.baseImage, 'baseImage — лучший реалистичный мастер') : null;
  if (!edit && input.baseImage) throw new Error('Для изменения существующего кадра выбери color-correct');
  const surfaceList = surfaces.join('; ');
  const palette = 'Приглушённый #B5AA7D — ориентир оттенка материала в средних тонах. Сохрани изменение цвета под светом, перепады яркости, тени, блики, отражения и микрофактуру. Не добивайся одинакового RGB по поверхности.';
  const prompt = edit
    ? `Редактируй приложенный исходный фотографический мастер. Единственная задача — скорректировать оттенок/насыщенность этих уже существующих поверхностей: ${surfaceList}. ${palette} Всё за их пределами сохранить. Сохрани ${preserve.join('; ')}. Не добавляй новые акцентные предметы.`
    : `Создай реалистичную фотографию: ${scene}. ${humanAction ? `Профессиональный редакционный кадр с человеком: ${humanAction}.` : 'Обычные строители и мастера в кадре разрешены, когда их действие раскрывает тему; не заменяй осмысленное действие повторным натюрмортом.'} Это обычные участники строительной сцены; утверждённые рекламные персонажи бренда не обязательны. Смысловая группа акцента: ${group}; только поверхности: ${surfaceList}. Основание выбора: ${reason}. ${palette} Окружение почти монохромное; люди и кожа нейтрально-серые. Реальные масштаб, перспектива и строительная операция, естественный свет и контактные тени.`;
  let finalization = {status:'pending-export', signatureRequired:false, nextStep:'Превью экспортировать без подписи после приёмки фотографии.'};
  if(input.role === 'body') {
    try {finalization={status:'pending-signature',signatureRequired:true,signature:resolveArticleSignature(input.domain),nextStep:'После кадрирования получить план article-signature.mjs, наложить полный SVG с городом и проверить конечный WebP. Мастер без подписи ещё не финал.'};}
    catch(error) {finalization={status:input.domain?'domain-unresolved':'domain-required',signatureRequired:true,error:error.message,nextStep:'Фотографию можно подготовить; финал заблокирован до определения подписи целевого домена.'};}
  }
  return {
    mode: input.mode, role: input.role, scene, humanAction, peoplePolicy:{ordinaryWorkersAllowed:true,brandCharactersRequired:false}, accent: { group, surfaces, reason },
    targetImage: baseImage, references,
    allowedChanges: edit ? [`только оттенок и насыщенность: ${surfaceList}`] : ['новый фотографический мастер по описанному сюжету'],
    preserve: edit ? [...preserve] : [],
    prompt: `${prompt} Референсы задают характер обработки. Результат остаётся фотографией. Без плоских заливок, векторизации, постеризации, наклеек, обводок, общего золотого фильтра, текста, рамок и логотипа.`,
    nextStep: edit ? 'Открой мастер и передай его редактору как целевое изображение; сравни до/после по всем requiredChecks.' : 'Открой референсы, создай и отдельно сохрани лучший реалистичный мастер до коррекции/экспорта.',
    finalization,
    onFailure: 'Отклонить правку и вернуться к лучшему реалистичному мастеру; не продолжать от испорченной версии.',
    exportPolicy: input.role === 'preview' ? 'Превью 1536×1024 WebP ≤500 КБ, без логотипа; экспорт после приёмки фотографии.' : 'Размер по роли в статье, WebP ≤300 КБ. Обязателен оригинальный полный SVG X + СТРОЙБАЗА + город целевого домена справа снизу. До его монтажа мастер не является финальным изображением статьи.',
    requiredChecks: [...requiredChecks],
    assessment: 'Ручной визуальный просмотр обязателен. Скрипт не редактирует и не анализирует пиксели.',
  };
}

export function reviewArticleEdit(checks) {
  const missing = requiredChecks.filter(k => typeof checks?.[k] !== 'boolean');
  const failed = requiredChecks.filter(k => checks?.[k] === false);
  const accepted = !missing.length && !failed.length;
  return {
    accepted, missing, failed,
    action: accepted ? 'Фотография принята. Можно переходить к экспорту/монтажу подписи по роли; для внутренней статьи без полного логотипа и города финал ещё не принят.' : 'Не принимать. Дополнить визуальную проверку или отклонить правку и вернуться к лучшему реалистичному мастеру.',
    assessment: 'Результат основан на предоставленных ручных оценках, не на анализе изображения.',
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const review = process.argv[2] === '--review';
    const path = process.argv[review ? 3 : 2];
    if (!path) throw new Error('Использование: article-image-brief.mjs [--review] input.json');
    const input = JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/u, ''));
    const result = review ? reviewArticleEdit(input) : buildArticleBrief(input);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (review && !result.accepted) process.exitCode = 2;
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
