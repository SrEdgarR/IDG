param([Parameter(Mandatory)][string]$Directory)
$ErrorActionPreference='Stop'
$expected=[IO.Path]::GetFullPath($Directory).TrimEnd('\')
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.local')).TrimEnd('\')+'\'
if(-not $expected.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw 'Only isolated test folders are supported.'}
$shell=New-Object -ComObject Shell.Application
for($i=0;$i -lt 60;$i++){
 foreach($window in $shell.Windows()){
  try{$actual=([Uri]$window.LocationURL).LocalPath.TrimEnd('\');if($actual -eq $expected){Write-Output 'verified-folder';exit 0}}catch{}
 }
 Start-Sleep -Milliseconds 100
}
throw 'Explorer did not expose the expected test folder.'
