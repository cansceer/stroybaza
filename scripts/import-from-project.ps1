#Requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)][string]$ProjectRoot,
    [string]$RepositoryRoot = (Join-Path $PSScriptRoot '..'),
    [switch]$Apply
)
. (Join-Path $PSScriptRoot 'lib.ps1')
$project = Assert-SafePath $ProjectRoot
$repo = Assert-SafePath $RepositoryRoot
$canonical = Join-Path $repo 'chatgpt-skill/references'
$roots = @(
    'Общие правила (алгоритм)/Инструкции','Общие правила (алгоритм)/Дизайн-код','Общие правила (алгоритм)/Ресурсы',
    'Сайт/Инструкции','Сайт/Дизайн-код','Сайт/Референсы',
    'Реклама/Инструкции','Реклама/Ресурсы','Реклама/Референсы',
    'Персонажи/Правила и инструкции','Персонажи/Референсы','Персонажи/Логотипы',
    'SMM/Инструкции','SMM/Instagram/Посты','SMM/Instagram/Ресурсы','SMM/Instagram/Сетка','SMM/Instagram/Сторис'
)
$changes = @()
foreach ($branch in $roots) {
    $source = Join-Path $project $branch
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { continue }
    foreach ($file in Get-RegularFiles $source) {
        if ($file.Extension.ToLowerInvariant() -notin @('.md','.svg','.webp','.png','.jpg','.jpeg','.ttf','.txt','.json')) { continue }
        $relative = "$branch/$(Get-Relative $source $file.FullName)"
        $target = Assert-Within (Join-Path $canonical $relative) $canonical
        if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or (Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath $target).Hash) {
            $changes += @{Source=$file.FullName;Relative=$relative}
        }
    }
}
if ($changes.Count -eq 0) { throw 'Нет изменённых правил/ресурсов в известных ветках проекта; пакеты не изменены.' }
Write-Output "Запланировано изменений: $($changes.Count). Отсутствующие ветки проекта сохраняются из репозитория."
$changes | ForEach-Object { Write-Output $_.Relative }
if (-not $Apply) { Write-Output 'Предпросмотр. Для проверенного импорта используйте -Apply; для проверки без записи — -Apply -WhatIf.'; return }
if (-not $PSCmdlet.ShouldProcess($repo,'Проверить импорт в staging, сохранить предыдущие пакеты и заменить поставку')) { return }

$id = (Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N')
$stage = Assert-Within (Join-Path $repo ".import-work/$id") $repo
$backup = Assert-Within (Join-Path $repo ".import-backups/$id") $repo
$null = New-Item -ItemType Directory -Path $stage
foreach ($package in @('chatgpt-skill','codex-plugin')) { Copy-RegularTree (Join-Path $repo $package) (Join-Path $stage $package) }
foreach ($change in $changes) {
    $target = Assert-Within (Join-Path $stage "chatgpt-skill/references/$($change.Relative)") $stage
    $null = New-Item -ItemType Directory -Path (Split-Path $target) -Force
    Copy-Item -LiteralPath $change.Source -Destination $target
}
& (Join-Path $PSScriptRoot 'sync-resources.ps1') -RepositoryRoot $stage
& (Join-Path $PSScriptRoot 'validate.ps1') -RepositoryRoot $stage
# Все проверки выполнены до замены. Каталоги и резервные копии на одном томе.
$null = New-Item -ItemType Directory -Path $backup
$completed = @()
try {
    foreach ($package in @('chatgpt-skill','codex-plugin')) {
        $current = Assert-Within (Join-Path $repo $package) $repo
        $saved = Assert-Within (Join-Path $backup $package) $backup
        $ready = Assert-Within (Join-Path $stage $package) $stage
        $null = @(Get-RegularFiles $current)
        $null = @(Get-RegularFiles $ready)
        Move-Item -LiteralPath $current -Destination $saved
        try { Move-Item -LiteralPath $ready -Destination $current }
        catch { Move-Item -LiteralPath $saved -Destination $current; throw }
        $completed += $package
    }
} catch {
    foreach ($package in $completed) {
        Move-Item -LiteralPath (Join-Path $repo $package) -Destination (Join-Path $stage "$package-rejected")
        Move-Item -LiteralPath (Join-Path $backup $package) -Destination (Join-Path $repo $package)
    }
    throw
}
Write-Output "Импорт проверен и применён. Предыдущая поставка сохранена: $backup. Файлы не удалялись."
