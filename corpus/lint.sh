#!/usr/bin/env bash
# Corpus health check. Run from anywhere: bash corpus/lint.sh [--index]
#
#   (no args)  lint: frontmatter, link resolution (whole corpus), oversized pages, stale paths
#   --index    print the generated one-line-per-page index block for index.md
#
# Exit non-zero if any lint check fails, so this can gate a commit.
set -uo pipefail

CORPUS="$(cd "$(dirname "$0")" && pwd)"
WIKI="$CORPUS/wiki"
MAX_LINES=200
fail=0

cd "$WIKI" || exit 1

if [ "${1:-}" = "--index" ]; then
  for f in *.md; do
    printf -- '- [wiki/%s](wiki/%s) — %s\n' "$f" "$f" "$(sed -n '2s/^summary: //p' "$f")"
  done
  exit 0
fi

echo "== frontmatter (summary: + updated:)"
for f in *.md; do
  head -1 "$f" | grep -q '^---$' && sed -n '2p' "$f" | grep -q '^summary: ' \
    || { echo "  MISSING frontmatter: wiki/$f"; fail=1; }
done

# Link resolution, over the WHOLE corpus, for EVERY relative link.
#
# This used to check only wiki/*.md and only links starting with "../", which is why
# index.md sat with dead todos/ links for weeks and why 452 links broken by directory
# moves went unnoticed (2026-08-18 audit). Live pages must resolve 100%.
#
# The archives are held to a different bar, not a softer one. briefs/ and todos/closed/ are
# immutable specs: their references to CODE decay by design (the pre-2026-07 `packages/`
# layout, deliberately deleted webgpu//canvas2d/ dirs, renamed files) -- correct as history,
# so counted and reported, never failed on. Their references to other CORPUS DOCS are ours
# and stay fixable, so those still fail.
echo "== relative links resolve"
live_broken=0
arch_archival=0
arch_broken=0
while IFS= read -r f; do
  d=$(dirname "$f")
  # Markdown link targets, minus external schemes and pure anchors.
  grep -oh '](\([^)[:space:]]*\))' "$f" 2>/dev/null \
    | sed 's/^](//;s/)$//;s/#.*//' \
    | grep -v '^$' | grep -Ev '^(https?:|mailto:)' | sort -u \
  | while IFS= read -r p; do
      [ -e "$d/$p" ] && continue
      case "$f" in
        */briefs/*|*/todos/closed/*)
          # A corpus doc is ours and stays fixable -> fail. A code path (or a removed
          # skill) in a frozen spec decays as the tree moves on -> expected, just counted.
          case "$p" in
            *.md)
              case "$p" in
                *.claude/*) echo "ARCHIVAL" ;;
                *) echo "ARCHBROKEN ${f#$CORPUS/}: $p" ;;
              esac ;;
            *) echo "ARCHIVAL" ;;
          esac ;;
        *) echo "LIVEBROKEN ${f#$CORPUS/}: $p" ;;
      esac
    done
done < <(find "$CORPUS" -name '*.md') > /tmp/corpus-links.txt

live_broken=$(grep -c '^LIVEBROKEN' /tmp/corpus-links.txt || true)
arch_broken=$(grep -c '^ARCHBROKEN' /tmp/corpus-links.txt || true)
arch_archival=$(grep -c '^ARCHIVAL' /tmp/corpus-links.txt || true)

if [ "$live_broken" -gt 0 ]; then
  grep '^LIVEBROKEN' /tmp/corpus-links.txt | sed 's/^LIVEBROKEN /  BROKEN (live page): /'
  fail=1
fi
if [ "$arch_broken" -gt 0 ]; then
  grep '^ARCHBROKEN' /tmp/corpus-links.txt | sed 's/^ARCHBROKEN /  BROKEN (archive): /'
  fail=1
fi
echo "  live pages: $live_broken broken | archives: $arch_broken broken, $arch_archival archival (deleted code / pre-2026-07 layout — expected)"

echo "== page size (soft cap ${MAX_LINES} body lines — over means split)"
for f in *.md; do
  # body = everything after the closing --- of the frontmatter block
  n=$(awk 'NR>1 && /^---$/ {found=NR; exit} END {print found+0}' "$f")
  body=$(( $(wc -l < "$f") - n ))
  [ "$body" -gt "$MAX_LINES" ] && echo "  OVERSIZED ($body body lines): wiki/$f"
done

echo "== stale package roots (the pre-2026-07 layout) in live pages"
grep -l 'packages/' *.md 2>/dev/null | sed 's/^/  STALE: wiki\//' && fail=1

echo "== deleted render backends named as current in live pages"
for f in *.md ../index.md ../routing.md ../CLAUDE.md; do
  [ -e "$f" ] || continue
  # A live page may DISCUSS WebGPU/Canvas2D as history; it must not LINK into their
  # deleted directories, which is what an as-if-current reference looks like.
  grep -o '](\([^)[:space:]]*\))' "$f" 2>/dev/null | sed 's/^](//;s/)$//' \
    | grep -E 'render/webgpu/|render3d/webgpu/|render/canvas2d/|\.wgsl' \
    | sed "s|^|  DELETED-BACKEND LINK in ${f#../}: |" && fail=1
done

[ "$fail" -eq 0 ] && echo "corpus lint: OK" || echo "corpus lint: FAILURES above"
exit "$fail"
