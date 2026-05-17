#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Auto bump patch version unless SKIP_BUMP is set
if [ "$1" != "--skip-bump" ]; then
    echo "── Bump version ──"
    npm version patch --no-git-tag-version
fi

VERSION=$(node -p "require('./package.json').version")
echo "── Publishing v$VERSION ──"

node build.js

npx vsce publish --no-dependencies

echo "── Done: v$VERSION published ──"
