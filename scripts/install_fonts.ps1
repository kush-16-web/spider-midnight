$objShell = New-Object -ComObject Shell.Application
$objFolder = $objShell.Namespace(0x14)
$font1 = "c:\Users\harsh\OneDrive\Desktop\IDE Extension\assets\fonts\ComicMono.ttf"
$font2 = "c:\Users\harsh\OneDrive\Desktop\IDE Extension\assets\fonts\ComicMono-Bold.ttf"
$objFolder.CopyHere($font1, 16)
$objFolder.CopyHere($font2, 16)
Write-Output "Fonts installed via Windows Shell successfully!"
