# Sends the native window close request used by X, only to this build's owned test process.
param([Parameter(Mandatory)][int]$ProcessId)
$ErrorActionPreference='Stop'
$expected=(Resolve-Path (Join-Path $PSScriptRoot '../target/debug/idg-desktop.exe')).Path
$process=Get-Process -Id $ProcessId
if($process.Path -ne $expected -or $process.MainWindowHandle -eq 0){throw 'Not an IDG test window from this build.'}
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class IDGTestWindow {
 [DllImport("user32.dll",SetLastError=true)] public static extern IntPtr SendMessageTimeout(IntPtr h,uint m,IntPtr w,IntPtr l,uint flags,uint timeout,out IntPtr result);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
}
'@
$handle=$process.MainWindowHandle
$result=[IntPtr]::Zero
if([IDGTestWindow]::SendMessageTimeout($handle,0x0112,[IntPtr]0xF060,[IntPtr]::Zero,2,2000,[ref]$result) -eq [IntPtr]::Zero){throw 'Native close request failed.'}
for($i=0;$i -lt 40;$i++){if(-not [IDGTestWindow]::IsWindowVisible($handle)){Write-Output 'hidden';exit 0};Start-Sleep -Milliseconds 50}
throw 'Window did not hide after native close request.'
