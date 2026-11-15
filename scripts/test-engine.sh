#!/usr/bin/env bash
# Test del motor de plantillas SIN base de datos.
#   1. Regresión: renderiza plantillas con el motor actual y con el de una
#      referencia git (default origin/main) y exige que den IDÉNTICO.
#   2. Valida el Anexo de Incorporación (filas, placeholders, cuota del grupo).
# Uso: npm run test:engine [ref-git]
set -euo pipefail
cd "$(dirname "$0")/.."
REF="${1:-origin/main}"
TMP=".tmp-engine-test"
E="node_modules/.bin/esbuild"

rm -rf "$TMP"; mkdir -p "$TMP/old/lib" "$TMP/out"
git show "$REF:src/lib/enhancedTemplateEngine.ts" > "$TMP/old/lib/enhancedTemplateEngine.ts"
cp src/lib/utils.ts src/lib/appUrls.ts "$TMP/old/lib/"

"$E" tests/template-engine/render.ts --bundle --platform=node --format=cjs --alias:@=./src        --outfile="$TMP/out/new.cjs" --log-level=error
"$E" tests/template-engine/render.ts --bundle --platform=node --format=cjs --alias:@="./$TMP/old" --outfile="$TMP/out/old.cjs" --log-level=error
"$E" tests/template-engine/checks.ts --bundle --platform=node --format=cjs --alias:@=./src        --outfile="$TMP/out/checks.cjs" --log-level=error

node "$TMP/out/old.cjs" > "$TMP/out/old.json"
ANEXO_PATH="$PWD/docs/plantilla-anexo-incorporacion.html" node "$TMP/out/new.cjs" > "$TMP/out/new.json"

echo "(motor de referencia: $REF)"; echo
node tests/template-engine/compare.cjs "$TMP/out"
echo
node "$TMP/out/checks.cjs"
rm -rf "$TMP"
