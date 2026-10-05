#!/usr/bin/env bash
# Propagate the shared litmap framework (engine + pipeline + docs) from this
# canonical repo to the consuming map projects. Workflow: edit shared files HERE
# in litmap, bump engine/VERSION on a notable change, then run ./sync-engine.sh.
# Project-specific files (config.json, data/, index.html) are never touched.
#
#   ./sync-engine.sh                  sync into ALL targets
#   ./sync-engine.sh mappingJoyce     sync only into targets whose directory
#                                     name matches one of the arguments
# Branches are not tracked: while litmap is on an experiment branch, sync only
# into the project(s) checked out on the matching branch.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
TARGETS=(
  "$SRC/../mappingPerutz"
  "$SRC/../hermesj.github.io/mappingJoyce"
  "$SRC/../mappingWoolf"
  "$SRC/../mappingRoth"
)
SHARED=(
  engine/engine.js engine/engine.css engine/VERSION
  pipeline/geocode_source.py pipeline/overlay.py pipeline/check.py
  pipeline/annotate-ui/serve.py pipeline/annotate-ui/app.js pipeline/annotate-ui/index.html
  pipeline/import_umap.py pipeline/export_umap.py pipeline/consolidate.py
  pipeline/geojson_to_kml.py pipeline/README.md pipeline/annotate-ui/README.md
  docs/ARCHITECTURE.md docs/engine-vs-project.svg
)
if [ $# -gt 0 ]; then                      # optional filter by directory name
  SEL=()
  for T in "${TARGETS[@]}"; do
    for want in "$@"; do [ "$(basename "$T")" = "$want" ] && SEL+=("$T"); done
  done
  [ ${#SEL[@]} -gt 0 ] || { echo "no target matches: $*"; exit 1; }
  TARGETS=("${SEL[@]}")
fi
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
