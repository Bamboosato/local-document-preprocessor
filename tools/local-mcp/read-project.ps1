# Read only through the verified open handle. No document data is written to disk.
$ErrorActionPreference = 'Stop'
try {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;
public static class LdpHandle {
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder buffer, uint size, uint flags);
    [DllImport("kernel32.dll")]
    public static extern uint GetFileType(SafeFileHandle handle);
    public static string FinalPath(SafeFileHandle handle) {
        var buffer = new StringBuilder(32768);
        var length = GetFinalPathNameByHandle(handle, buffer, (uint)buffer.Capacity, 0);
        if (length == 0 || length >= buffer.Capacity) throw new System.IO.IOException();
        return buffer.ToString();
    }
}
'@
    $root = $env:LDP_READ_ROOT.TrimEnd('\')
    $path = [IO.Path]::Combine($root + '\', $env:LDP_READ_RELATIVE)
    $stream = [IO.File]::Open($path, 'Open', 'Read', 'Read')
    try {
        $actual = [LdpHandle]::FinalPath($stream.SafeFileHandle)
        $prefix = '\\?\' + $root + '\'
        if ([LdpHandle]::GetFileType($stream.SafeFileHandle) -ne 1 -or
            -not $actual.StartsWith($prefix, [StringComparison]::Ordinal)) { exit 3 }
        if ($stream.Length -gt 52428800) { exit 4 }
        $stream.CopyTo([Console]::OpenStandardOutput())
    } finally { $stream.Dispose() }
} catch [IO.FileNotFoundException] { exit 2 }
catch [IO.DirectoryNotFoundException] { exit 2 }
catch { exit 3 }
