#Requires -Version 7.0
[CmdletBinding()]
param([switch]$Integration)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
function Invoke-Checked([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "Comprobación fallida: $Command" }
}
Invoke-Checked { cargo fmt --all -- --check }
Invoke-Checked { cargo clippy --locked --workspace --all-targets -- -D warnings }
Invoke-Checked { cargo test --locked --workspace }
$types = Get-Content packages/shared-types/protocol.ts -Raw
Invoke-Checked { cargo run --locked -p idg-protocol --bin export-types }
if ($types -cne (Get-Content packages/shared-types/protocol.ts -Raw)) { throw 'Tipos generados desactualizados; revisa el diff.' }
Invoke-Checked { npx --yes pnpm@12.4.2 check }
Invoke-Checked { node --test scripts/test-ui-model.mjs }
Invoke-Checked { npx --yes pnpm@12.4.2 extension:build }
Invoke-Checked { cargo build --locked -p idg-runtime -p idg-native-host -p idg-platform-windows }
Invoke-Checked { npx --yes pnpm@12.4.2 desktop:build }
Invoke-Checked { node scripts/test-runtime.mjs }
Invoke-Checked { node scripts/test-http-runtime.mjs }
Invoke-Checked { node scripts/test-segment-fixture.mjs }
Invoke-Checked { node scripts/test-segments.mjs }
if ($Integration) {
    Invoke-Checked { node scripts/test-ui.mjs }
    # Register explicitly beforehand. No registry mutations are hidden in this check.
    Invoke-Checked { node scripts/test-desktop.mjs }
    Invoke-Checked { node scripts/test-chromium.mjs }
    Invoke-Checked { node scripts/test-firefox.mjs }
}
