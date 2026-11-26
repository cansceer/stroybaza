#Requires -Version 7.0
[CmdletBinding()]
param([string]$OutputDirectory = (Join-Path $PSScriptRoot '../dist'))
. (Join-Path $PSScriptRoot 'lib.ps1')
$repo = Assert-SafePath (Join-Path $PSScriptRoot '..')
& (Join-Path $PSScriptRoot 'validate.ps1') -RepositoryRoot $repo
$output = Assert-SafePath $OutputDirectory
$packages = @(
    @{Source='chatgpt-skill';Name='stroybaza-design.zip'},
    @{Source='codex-plugin';Name='stroybaza-codex-plugin.zip'}
)
foreach ($package in $packages) {
    $source = Join-Path $repo $package.Source
    if ($output -eq $source -or $output.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Архив должен находиться вне упаковываемой папки' }
    if (Test-Path -LiteralPath (Join-Path $output $package.Name)) { throw "Архив уже существует; выберите другую OutputDirectory: $($package.Name)" }
}
$null = New-Item -ItemType Directory -Path $output -Force
foreach ($package in $packages) {
    $source = Join-Path $repo $package.Source
    $archivePath = Join-Path $output $package.Name
    $staged = $archivePath+'.'+[guid]::NewGuid().ToString('N')+'.partial'
    $sourceFiles = @(Get-RegularFiles $source)
    $writer = [IO.Compression.ZipFile]::Open($staged,[IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in $sourceFiles) {
            $null = [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($writer,$file.FullName,(Get-Relative $source $file.FullName),[IO.Compression.CompressionLevel]::Optimal)
        }
    } finally { $writer.Dispose() }
    if ((Get-Item -LiteralPath $staged).Length -ge 25MB) { throw "Архив превышает 25 МБ, сохранён для разбора: $staged" }
    $zip = [IO.Compression.ZipFile]::OpenRead($staged)
    try {
        $expected = $sourceFiles.Count
        if ($zip.Entries.Count -ne $expected) { throw "Неполный архив: $staged" }
        foreach ($file in $sourceFiles) {
            $entry = $zip.GetEntry((Get-Relative $source $file.FullName))
            if (-not $entry -or $entry.Length -ne $file.Length) { throw "Неполный файл в архиве: $($file.FullName)" }
        }
        $entryPoint = if ($package.Source -eq 'chatgpt-skill') {'SKILL.md'} else {'plugin.json'}
        if (-not $zip.GetEntry($entryPoint)) { throw "Нет точки входа в архиве: $entryPoint" }
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -match '(^[/\\]|(^|[/\\])\.\.([/\\]|$))') { throw 'Путь вне архива' }
        }
    } finally { $zip.Dispose() }
    [IO.File]::Move($staged,$archivePath)
    Write-Output "Готово: $archivePath ($((Get-Item -LiteralPath $archivePath).Length) байт)"
}
