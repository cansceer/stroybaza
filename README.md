# Stroybaza Design

Публичный репозиторий плагина Codex и навыка ChatGPT для проекта «Стройбаза»: сайт, реклама и SMM.

## Структура

- `codex-plugin/` — устанавливаемый плагин Codex.
- `chatgpt-skill/` — загружаемый навык ChatGPT со встроенными правилами, референсами и ресурсами.
- `scripts/build.ps1` — собирает ZIP навыка ChatGPT и проверяет лимит 25 МБ.
- `scripts/import-from-project.ps1` — обновляет содержимое репозитория из рабочей папки `stroybaza`.

## Обновление

1. Внести и проверить правки в рабочей папке проекта.
2. Запустить:

   ```powershell
   ./scripts/import-from-project.ps1 -ProjectRoot "C:\путь\к\stroybaza"
   ./scripts/build.ps1
   ```

3. Проверить изменения через `git diff`, создать коммит и отправить его в `main`.
4. ZIP для загрузки в ChatGPT появится в `dist/stroybaza-design.zip`. Папка `dist/` не хранится в Git.

## Источник истины

Git-репозиторий хранит опубликованную версию плагина и навыка. Локальная рабочая папка используется для подготовки материалов, затем изменения импортируются и фиксируются отдельным коммитом.

## Публикация

Ветка `main` содержит актуальную опубликованную версию. Архив для загрузки в ChatGPT собирается из этой версии и не коммитится повторно как бинарный файл.

## Установка плагина Codex из GitHub

```powershell
codex plugin marketplace add cansceer/stroybaza --ref main
codex plugin add stroybaza-design@stroybaza
```

Для получения следующей опубликованной версии:

```powershell
codex plugin marketplace upgrade stroybaza
```
