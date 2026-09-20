# Read-only sampler; caller supplies the PID of its own benchmark child.
param([Parameter(Mandatory)][int]$BenchmarkProcessId)
$samples = 0
$peak = 0L
$cpu = 0.0
while ($true) {
    $observed = Get-Process -Id $BenchmarkProcessId -ErrorAction SilentlyContinue
    if ($null -eq $observed) { break }
    $peak = [Math]::Max($peak, $observed.WorkingSet64)
    $cpu = $observed.TotalProcessorTime.TotalMilliseconds
    $samples++
    Start-Sleep -Milliseconds 100
}
@{ sampled_peak_rss_bytes=$peak; cpu_ms=$cpu; samples=$samples; interval_ms=100 } | ConvertTo-Json -Compress
