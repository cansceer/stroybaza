#Requires -Version 7.0
[CmdletBinding(SupportsShouldProcess)]
param([string]$RepositoryRoot = (Join-Path $PSScriptRoot '..'))
. (Join-Path $PSScriptRoot 'lib.ps1')
$repo = Assert-SafePath $RepositoryRoot
$canonical = Join-Path $repo 'chatgpt-skill'
$codexSkill = Join-Path $repo 'codex-plugin/skills/stroybaza-project'
$copies = @()
foreach ($branch in @('references', 'assets', 'agents')) {
    $source = Join-Path $canonical $branch
    $target = Join-Path $codexSkill $branch
    foreach ($file in Get-RegularFiles $source) {
        $relative = Get-Relative $source $file.FullName
        $copies += @{ Source = $file.FullName; Destination = (Assert-Within (Join-Path $target $relative) $target) }
    }
    if (Test-Path -LiteralPath $target) {
        foreach ($file in Get-RegularFiles $target) {
            $relative = Get-Relative $target $file.FullName
            if ($branch -eq 'references' -and $relative -eq 'figma-editable.md') { continue }
            if (-not (Test-Path -LiteralPath (Join-Path $source $relative) -PathType Leaf)) { throw "Лишний ресурс требует отдельного разбора, автоматическое удаление запрещено: $($file.FullName)" }
        }
    }
}
if ($PSCmdlet.ShouldProcess($codexSkill, "Синхронизировать $($copies.Count) ресурсов из chatgpt-skill")) {
    foreach ($copy in $copies) {
        $null = New-Item -ItemType Directory -Path (Split-Path $copy.Destination) -Force
        Copy-Item -LiteralPath $copy.Source -Destination $copy.Destination
    }
    Write-Output "Синхронизировано ресурсов: $($copies.Count)"
}
