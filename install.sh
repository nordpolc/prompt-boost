#!/usr/bin/env bash
# Install prompt-boost into a DSH profile and make sure the profile loads the
# source directory itself, not a copy of it. Safe to run twice.
set -euo pipefail

PROFILE="${DSH_PROFILE:-web}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="$(node -p "require('$HERE/package.json').name" 2>/dev/null || echo prompt-boost)"
BASE="${NAME##*/}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
TARGET="$PROFILE_DIR/node_modules/$NAME"

say() { printf '%s\n' "$*"; }

command -v node >/dev/null || { say "需要 node（>= 20）"; exit 1; }
[ -d "$PROFILE_DIR" ] || { say "找不到 profile：$PROFILE_DIR"; say "先用 dsh --profile $PROFILE 启动一次，让它初始化"; exit 1; }

if command -v dsh >/dev/null; then
  say "1/3 把插件加进 profile（dsh plugin --profile $PROFILE add file:$HERE）"
  dsh plugin --profile "$PROFILE" add "file:$HERE" >/dev/null 2>&1 || {
    say "   pnpm 失败，回退到手动接线"
  }
else
  say "1/3 没找到 dsh 命令，跳过 pnpm，改为手动接线"
fi

case "$HERE" in
  */node_modules/*)
    say "这个副本已经在 node_modules 里了：直接从仓库装的人不用再跑本脚本。"
    say "只有「改源码、要让运行中的 DSH 读到你的改动」时才需要软链。"
    exit 0
    ;;
esac

say "2/3 校验加载的是源码而不是副本"
mkdir -p "$PROFILE_DIR/node_modules"
if [ -e "$PROFILE_DIR/node_modules/$BASE" ]; then
  RESOLVED="$(readlink -f "$PROFILE_DIR/node_modules/$BASE" 2>/dev/null || true)"
  if [ "$RESOLVED" != "$HERE" ]; then
    BACKUP="$PROFILE_DIR/node_modules/$BASE.copy-$(date +%Y%m%d%H%M%S)"
    mv "$PROFILE_DIR/node_modules/$BASE" "$BACKUP"
    say "   旧副本已移到 $BACKUP"
  fi
fi
if [ ! -e "$PROFILE_DIR/node_modules/$BASE" ]; then
  ln -s "$HERE" "$PROFILE_DIR/node_modules/$BASE"
  say "   已建立软链 $PROFILE_DIR/node_modules/$BASE → $HERE"
fi
say "   当前指向：$(readlink -f "$PROFILE_DIR/node_modules/$BASE")"

say "3/3 下一步"
say "   重启 DSH（例如 systemctl --user restart dsh-web），然后强制刷新页面（Ctrl+Shift+R）"
say "   输入框工具行会出现闪电按钮与 ⌄ 箭头；点 ⌄ 选人格"
