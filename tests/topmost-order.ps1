param([long]$WidgetHandle, [long]$CoverHandle)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WindowOrder {
    [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$above = $true
$cursor = [WindowOrder]::GetWindow([IntPtr]$WidgetHandle, 3)
while ($cursor -ne [IntPtr]::Zero) {
    if ($cursor.ToInt64() -eq $CoverHandle) { $above = $false; break }
    $cursor = [WindowOrder]::GetWindow($cursor, 3)
}
@{ above = $above; foreground = [WindowOrder]::GetForegroundWindow().ToInt64() } | ConvertTo-Json -Compress
