#Requires -Version 7.0
[CmdletBinding()]
param([Parameter(Mandatory)][string]$ScratchDirectory)
. (Join-Path $PSScriptRoot 'lib.ps1')
$repo = Assert-SafePath (Join-Path $PSScriptRoot '..')
$scratch = Assert-SafePath $ScratchDirectory
foreach ($package in @('chatgpt-skill','codex-plugin')) {
    $source = Join-Path $repo $package
    if ($scratch -eq $source -or $scratch.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Тесты должны находиться вне пакета' }
}
$run = Join-Path $scratch ('tests-'+[guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $run -Force
$fixture = Join-Path $run 'repository'
foreach ($package in @('chatgpt-skill','codex-plugin')) { Copy-RegularTree (Join-Path $repo $package) (Join-Path $fixture $package) }
$validator = Join-Path $PSScriptRoot 'validate.ps1'
$importer = Join-Path $PSScriptRoot 'import-from-project.ps1'
$script:passed = 0
function Assert-True([bool]$Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
function Expect-Failure([scriptblock]$Action,[string]$Pattern,[string]$Label) {
    $message = $null
    try { & $Action | Out-Null } catch { $message = $_.Exception.Message }
    if (-not $message -or $message -notmatch $Pattern) { throw "Не обнаружена ошибка '$Label': $message" }
    $script:passed++
    Write-Output "PASS: $Label"
}
& $validator -RepositoryRoot $fixture
$script:passed++

$rules = 'references/Общие правила (алгоритм)/Инструкции/Общие визуальные правила.md'
$canonicalRule = Join-Path $fixture "chatgpt-skill/$rules"
$originalRule = [IO.File]::ReadAllText($canonicalRule)
try {
    [IO.File]::AppendAllText($canonicalRule,"`n[Несуществующий референс](missing.png)`n")
    Expect-Failure { & $validator -RepositoryRoot $fixture } 'Сломанная ссылка' 'broken reference is rejected'
} finally { [IO.File]::WriteAllText($canonicalRule,$originalRule,[Text.UTF8Encoding]::new($false)) }

$template = Join-Path $fixture 'chatgpt-skill/references/Реклама/Ресурсы/Креатив с персонажами/1080x607-светлый-фон-паттерн-знак.svg'
$held = Join-Path $run 'held-template.svg'
Move-Item -LiteralPath $template -Destination $held
try { Expect-Failure { & $validator -RepositoryRoot $fixture } 'Нет рекламного шаблона' 'missing approved template is rejected' }
finally { Move-Item -LiteralPath $held -Destination $template }

$codexRule = Join-Path $fixture "codex-plugin/skills/stroybaza-project/$rules"
$originalCopy = [IO.File]::ReadAllText($codexRule)
try {
    [IO.File]::AppendAllText($codexRule,"`nResource drift.`n")
    Expect-Failure { & $validator -RepositoryRoot $fixture } 'Ресурсы поставок расходятся' 'divergent packaged resources are rejected'
} finally { [IO.File]::WriteAllText($codexRule,$originalCopy,[Text.UTF8Encoding]::new($false)) }

$partial = Join-Path $run 'partial-project'
$emptyProject = Join-Path $run 'empty-project'
$null = New-Item -ItemType Directory -Path $emptyProject
$before = (Get-FileHash -LiteralPath $canonicalRule).Hash
Expect-Failure { & $importer -ProjectRoot $emptyProject -RepositoryRoot $fixture -Apply } 'Нет изменённых' 'empty import does not replace packages'
Assert-True ((Get-FileHash -LiteralPath $canonicalRule).Hash -eq $before) 'Пустой импорт изменил правила'

$localRule = Join-Path $partial 'Общие правила (алгоритм)/Инструкции/Общие визуальные правила.md'
$null = New-Item -ItemType Directory -Path (Split-Path $localRule) -Force
[IO.File]::WriteAllText($localRule,$originalRule+"`nПроверка частичного импорта.`n",[Text.UTF8Encoding]::new($false))
& $importer -ProjectRoot $partial -RepositoryRoot $fixture | Out-Null
& $importer -ProjectRoot $partial -RepositoryRoot $fixture -Apply -WhatIf | Out-Null
Assert-True ((Get-FileHash -LiteralPath $canonicalRule).Hash -eq $before) 'Предпросмотр изменил правила'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixture '.import-work'))) 'WhatIf создал staging'
$script:passed++
Write-Output 'PASS: preview and WhatIf perform no writes'

[IO.File]::AppendAllText($localRule,"`n[Отсутствующий файл](missing-import.webp)`n")
Expect-Failure { & $importer -ProjectRoot $partial -RepositoryRoot $fixture -Apply } 'Сломанная ссылка' 'invalid staged import leaves installed packages untouched'
Assert-True ((Get-FileHash -LiteralPath $canonicalRule).Hash -eq $before) 'Ошибочный staging изменил текущую поставку'
Assert-True (-not (Test-Path -LiteralPath (Join-Path $fixture '.import-backups'))) 'Поставки заменены до завершения проверок'
[IO.File]::WriteAllText($localRule,$originalRule+"`nПроверка частичного импорта.`n",[Text.UTF8Encoding]::new($false))

& $importer -ProjectRoot $partial -RepositoryRoot $fixture -Apply
& $validator -RepositoryRoot $fixture
Assert-True ([IO.File]::ReadAllText($canonicalRule).Contains('Проверка частичного импорта.')) 'Частичный импорт не применён'
Assert-True (Test-Path -LiteralPath (Join-Path $fixture 'chatgpt-skill/references/Реклама/Ресурсы/variants.json')) 'Утеряна отсутствующая в проекте ветка рекламы'
$backups = @(Get-ChildItem -LiteralPath (Join-Path $fixture '.import-backups') -Directory)
Assert-True ($backups.Count -eq 1) 'Нет сохранённой предыдущей поставки'
$backupRule = Join-Path $backups[0].FullName "chatgpt-skill/$rules"
Assert-True ((Get-FileHash -LiteralPath $backupRule).Hash -eq $before) 'Предыдущая версия правил не сохранена'
$script:passed++
Write-Output 'PASS: partial import preserves other branches and prior packages'
Write-Output "PASS: $script:passed проверок. Тестовые материалы сохранены для ручного удаления: $run"
