import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(process.argv[2] || fileURLToPath(new URL('..', import.meta.url)));
for (const skill of ['chatgpt-skill', 'codex-plugin/skills/stroybaza-project']) {
  const base = resolve(repo, skill);
  const dir = resolve(base, 'references/Сайт/Референсы/Статьи');
  const catalog = JSON.parse(readFileSync(resolve(dir, 'articles.json'), 'utf8'));
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.references)) throw new Error('Неверный каталог примеров статей');
  const ids = new Set();
  for (const ref of catalog.references) {
    if (!ref.id || ids.has(ref.id)) throw new Error('Повтор/пустой id примера статьи');
    ids.add(ref.id);
    const file = resolve(dir, ref.file);
    if (!file.startsWith(base + sep)) throw new Error('Пример статьи вне навыка');
    if (!/^https:\/\/stroybaza-(?:samara|kaluga)\.ru\/blog\//u.test(ref.sourcePage||'') || !ref.borrow || !ref.accentGroup || !(ref.width > 0 && ref.height > 0)) throw new Error(`Неполный паспорт: ${ref.id}`);
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== ref.sha256) throw new Error(`Хеш примера статьи изменён: ${ref.id}`);
  }
  for (const id of ['wet-coating','metal-lintel','foundation-insulation','floor-reflections','roof-hand-detail','roof-worker-action']) if (!ids.has(id)) throw new Error(`Нет фотографического примера: ${id}`);
  const signatureDir=resolve(dir,'Подписи');
  const signatures=JSON.parse(readFileSync(resolve(signatureDir,'signatures.json'),'utf8'));
  if(signatures.schemaVersion!==1 || signatures.domains.length!==28 || new Set(signatures.domains.map(r=>r.domain)).size!==28) throw new Error('Неверная карта подписей доменов');
  for(const row of signatures.domains){
    const file=resolve(signatureDir,row.asset);
    if(!file.startsWith(signatureDir+sep)) throw new Error('Подпись вне своей папки');
    const svg=readFileSync(file,'utf8');
    if(createHash('sha256').update(svg).digest('hex')!==row.sha256 || !svg.includes(`<title>Стройбаза — ${row.city}</title>`) || !svg.includes('id="article-city"') || /<text\b|<image\b/u.test(svg)) throw new Error(`Повреждена переносимая подпись: ${row.domain}`);
  }
  const main = readFileSync(resolve(base, 'SKILL.md'), 'utf8');
  if (!main.includes('Фотографии статей — генерация и коррекция цвета.md')) throw new Error('Основной навык не подключает процесс фотографической коррекции');
  if (!main.includes('Подпись изображений статей.md') || !main.includes('Исправление изображения на опубликованной странице.md')) throw new Error('Основной навык не подключает подпись или сценарий замены');
}
process.stdout.write('Article references OK: both packages, 6 photographic examples, 28 city signatures, hashes and workflow routing.\n');
