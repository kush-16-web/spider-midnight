$source1 = "c:\Users\harsh\OneDrive\Desktop\IDE Extension\assets\fonts\ComicMono.ttf"
$source2 = "c:\Users\harsh\OneDrive\Desktop\IDE Extension\assets\fonts\ComicMono-Bold.ttf"

$userFontDir = "$env:LOCALAPPDATA\Microsoft\Windows\Fonts"
if (!(Test-Path $userFontDir)) {
    New-Item -ItemType Directory -Path $userFontDir -Force | Out-Null
}

Copy-Item $source1 "$userFontDir\ComicMono.ttf" -Force
Copy-Item $source2 "$userFontDir\ComicMono-Bold.ttf" -Force

$regPath = "HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Fonts"
Set-ItemProperty -Path $regPath -Name "Comic Mono (TrueType)" -Value "$userFontDir\ComicMono.ttf" -Force
Set-ItemProperty -Path $regPath -Name "Comic Mono Bold (TrueType)" -Value "$userFontDir\ComicMono-Bold.ttf" -Force
Set-ItemProperty -Path $regPath -Name "Comic Mono (Bold TrueType)" -Value "$userFontDir\ComicMono-Bold.ttf" -Force

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class WinFont {
    [DllImport("gdi32.dll", EntryPoint = "AddFontResourceW", SetLastError = true)]
    public static extern int AddFontResource([In, MarshalAs(UnmanagedType.LPWStr)] string lpFileName);

    [DllImport("user32.dll")]
    public static extern int SendMessage(int hWnd, uint Msg, int wParam, int lParam);

    public static void Install(string path) {
        AddFontResource(path);
        SendMessage(0xffff, 0x001D, 0, 0);
    }
}
"@

[WinFont]::Install("$userFontDir\ComicMono.ttf")
[WinFont]::Install("$userFontDir\ComicMono-Bold.ttf")

Write-Output "SUCCESS: Comic Mono registered in Windows GDI & DirectWrite subsystem!"
