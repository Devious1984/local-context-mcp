#!/bin/bash
set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <new_version>"
  exit 1
fi

NEW_VERSION=$1
echo "Bumping version to $NEW_VERSION..."

# 1. Update package.json
if [ -f "package.json" ]; then
  sed -i "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" package.json
fi

# 2. Update Documentation (Current Version headers)
sed -i "s/^Current Version: .*/Current Version: $NEW_VERSION/" README.md
sed -i "s/^Current Version: .*/Current Version: $NEW_VERSION/" CLAUDE.md

echo "Successfully bumped version to $NEW_VERSION in all target files."
