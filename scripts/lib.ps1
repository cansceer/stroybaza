#Requires -Version 7.0
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-SafePath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $cursor = $full
    while ($cursor) {
        try {
            if ([IO.File]::GetAttributes($cursor) -band [IO.FileAttributes]::ReparsePoint) { throw "Ссылки/junction не поддерживаются: $cursor" }
        } catch [IO.FileNotFoundException] {
            # Новый целевой путь: проверить существующих родителей.
        } catch [IO.DirectoryNotFoundException] {
            # Новый целевой путь: проверить существующих родителей.
        }
        $parent = [IO.Path]::GetDirectoryName($cursor)
        if ($parent -eq $cursor) { break }
        $cursor = $parent
    }
    return $full
}
function Assert-Within([string]$Path, [string]$Root) {
    $full = Assert-SafePath $Path
    $base = (Assert-SafePath $Root).TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    if (-not $full.StartsWith($base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw "Путь выходит за пределы каталога: $full" }
    return $full
}
function Get-RegularFiles([string]$Root) {
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push((Assert-SafePath $Root))
    while ($pending.Count) {
        foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Ссылка в составе пакета: $($item.FullName)" }
            if ($item.PSIsContainer) { $pending.Push($item.FullName) } else { $item }
        }
    }
}
function Get-Relative([string]$Root, [string]$Path) { return [IO.Path]::GetRelativePath($Root, $Path).Replace('\', '/') }
function Copy-RegularTree([string]$Source, [string]$Destination) {
    $files = @(Get-RegularFiles $Source)
    $null = Assert-SafePath $Destination
    foreach ($file in $files) {
        $target = Assert-Within (Join-Path $Destination (Get-Relative $Source $file.FullName)) $Destination
        $null = New-Item -ItemType Directory -Path (Split-Path $target) -Force
        Copy-Item -LiteralPath $file.FullName -Destination $target
    }
}
