#Requires -Version 7.0
[CmdletBinding()]
param([string]$RepositoryRoot = (Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'lib.ps1')
$repo = Assert-SafePath $RepositoryRoot
$plugin = Join-Path $repo 'codex-plugin'
$canonical = Join-Path $repo 'chatgpt-skill'
$codexSkill = Join-Path $plugin 'skills/stroybaza-project'
$manifest = Get-Content -LiteralPath (Join-Path $plugin 'plugin.json') -Raw | ConvertFrom-Json
$compat = Get-Content -LiteralPath (Join-Path $plugin '.codex-plugin/plugin.json') -Raw | ConvertFrom-Json
if ($manifest.'$schema' -ne 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json') { throw 'Неверная схема plugin.json' }
if ($manifest.name -ne 'stroybaza-design' -or $manifest.name -ne $compat.name -or $manifest.version -ne $compat.version) { throw 'Идентичность/версия манифестов не совпадают' }
if ($manifest.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Неверная версия' }
$interface = $manifest.extensions.'com.openai'.interface
if ($interface.shortDescription.Length -gt 30) { throw 'shortDescription длиннее 30 символов' }
foreach ($field in @('displayName','shortDescription','category','logo','composerIcon')) {
    if ($interface.$field -ne $compat.interface.$field) { throw "Расхождение манифестов: $field" }
}
foreach ($field in @('logo', 'composerIcon')) {
    $path = Assert-Within (Join-Path $plugin $interface.$field) $plugin
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Нет иконки: $path" }
}
$required = @(
    'Общие правила (алгоритм)/Инструкции/Общие визуальные правила.md',
    'Общие правила (алгоритм)/Инструкции/Как поставить задачу по проекту.md',
    'Общие правила (алгоритм)/Дизайн-код/Брендбук проекта Стройбаза.md',
    'Общие правила (алгоритм)/Дизайн-код/Дизайн-код проекта Стройбаза.md',
    'Общие правила (алгоритм)/Ресурсы/Шрифты/Unbounded/Unbounded[wght].ttf',
    'Общие правила (алгоритм)/Ресурсы/Шрифты/Unbounded/OFL.txt',
    'Общие правила (алгоритм)/Ресурсы/Шрифты/Montserrat/Montserrat[wght].ttf',
    'Общие правила (алгоритм)/Ресурсы/Шрифты/Montserrat/OFL.txt',
    'Реклама/Инструкции/Правила рекламных креативов.md','Реклама/Ресурсы/variants.json',
    'SMM/Инструкции/Правила оформления SMM-постов и каруселей.md',
    'Сайт/Инструкции/Правила изображений товаров.md',
    'Сайт/Инструкции/Согласованные правила серии ОСБ и фанеры.md',
    'Сайт/Инструкции/Масштаб толщины листовых материалов.md',
    'Сайт/Референсы/Изображения товаров/Шаблоны компоновки/listovye-materialy/osb-three-kalevala-1250-12-mm.webp'
)
$linkCount = 0
foreach ($package in @($canonical, $plugin)) {
    foreach ($file in Get-RegularFiles $package) {
        if ($file.Extension -eq '.json') { $null = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json }
        if ($file.Extension -ne '.md') { continue }
        $text = Get-Content -LiteralPath $file.FullName -Raw
        if ($text -match 'Полный рекламный комплект по умолчанию — 10 JPEG|По умолчанию полный комплект — 10 JPEG|По умолчанию креатив делается в 5 размерах и в светлом/тёмном варианте') { throw "Устаревшее безусловное требование десяти вариантов: $($file.FullName)" }
        foreach ($match in [regex]::Matches($text, '\]\((?<target>[^\s)]+)\)')) {
            $url = $match.Groups['target'].Value.Trim('<','>')
            if ($url -match '^([a-zA-Z][\w+.-]*:|//|#)') { continue }
            $relative = [Uri]::UnescapeDataString(($url -split '[#?]', 2)[0])
            if (-not $relative) { continue }
            $target = Assert-Within (Join-Path $file.DirectoryName $relative) $package
            if (-not (Test-Path -LiteralPath $target)) { throw "Сломанная ссылка в $($file.FullName): $relative" }
            $linkCount++
        }
    }
}
foreach ($entry in @(@{Path=$canonical;Name='stroybaza-design'},@{Path=$codexSkill;Name='stroybaza-project'})) {
    $text = Get-Content -LiteralPath (Join-Path $entry.Path 'SKILL.md') -Raw
    if ($text -notmatch ('(?s)^---\r?\nname: '+[regex]::Escape($entry.Name)+'\r?\ndescription: [^\r\n]+\r?\n---')) { throw "Неверный frontmatter: $($entry.Path)" }
    foreach ($path in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $entry.Path "references/$path") -PathType Leaf)) { throw "Нет обязательного ресурса: $path" }
    }
    foreach ($branch in @('Персонажи/Референсы','Общие правила (алгоритм)/Дизайн-код/Логотипы')) {
        if (@(Get-RegularFiles (Join-Path $entry.Path "references/$branch")).Count -eq 0) { throw "Пустая библиотека: $branch" }
    }
    $yaml = Get-Content -LiteralPath (Join-Path $entry.Path 'agents/openai.yaml') -Raw
    if ($yaml -notmatch 'allow_implicit_invocation: true' -or $yaml -match '(?m)^\s+products:') { throw 'Неверная политика agents/openai.yaml' }
    $adRoot = Join-Path $entry.Path 'references/Реклама/Ресурсы'
    $sets = Get-Content -LiteralPath (Join-Path $adRoot 'variants.json') -Raw | ConvertFrom-Json
    if ($sets.schemaVersion -ne 1 -or @($sets.sets).Count -ne 2) { throw 'Неверная матрица рекламных вариантов' }
    foreach ($set in $sets.sets) {
        $expected = switch ($set.id) { 'product' {10} 'characters' {7} default {throw 'Неизвестный тип креатива'} }
        if ($set.defaultCount -ne $expected -or @($set.variants).Count -ne $expected) { throw "Неполная матрица: $($set.id)" }
        $keys = @()
        foreach ($variant in $set.variants) {
            $key = "$($variant.width)x$($variant.height)-$($variant.color)"
            if ($keys -contains $key) { throw "Повтор рекламного варианта: $key" }
            $keys += $key
            $path = Assert-Within (Join-Path $adRoot $variant.template) $adRoot
            if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Нет рекламного шаблона: $path" }
            [xml]$svg = Get-Content -LiteralPath $path -Raw
            if ($svg.DocumentElement.GetAttribute('width') -notmatch ('^'+$variant.width+'(?:px)?$') -or $svg.DocumentElement.GetAttribute('height') -notmatch ('^'+$variant.height+'(?:px)?$')) { throw "Неверный размер SVG: $path" }
        }
        $lightCount = @($set.variants | Where-Object color -eq 'светлый').Count
        if (($set.id -eq 'characters' -and $lightCount -ne 2) -or ($set.id -eq 'product' -and $lightCount -ne 5)) { throw 'Неверное число светлых шаблонов' }
    }
}
$resourceCount = 0
foreach ($branch in @('references','assets','agents','scripts')) {
    $source = Join-Path $canonical $branch
    $target = Join-Path $codexSkill $branch
    foreach ($file in Get-RegularFiles $source) {
        $relative = Get-Relative $source $file.FullName
        $copy = Join-Path $target $relative
        if (-not (Test-Path -LiteralPath $copy -PathType Leaf) -or (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash) { throw "Ресурсы поставок расходятся: $branch/$relative" }
        $resourceCount++
    }
    foreach ($file in Get-RegularFiles $target) {
        $relative = Get-Relative $target $file.FullName
        if ($branch -eq 'references' -and $relative -eq 'figma-editable.md') { continue }
        if (-not (Test-Path -LiteralPath (Join-Path $source $relative) -PathType Leaf)) { throw "Лишний ресурс Codex: $branch/$relative" }
    }
}
foreach ($script in Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' -File) {
    $parseErrors=$null; $tokens=$null
    $null = [Management.Automation.Language.Parser]::ParseFile($script.FullName,[ref]$tokens,[ref]$parseErrors)
    if ($parseErrors.Count) { throw "Ошибка синтаксиса: $($script.Name): $($parseErrors[0].Message)" }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Для проверки товарных форматов нужен Node.js 18+.' }
& node (Join-Path $PSScriptRoot 'validate-product-profiles.mjs') $repo
if ($LASTEXITCODE -ne 0) { throw 'Проверка товарных форматов не пройдена.' }
Write-Output "OK: версия $($manifest.version), $resourceCount одинаковых ресурсов, $linkCount локальных ссылок, 10 товарных и 7 персонажных вариантов."
