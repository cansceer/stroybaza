param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$resolvedProject = [IO.Path]::GetFullPath($ProjectRoot)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pluginSource = Join-Path $resolvedProject '.agents\plugins\stroybaza-design'
$skillSource = Join-Path $resolvedProject 'Готовое\Общие материалы\Навык ChatGPT Стройбаза\stroybaza-design'
$pluginTarget = Join-Path $repositoryRoot 'codex-plugin'
$skillTarget = Join-Path $repositoryRoot 'chatgpt-skill'

foreach ($required in @(
    (Join-Path $pluginSource 'plugin.json'),
    (Join-Path $skillSource 'SKILL.md')
)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Не найден обязательный файл: $required"
    }
}

foreach ($target in @($pluginTarget, $skillTarget)) {
    $resolvedTarget = [IO.Path]::GetFullPath($target)
    if (-not $resolvedTarget.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Недопустимая целевая папка: $resolvedTarget"
    }
    if (Test-Path -LiteralPath $resolvedTarget) {
        Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
    }
    New-Item -ItemType Directory -Path $resolvedTarget | Out-Null
}

Copy-Item -Path (Join-Path $pluginSource '*') -Destination $pluginTarget -Recurse -Force
Copy-Item -Path (Join-Path $skillSource '*') -Destination $skillTarget -Recurse -Force

Write-Output 'Плагин Codex и навык ChatGPT обновлены из рабочей папки проекта.'
