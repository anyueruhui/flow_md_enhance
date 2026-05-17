#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "── Build ──"
node build.js

echo "── Package ──"
rm -rf dist
mkdir dist
npx vsce package --no-dependencies -o dist/ 2>&1

echo "── Done ──"
ls -lh dist/*.vsix
