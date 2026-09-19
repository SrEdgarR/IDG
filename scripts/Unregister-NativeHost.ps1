[CmdletBinding()]
param([ValidateSet('Chromium','Firefox')][string[]]$Browser = @('Chromium','Firefox'))
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
foreach ($kind in $Browser) {
    $expected = Join-Path $root ".local/native-host/$kind.json"
    $vendors = if ($kind -eq 'Chromium') { @('Google\Chrome','Chromium','Microsoft\Edge') } else { @('Mozilla') }
    foreach ($vendor in $vendors) {
        $key = "HKCU:\Software\$vendor\NativeMessagingHosts\io.github.sredgarr.idg.dev"
        if (Test-Path -LiteralPath $key) {
            $item = Get-Item -LiteralPath $key
            if ($item.GetValue('') -ne $expected -or $item.SubKeyCount -ne 0 -or $item.ValueCount -ne 1) { throw 'Registro modificado o ajeno; no se elimina.' }
            Remove-Item -LiteralPath $key
        }
    }
}
Write-Output 'Registros propios retirados. Se conservan manifiestos locales y archivos del usuario.'
