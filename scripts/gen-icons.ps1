Add-Type -AssemblyName System.Drawing

function New-AppIcon {
    param([int]$Size, [string]$OutPath)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $bg = [System.Drawing.Color]::FromArgb(200, 245, 74)
    $g.Clear($bg)

    $fg = [System.Drawing.Color]::FromArgb(10, 11, 13)
    $brush = New-Object System.Drawing.SolidBrush $fg

    $s = [double]$Size
    $barH = [int]($s * 0.10)
    $barW = [int]($s * 0.62)
    $blockH = [int]($s * 0.46)
    $blockW = [int]($s * 0.13)
    $cx = [int]($s / 2)
    $cy = [int]($s / 2)

    $barX = $cx - [int]($barW / 2)
    $barY = $cy - [int]($barH / 2)
    $barRect = [System.Drawing.Rectangle]::new($barX, $barY, $barW, $barH)
    $g.FillRectangle($brush, $barRect)

    $byT = $cy - [int]($blockH / 2)
    $bxL = $cx - [int]($barW / 2) - $blockW
    $bxR = $cx + [int]($barW / 2)
    $g.FillRectangle($brush, $bxL, $byT, $blockW, $blockH)
    $g.FillRectangle($brush, $bxR, $byT, $blockW, $blockH)

    $g.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$dir = "client\public"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
New-AppIcon -Size 180 -OutPath "$dir\icon-180.png"
New-AppIcon -Size 192 -OutPath "$dir\icon-192.png"
New-AppIcon -Size 512 -OutPath "$dir\icon-512.png"
Get-ChildItem "$dir\*.png" | ForEach-Object { "{0}  {1} bytes" -f $_.Name, $_.Length }
