#Requires -Version 7.0
[CmdletBinding()]
param([switch]$RegisterMarketplace)
$ErrorActionPreference = 'Stop'
# Codex запускает отдельный git clone для snapshot marketplace. Передаём настройку
# дочернему Git через окружение, сохраняя действующие значения и не меняя global config.
$previousCount = [Environment]::GetEnvironmentVariable('GIT_CONFIG_COUNT','Process')
$count = if ($previousCount) { [int]$previousCount } else { 0 }
$keyName = "GIT_CONFIG_KEY_$count"
$valueName = "GIT_CONFIG_VALUE_$count"
$previousKey = [Environment]::GetEnvironmentVariable($keyName,'Process')
$previousValue = [Environment]::GetEnvironmentVariable($valueName,'Process')
try {
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT',($count+1).ToString(),'Process')
    [Environment]::SetEnvironmentVariable($keyName,'core.longpaths','Process')
    [Environment]::SetEnvironmentVariable($valueName,'true','Process')
    if ($RegisterMarketplace) {
        codex plugin marketplace add cansceer/stroybaza --ref main
        if ($LASTEXITCODE -ne 0) { throw 'Не удалось добавить marketplace Стройбазы' }
    }
    codex plugin marketplace upgrade stroybaza --json
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось обновить marketplace Стройбазы' }
    codex plugin add stroybaza-design@stroybaza --json
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось установить плагин Стройбазы' }
    codex plugin list --marketplace stroybaza --json
    if ($LASTEXITCODE -ne 0) { throw 'Не удалось проверить установленный плагин' }
} finally {
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT',$previousCount,'Process')
    [Environment]::SetEnvironmentVariable($keyName,$previousKey,'Process')
    [Environment]::SetEnvironmentVariable($valueName,$previousValue,'Process')
}
