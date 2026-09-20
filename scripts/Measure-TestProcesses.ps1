param([Parameter(Mandatory)][int]$DesktopId,[Parameter(Mandatory)][int]$RuntimeId)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '../target/debug')).Path
foreach($entry in @(@($DesktopId,'idg-desktop.exe'),@($RuntimeId,'idg-runtime.exe'))){if((Get-Process -Id $entry[0]).Path -ne (Join-Path $root $entry[1])){throw 'Unexpected test process.'}}
$all=Get-CimInstance Win32_Process
$ids=[Collections.Generic.HashSet[int]]::new();[void]$ids.Add($DesktopId)
do{$added=$false;foreach($p in $all){if($ids.Contains([int]$p.ParentProcessId)-and $ids.Add([int]$p.ProcessId)){$added=$true}}}while($added)
$groups=@{runtime=@($RuntimeId);desktop=@($DesktopId);webview=@($ids|Where-Object{$_ -ne $DesktopId})}
$result=@{}
foreach($name in $groups.Keys){$processes=@($groups[$name]|ForEach-Object{Get-Process -Id $_ -ErrorAction SilentlyContinue});$result[$name]=@{count=$processes.Count;working_set_bytes=($processes|Measure-Object WorkingSet64 -Sum).Sum;private_bytes=($processes|Measure-Object PrivateMemorySize64 -Sum).Sum}}
$result|ConvertTo-Json -Depth 3 -Compress
