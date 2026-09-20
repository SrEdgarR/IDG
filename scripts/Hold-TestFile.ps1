param([Parameter(Mandatory)][string]$File)
$ErrorActionPreference='Stop'
$path=[IO.Path]::GetFullPath($File)
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.local')).TrimEnd('\')+'\'
if(-not $path.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw 'Only isolated test files can be locked.'}
$stream=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try{[Console]::WriteLine('locked');[Console]::Out.Flush();[void][Console]::ReadLine()}finally{$stream.Dispose()}
