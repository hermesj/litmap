#!/usr/bin/env bash
# Propagate the shared litmap framework (engine + pipeline + docs) from this
# canonical repo to the consuming map projects. Workflow: edit shared files HERE
# in litmap, bump engine/VERSION on a notable change, then run ./sync-engine.sh.
# Project-specific files (config.json, data/, index.html) are never touched.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
TARGETS=(
  "$SRC/../mappingPerutz"
  "$SRC/../hermesj.github.io/mappingJoyce"
)
SHARED=(
  engine/engine.js engine/engine.css engine/VERSION
  pipeline/geocode_source.py pipeline/overlay.py pipeline/check.py
  pipeline/annotate-ui/serve.py pipeline/annotate-ui/app.js pipeline/annotate-ui/index.html
  docs/ARCHITECTURE.md
)
VER="$(cat "$SRC/engine/VERSION" 2>/dev/null || echo '?')"
echo "litmap engine v$VER  →  ${#TARGETS[@]} project(s)"
for T in "${TARGETS[@]}"; do
  T="$(cd "$T" 2>/dev/null && pwd || echo "$T")"
  if [ ! -d "$T" ]; then echo "  SKIP (not found): $T"; continue; fi
  for f in "${SHARED[@]}"; do mkdir -p "$T/$(dirname "$f")"; cp "$SRC/$f" "$T/$f"; done
  drift=0; for f in "${SHARED[@]}"; do cmp -s "$SRC/$f" "$T/$f" || { echo "    DRIFT: $f"; drift=1; }; done
  echo "  $([ $drift -eq 0 ] && echo 'OK   ' || echo 'DRIFT') $T"
done
echo "done — commit each repo separately."
