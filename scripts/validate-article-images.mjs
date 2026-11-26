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
    if (!ref.sourcePage?.startsWith('https://stroybaza-samara.ru/blog/') || !ref.borrow || !ref.accentGroup || !(ref.width > 0 && ref.height > 0)) throw new Error(`Неполный паспорт: ${ref.id}`);
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== ref.sha256) throw new Error(`Хеш примера статьи изменён: ${ref.id}`);
  }
  for (const id of ['wet-coating','metal-lintel','foundation-insulation','floor-reflections']) if (!ids.has(id)) throw new Error(`Нет фотографического примера: ${id}`);
  const main = readFileSync(resolve(base, 'SKILL.md'), 'utf8');
  if (!main.includes('Фотографии статей — генерация и коррекция цвета.md')) throw new Error('Основной навык не подключает процесс фотографической коррекции');
}
process.stdout.write('Article references OK: both packages, 4 photographic examples, hashes and workflow routing.\n');
