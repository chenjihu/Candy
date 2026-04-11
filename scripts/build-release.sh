#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-0.1.0}"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/dist/release}"
TARGETS="${TARGETS:-linux/amd64 linux/arm64 darwin/amd64 darwin/arm64 windows/amd64 windows/arm64}"
SKIP_NPM_INSTALL="${SKIP_NPM_INSTALL:-0}"
export GOCACHE="${GOCACHE:-$ROOT_DIR/.cache/go-build}"
export GOMODCACHE="${GOMODCACHE:-$ROOT_DIR/.cache/gomod}"
export COPYFILE_DISABLE=1
TAR_EXTRA_FLAGS=()

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

archive_package() {
  local package_dir="$1"
  local package_name="$2"
  local goos="$3"

  (
    cd "$OUT_DIR"
    if [ "$goos" = "windows" ]; then
      require_command zip
      zip -X -qr "${package_name}.zip" "$package_name"
    else
      tar -czf "${package_name}.tar.gz" "${TAR_EXTRA_FLAGS[@]}" "$package_name"
    fi
  )
}

require_command go
require_command npm
require_command tar

for flag in --no-xattrs --no-acls --no-mac-metadata; do
  if tar -cf /dev/null "$flag" -T /dev/null >/dev/null 2>&1; then
    TAR_EXTRA_FLAGS+=("$flag")
  fi
done

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
mkdir -p "$GOCACHE" "$GOMODCACHE"

echo "==> Building frontend"
(
  cd "$ROOT_DIR/frontend"
  if [ "$SKIP_NPM_INSTALL" != "1" ]; then
    npm ci
  fi
  npm run build
)

echo "==> Building backend release packages"
for target in $TARGETS; do
  IFS=/ read -r goos goarch <<<"$target"
  if [ -z "$goos" ] || [ -z "$goarch" ]; then
    echo "invalid target: $target" >&2
    exit 1
  fi

  package_name="candy_${VERSION}_${goos}_${goarch}"
  package_dir="$OUT_DIR/$package_name"
  binary_name="candyd"
  if [ "$goos" = "windows" ]; then
    binary_name="candyd.exe"
  fi

  mkdir -p "$package_dir/frontend"
  cp -R "$ROOT_DIR/frontend/dist" "$package_dir/frontend/dist"
  cp "$ROOT_DIR/README.md" "$package_dir/README.md"
  cat > "$package_dir/env.example" <<EOF
CANDY_ADDR=:8080
CANDY_PUBLIC_URL=https://deploy.example.com
CANDY_DB_PATH=./data/candy.db
CANDY_DATA_DIR=./data
CANDY_FRONTEND_DIR=./frontend/dist
CANDY_APP_SECRET=change-me-to-a-long-random-secret
CANDY_ADMIN_USERNAME=super_admin
CANDY_ADMIN_PASSWORD=change-me-to-a-strong-password
EOF

  echo "    $goos/$goarch"
  (
    cd "$ROOT_DIR/backend"
    CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" go build \
      -trimpath \
      -ldflags="-s -w" \
      -o "$package_dir/$binary_name" \
      ./cmd/candyd
  )

  archive_package "$package_dir" "$package_name" "$goos"
done

echo "==> Release artifacts"
find "$OUT_DIR" -maxdepth 1 -type f -print
