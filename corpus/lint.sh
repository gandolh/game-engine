#!/usr/bin/env bash
# Corpus health check. Run from anywhere: bash corpus/lint.sh [--index]
#
#   (no args)  lint: frontmatter presence, broken relative links, oversized pages
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

echo "== relative links resolve"
grep -oh '](\.\.[^)]*)' *.md | sed 's/^](//;s/)$//;s/#.*//' | sort -u | while read -r p; do
  [ -e "$p" ] || echo "  BROKEN: $p"
done | tee /tmp/corpus-broken.txt
[ -s /tmp/corpus-broken.txt ] && fail=1

echo "== page size (soft cap ${MAX_LINES} body lines — over means split)"
for f in *.md; do
  # body = everything after the closing --- of the frontmatter block
  n=$(awk 'NR>1 && /^---$/ {found=NR; exit} END {print found+0}' "$f")
  body=$(( $(wc -l < "$f") - n ))
  [ "$body" -gt "$MAX_LINES" ] && echo "  OVERSIZED ($body body lines): wiki/$f"
done

echo "== stale package roots (the pre-2026-07 layout)"
grep -l 'packages/' *.md 2>/dev/null | sed 's/^/  STALE: wiki\//' && fail=1

[ "$fail" -eq 0 ] && echo "corpus lint: OK" || echo "corpus lint: FAILURES above"
exit "$fail"
