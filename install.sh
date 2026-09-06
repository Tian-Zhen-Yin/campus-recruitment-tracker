#!/bin/bash
# 校招投递管理 · 完整版在线安装（Mac）
# 用法（复制整行到终端执行）：
#   curl -fsSL https://tian-zhen-yin.github.io/autumn-recruitment-tracker/install.sh | bash
# 可选参数：--dry-run（只检查与解压，不注册服务）
set -uo pipefail
# 中文文案紧贴变量的写法要求 UTF-8 locale：C locale 下 bash 会把全角标点字节并进变量名
export LANG="${LANG:-en_US.UTF-8}"

BASE="https://tian-zhen-yin.github.io/autumn-recruitment-tracker"
ZIP_URL="$BASE/downloads/%E6%A0%A1%E6%8B%9B%E6%8A%95%E9%80%92%E7%AE%A1%E7%90%86-%E5%AE%8C%E6%95%B4%E7%89%88-Mac-v3.3.0.zip"
DEST="$HOME/校招投递管理"
EXTRA="${1:-}"

say() { echo "▸ $*"; }

[ "$(uname)" = "Darwin" ] || { echo "✗ 本安装器只支持 macOS"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "✗ 未找到 Node.js——请先安装：brew install node（或 https://nodejs.org 下载）"; exit 1; }

say "下载完整版（约 7 MB）……"
TMP_ZIP="$(mktemp -d)/ats-full.zip"
curl -fsSL "$ZIP_URL" -o "$TMP_ZIP" || { echo "✗ 下载失败，请检查网络后重试"; exit 1; }

say "解压到 $DEST ……"
mkdir -p "$DEST"
ditto -x -k "$TMP_ZIP" "$DEST"
rm -f "$TMP_ZIP"
# zip 顶层即包内容（无中文目录层），安装脚本路径固定
PKG_DIR="$DEST"
[ -f "$PKG_DIR/ats-status/scripts/install.sh" ] || { echo "✗ 解压异常（缺 ats-status/scripts/install.sh）"; exit 1; }
echo "  ✓ 安装位置：${PKG_DIR}（之后请不要移动或删除这个文件夹）"

say "开始安装……"
bash "$PKG_DIR/ats-status/scripts/install.sh" $EXTRA
