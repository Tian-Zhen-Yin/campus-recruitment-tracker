# 校招投递管理 · Windows 一键安装（不需要管理员权限）
# 用法：复制整行到 PowerShell 执行：
#   irm https://tian-zhen-yin.github.io/campus-recruitment-tracker/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$Dest = Join-Path $env:USERPROFILE '校招投递管理'
$ZipUrl = 'https://tian-zhen-yin.github.io/campus-recruitment-tracker/downloads/%E6%A0%A1%E6%8B%9B%E6%8A%95%E9%80%92%E7%AE%A1%E7%90%86-%E5%AE%8C%E6%95%B4%E7%89%88-Windows-v3.3.1.zip'
Write-Host '▸ 下载完整版（约 12 MB）……'
$tmpZip = Join-Path $env:TEMP 'campus-full-win.zip'
curl.exe -fsSL $ZipUrl -o $tmpZip
if (-not (Test-Path $tmpZip)) { throw '下载失败，请检查网络后重试' }
Write-Host "▸ 解压到 $Dest ……"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Expand-Archive -Path $tmpZip -DestinationPath $Dest -Force
Remove-Item $tmpZip -ErrorAction SilentlyContinue
Write-Host '▸ 开始安装……'
& (Join-Path $Dest 'ats-status\scripts\win\install.ps1')
