#!/usr/bin/env bash
# 前端构建脚本：next build 后必须把 static/public 补进 standalone 目录，
# 否则所有 /_next/static/* 404 → 页面无样式/白屏（2026-10-10 实际踩坑）。
# Docker 路径由 Dockerfile 的 COPY .next 完成；systemd 直跑 standalone
# 路径用本脚本。
set -euo pipefail
cd "$(dirname "$0")/../frontend"

NODE_OPTIONS=--max-old-space-size=1024 npx next build "$@"

rm -rf .next/standalone/frontend/.next/static
cp -r .next/static .next/standalone/frontend/.next/static
rm -rf .next/standalone/frontend/public
[ -d public ] && cp -r public .next/standalone/frontend/public

echo "[build-frontend] standalone 静态资源已补齐："
ls .next/standalone/frontend/.next/static
