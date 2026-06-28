<#
.SYNOPSIS
  Generates the TerminalDeck app icon -> build/icon.ico (+ build/icon.png).

.DESCRIPTION
  Renders the icon with .NET System.Drawing (no external tools needed) and
  packs every size into a classic multi-resolution .ico using DIB frames,
  which are read correctly by GDI+, electron-builder's app-builder, and the
  Windows shell. electron-builder auto-uses build/icon.ico (wired explicitly
  via win.icon in electron-builder.yml), so just rebuild after running this.

  Design: a deep blue-black "ink" rounded square with a brass ">_" terminal
  prompt — the palette of the default "Deepwater" theme
  (src/renderer/src/styles/themes.ts): bg #0b0f16, accent brass #d8a956.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/make-icon.ps1
  npm run dist   # rebuild the installer with the new icon
#>

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

# build/ lives next to scripts/ at the repo root
$repoRoot = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $repoRoot 'build'
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null

function C([string]$hex, [int]$a = 255) {
  $hex = $hex.TrimStart('#')
  [System.Drawing.Color]::FromArgb($a,
    [Convert]::ToInt32($hex.Substring(0,2),16),
    [Convert]::ToInt32($hex.Substring(2,2),16),
    [Convert]::ToInt32($hex.Substring(4,2),16))
}

function Render([int]$S) {
  $bmp = New-Object System.Drawing.Bitmap($S, $S, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $f = [single]$S
  $r = [single]($f * 0.215)
  $d = [single](2 * $r)
  $inset = [single]([Math]::Max(0.5, $f * 0.012))
  $rw = [single]($f - 2 * $inset)

  # rounded-square path
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddArc($inset, $inset, $d, $d, 180, 90)
  $path.AddArc([single]($inset + $rw - $d), $inset, $d, $d, 270, 90)
  $path.AddArc([single]($inset + $rw - $d), [single]($inset + $rw - $d), $d, $d, 0, 90)
  $path.AddArc($inset, [single]($inset + $rw - $d), $d, $d, 90, 90)
  $path.CloseFigure()

  $rectF = New-Object System.Drawing.RectangleF(0, 0, $f, $f)

  # deep ink base gradient (gentle range to minimize banding)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectF, (C '#171f2c'), (C '#0b0f17'), 90.0)
  $g.FillPath($bg, $path)

  # top sheen (polished glass)
  $sheen = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectF, (C 'ffffff' 26), (C 'ffffff' 0), 90.0)
  $g.FillPath($sheen, $path)

  # dither away gradient banding
  $g.FillPath($script:noiseBrush, $path)

  $g.SetClip($path)

  # brass glow behind the glyph
  $cx = [single]($f * 0.47); $cy = [single]($f * 0.49); $gr = [single]($f * 0.46)
  $glow = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glow.AddEllipse([single]($cx - $gr), [single]($cy - $gr), [single](2 * $gr), [single](2 * $gr))
  $pgb = New-Object System.Drawing.Drawing2D.PathGradientBrush($glow)
  $pgb.CenterColor = (C '#d8a956' 58)
  $pgb.SurroundColors = @((C '#d8a956' 0))
  $pgb.CenterPoint = (New-Object System.Drawing.PointF($cx, $cy))
  $g.FillPath($pgb, $glow)

  # brass ">_" prompt glyph
  $w = [single]($f * 0.084)
  $glyphRect = New-Object System.Drawing.RectangleF(0, [single]($f * 0.26), $f, [single]($f * 0.50))
  $brass = New-Object System.Drawing.Drawing2D.LinearGradientBrush($glyphRect, (C '#f4d692'), (C '#cd9740'), 90.0)
  $pen = New-Object System.Drawing.Pen($brass, $w)
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

  $chev = [System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF([single]($f*0.30), [single]($f*0.34))),
    (New-Object System.Drawing.PointF([single]($f*0.485), [single]($f*0.49))),
    (New-Object System.Drawing.PointF([single]($f*0.30), [single]($f*0.64)))
  )
  $g.DrawLines($pen, $chev)
  $g.DrawLine($pen, [single]($f*0.535), [single]($f*0.655), [single]($f*0.70), [single]($f*0.655))

  $g.ResetClip()

  # subtle bezel so the dark tile reads against dark backgrounds
  $bpen = New-Object System.Drawing.Pen((C '#36425c' 150), [single]([Math]::Max(1.0, $f * 0.010)))
  $g.DrawPath($bpen, $path)

  $g.Dispose()
  return $bmp
}

# little-endian writers for the ICO/DIB headers
function PutI32([byte[]]$a, [int]$o, [int]$v) {
  $a[$o] = [byte]($v -band 0xFF); $a[$o + 1] = [byte](($v -shr 8) -band 0xFF)
  $a[$o + 2] = [byte](($v -shr 16) -band 0xFF); $a[$o + 3] = [byte](($v -shr 24) -band 0xFF)
}
function PutI16([byte[]]$a, [int]$o, [int]$v) {
  $a[$o] = [byte]($v -band 0xFF); $a[$o + 1] = [byte](($v -shr 8) -band 0xFF)
}

# Build a classic DIB icon frame: BITMAPINFOHEADER + 32bpp BGRA (bottom-up) + AND mask.
function Get-DibFrame([System.Drawing.Bitmap]$bmp, [int]$S) {
  $rect = New-Object System.Drawing.Rectangle(0, 0, $S, $S)
  $bd = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $stride = $bd.Stride
  $src = New-Object 'byte[]' ($stride * $S)
  [System.Runtime.InteropServices.Marshal]::Copy($bd.Scan0, $src, 0, $src.Length)
  $bmp.UnlockBits($bd)

  $rowBytes = $S * 4
  $andStride = [int]([Math]::Floor(($S + 31) / 32) * 4)
  $out = New-Object 'byte[]' (40 + ($rowBytes * $S) + ($andStride * $S))

  PutI32 $out 0  40
  PutI32 $out 4  $S
  PutI32 $out 8  ($S * 2)    # height counts XOR + AND masks
  PutI16 $out 12 1
  PutI16 $out 14 32
  PutI32 $out 16 0           # BI_RGB

  $dst = 40
  for ($y = $S - 1; $y -ge 0; $y--) {   # DIB is bottom-up
    [Array]::Copy($src, $y * $stride, $out, $dst, $rowBytes)
    $dst += $rowBytes
  }
  # AND mask stays all-zero — the alpha channel handles transparency
  return , $out
}

# --- run ---------------------------------------------------------------------

# fine salt-and-pepper dither tile, tiled over the background to break banding
$noise = New-Object System.Drawing.Bitmap(128, 128, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$nrect = New-Object System.Drawing.Rectangle(0, 0, 128, 128)
$bd = $noise.LockBits($nrect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$buf = New-Object 'byte[]' ($bd.Stride * 128)
$rnd = New-Object System.Random(1337)
for ($i = 0; $i -lt $buf.Length; $i += 4) {
  $v = [byte]($rnd.Next(0, 2) * 255)
  $buf[$i] = $v; $buf[$i + 1] = $v; $buf[$i + 2] = $v; $buf[$i + 3] = [byte]6
}
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $bd.Scan0, $buf.Length)
$noise.UnlockBits($bd)
$script:noiseBrush = New-Object System.Drawing.TextureBrush($noise)
$script:noiseBrush.WrapMode = [System.Drawing.Drawing2D.WrapMode]::Tile

# render every size, pack as DIB frames into a multi-resolution .ico
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @{}
foreach ($s in $sizes) {
  $b = Render $s
  $frames[$s] = Get-DibFrame $b $s
  $b.Dispose()
}

$icoPath = Join-Path $buildDir 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)  # reserved, type=icon, count
$offset = 6 + 16 * $sizes.Count
foreach ($s in $sizes) {
  $len = $frames[$s].Length
  $bw.Write([byte]($s -band 0xFF)); $bw.Write([byte]($s -band 0xFF))  # width, height (0 => 256)
  $bw.Write([byte]0); $bw.Write([byte]0)                              # palette, reserved
  $bw.Write([uint16]1); $bw.Write([uint16]32)                         # planes, bpp
  $bw.Write([uint32]$len); $bw.Write([uint32]$offset)                 # bytes, offset
  $offset += $len
}
foreach ($s in $sizes) { $bw.Write($frames[$s]) }
$bw.Flush(); $bw.Close(); $fs.Close()

# 1024 master png (non-Windows targets / fallback source)
$m = Render 1024
$m.Save((Join-Path $buildDir 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$m.Dispose()

Write-Output ("icon.ico  = {0:N0} bytes  (DIB frames: {1})" -f (Get-Item $icoPath).Length, ($sizes -join ', '))
Write-Output ("icon.png  = {0:N0} bytes  (1024x1024)" -f (Get-Item (Join-Path $buildDir 'icon.png')).Length)
Write-Output ("written to {0}" -f $buildDir)
