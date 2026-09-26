#Requires -Version 7.0
[CmdletBinding()]
param([ValidateSet('Chromium','Firefox')][string[]]$Browser = @('Chromium','Firefox'))
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$binary = Join-Path $root 'target/debug/idg-native-host.exe'
foreach ($name in @('idg-native-host.exe','idg-runtime.exe','idg-desktop.exe')) {
    if (-not (Test-Path -LiteralPath (Join-Path $root "target/debug/$name"))) { throw "Falta $name en target/debug de este checkout; compila los binarios primero." }
}
$identity = Get-Content (Join-Path $root 'apps/extension/development-identity.json') -Raw | ConvertFrom-Json
$hostName = (& node (Join-Path $root 'scripts/native-host-name.mjs') --write).Trim()
if ($LASTEXITCODE -ne 0 -or $hostName -notmatch '^io\.github\.sredgarr\.idg\.dev\.[0-9a-f]{16}$') { throw 'Identidad de host de desarrollo no válida.' }
$directory = Join-Path $root '.local/native-host'
$entries = @()
foreach ($kind in $Browser) {
    $file = Join-Path $directory "$kind.json"
    $vendors = if ($kind -eq 'Chromium') { @('Google\Chrome','Chromium','Microsoft\Edge') } else { @('Mozilla') }
    foreach ($vendor in $vendors) {
        $key = "HKCU:\Software\$vendor\NativeMessagingHosts\$hostName"
        if (Test-Path -LiteralPath $key) {
            $existing = (Get-Item -LiteralPath $key).GetValue('')
            if ($existing -ne $file) { throw "Registro existente de $kind pertenece a otra ubicación; no se sustituye." }
        }
        $entries += [pscustomobject]@{ Kind=$kind; File=$file; Key=$key; Exists=(Test-Path -LiteralPath $key) }
    }
}
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$created = @()
try {
    foreach ($kind in $Browser) {
        $manifest = @{ name=$hostName; description='IDG Native Messaging — desarrollo'; path=$binary; type='stdio' }
        if ($kind -eq 'Chromium') { $manifest.allowed_origins=@("chrome-extension://$($identity.chromium_id)/") }
        else { $manifest.allowed_extensions=@($identity.firefox_id) }
        $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $directory "$kind.json") -Encoding utf8
    }
    foreach ($entry in $entries) {
        if (-not $entry.Exists) {
            New-Item -Path $entry.Key -Force | Out-Null
            $created += $entry.Key
            Set-Item -LiteralPath $entry.Key -Value $entry.File
        }
    }
} catch {
    foreach ($key in $created) { Remove-Item -LiteralPath $key }
    throw
}
Write-Output 'Host de desarrollo registrado por usuario; no se cambiaron otros hosts.'
