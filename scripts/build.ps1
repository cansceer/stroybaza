param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\dist')
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$skillDirectory = Join-Path $repositoryRoot 'chatgpt-skill'
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
$archivePath = Join-Path $resolvedOutput 'stroybaza-design.zip'

if (-not (Test-Path -LiteralPath (Join-Path $skillDirectory 'SKILL.md'))) {
    throw "Не найден chatgpt-skill/SKILL.md"
}

New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) {
    [IO.File]::Delete($archivePath)
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory(
    $skillDirectory,
    $archivePath,
    [IO.Compression.CompressionLevel]::Optimal,
    $true
)

$archive = Get-Item -LiteralPath $archivePath
if ($archive.Length -ge 25MB) {
    throw "Архив превышает лимит 25 МБ: $([math]::Round($archive.Length / 1MB, 2)) МБ"
}

Write-Output "Готово: $archivePath"
Write-Output "Размер: $([math]::Round($archive.Length / 1MB, 2)) МБ"
