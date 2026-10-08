#!/usr/bin/env bash
# Gera os arquivos de realidade aumentada (GLB para Android, USDZ para iPhone) em public/modelos/.
# Eles saem do gerador 3D e não ficam no git (cerca de 60 MB).
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$RAIZ/.modelos-tmp"
rm -rf "$TMP" "$RAIZ/public/modelos"
mkdir -p "$RAIZ/public/modelos"
(cd "$RAIZ/node_modules/@avilaops/gerador-3d" && "$RAIZ/node_modules/.bin/vite-node" scripts/export.ts -- --catalog ludus --out "$TMP" >/dev/null)
for d in "$TMP"/*/; do
  id="$(basename "$d")"
  cp "$d/model.glb" "$RAIZ/public/modelos/$id.glb"
  cp "$d/model.usdz" "$RAIZ/public/modelos/$id.usdz"
done
rm -rf "$TMP"
echo "$(ls "$RAIZ/public/modelos" | wc -l) arquivos em public/modelos"
