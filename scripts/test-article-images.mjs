import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { buildArticleBrief, reviewArticleEdit } from '../chatgpt-skill/scripts/article-image-brief.mjs';

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
    assert.match(ref.sourcePage, /^https:\/\/stroybaza-samara\.ru\/blog\//u);
    assert.ok(ref.borrow.length > 30);
    assert.equal(createHash('sha256').update(readFileSync(new URL(ref.file, url))).digest('hex'), ref.sha256);
  }
});
