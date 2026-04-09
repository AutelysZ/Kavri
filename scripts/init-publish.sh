#!/usr/bin/env bash
set -euo pipefail

#
# First-time publish of all @kavri/* packages to npm.
#
# Prerequisites:
#   1. You are logged into npm: `npm login`
#   2. You have permission to publish under the @kavri scope
#      (create the org at https://www.npmjs.com/org/create if needed)
#   3. Run from the repo root after a successful build: `pnpm build`
#
# What this script does:
#   1. Bumps all packages to 0.0.1
#   2. Copies LICENSE into each package
#   3. Publishes every package to npm (--access public)
#   4. Configures npm trusted publishing (links each package to this GitHub repo)
#   5. Reverts version changes (CI handles real releases)
#

REPO_OWNER="${1:-}"
REPO_NAME="${2:-}"

if [ -z "$REPO_OWNER" ] || [ -z "$REPO_NAME" ]; then
  echo "Usage: ./scripts/init-publish.sh <github-owner> <repo-name>"
  echo "Example: ./scripts/init-publish.sh acrazing Kavri"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking npm login..."
NPM_USER=$(npm whoami 2>/dev/null) || {
  echo "Error: Not logged in to npm. Run 'npm login' first."
  exit 1
}
echo "    Logged in as: $NPM_USER"

echo ""
echo "==> Checking build output..."
MISSING=0
for dir in packages/*/; do
  if [ ! -f "$dir/dist/index.mjs" ]; then
    echo "    Missing build: $dir — run 'pnpm build' first"
    MISSING=1
  fi
done
if [ "$MISSING" -eq 1 ]; then
  exit 1
fi
echo "    All packages built."

echo ""
echo "==> Bumping all packages to 0.0.1..."
pnpm -r exec npm version patch --no-git-tag-version

echo ""
echo "==> Copying LICENSE to packages..."
for dir in packages/*/; do
  cp LICENSE "$dir"
done

echo ""
echo "==> Publishing packages to npm..."

# Publish in dependency order (leaves first)
LEAF_PACKAGES=(basic schema eslint-plugin)
MID_PACKAGES=(container client)
UPPER_PACKAGES=(event config)
TOP_PACKAGES=(logging web aws-secretmanager-resolver)
FINAL_PACKAGES=(drizzle sequelize swagger)

publish_pkg() {
  local dir="packages/$1"
  local name
  name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$dir/package.json','utf8')).name)")
  echo "    Publishing $name..."
  (cd "$dir" && npm publish --access public) || {
    echo "    Warning: Failed to publish $name (may already exist)"
  }
}

for pkg in "${LEAF_PACKAGES[@]}"; do publish_pkg "$pkg"; done
for pkg in "${MID_PACKAGES[@]}"; do publish_pkg "$pkg"; done
for pkg in "${UPPER_PACKAGES[@]}"; do publish_pkg "$pkg"; done
for pkg in "${TOP_PACKAGES[@]}"; do publish_pkg "$pkg"; done
for pkg in "${FINAL_PACKAGES[@]}"; do publish_pkg "$pkg"; done

echo ""
echo "==> Configuring npm trusted publishing for GitHub Actions..."
echo ""
echo "    npm CLI does not support configuring trusted publishing programmatically."
echo "    You need to do this manually for each package at:"
echo ""
echo "    https://www.npmjs.com/package/@kavri/<name>/access"
echo ""
echo "    For each package, under 'Publishing access', click 'Add trusted publisher':"
echo "      Repository owner:  $REPO_OWNER"
echo "      Repository name:   $REPO_NAME"
echo "      Workflow filename:  publish.yml"
echo "      Environment:        npm"
echo ""

ALL_PACKAGES=(
  basic schema container event config logging web client
  eslint-plugin aws-secretmanager-resolver drizzle sequelize swagger
)

echo "    Quick links:"
for pkg in "${ALL_PACKAGES[@]}"; do
  echo "      https://www.npmjs.com/package/@kavri/$pkg/access"
done

echo ""
echo "==> Reverting version changes (CI handles real releases)..."
git checkout -- packages/*/package.json

echo ""
echo "==> Cleaning up LICENSE copies..."
for dir in packages/*/; do
  rm -f "$dir/LICENSE"
done

echo ""
echo "==> Done!"
echo ""
echo "Next steps:"
echo "  1. Visit the links above and configure trusted publishing for each package"
echo "  2. Create a GitHub environment called 'npm' at:"
echo "     https://github.com/$REPO_OWNER/$REPO_NAME/settings/environments"
echo "  3. Trigger a release from Actions UI: choose patch/minor/major"
echo ""
