#!/bin/bash
# Build web dashboard + CLI for distribution
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Building web dashboard ==="
cd "$ROOT/web" && pnpm build

echo "=== Copying web build to daemon/web ==="
rm -rf "$ROOT/daemon/web/assets"
cp -r "$ROOT/web/dist/"* "$ROOT/daemon/web/"

echo "=== Building CLI (release) ==="
cd "$ROOT/cli" && cargo build --release

echo "=== Copying CLI binary ==="
mkdir -p "$ROOT/bin"
cp "$ROOT/cli/target/release/clawket" "$ROOT/bin/clawket"
chmod +x "$ROOT/bin/clawket"

echo "=== Done ==="
