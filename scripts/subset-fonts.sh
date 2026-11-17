#!/usr/bin/env bash
# Generates src/assets/fonts/ optimized fonts from the `geist` package:
# The glyphs used by the web, without harming, without unnecessary tables and in woff2.
# Usage: pnpm fonts (requires uv: https://docs.astral.sh/uv/)
# Re-run it if you add content with new symbols (arrows, boxes, text emojis...).
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=node_modules/geist/dist/fonts
OUT=src/assets/fonts
FT=(uvx --from 'fonttools[woff]' fonttools)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Fixed base for new content in SPANol/catalan not to fall into the  fallback:
# Printable ASCII, Latin-1 (á é í ó ú ñ ü ç ¿ ¡ « » · …), and standard typographic punctuation.
BASE='U+0020-007E,U+00A0-00FF,U+0131,U+0152-0153,U+2013-2014,U+2018-201A,U+201C-201E,U+2022,U+2026,U+20AC,U+2122,U+2212'

# Plus all the characters that appear in the actual content of the website (pages, data and exercises).
# Those that do not exist in the source (e.g. emojis) are ignored.
{ find src -type f \( -name '*.astro' -o -name '*.ts' -o -name '*.css' -o -name '*.md' \); ls retos/*/README.md; } |
  xargs cat >"$TMP/text.txt"

OPTS=(
  --unicodes="$BASE"
  --text-file="$TMP/text.txt"
  # Only the ones that the browser applies by default (RVrn: variable replacements)
  --layout-features='kern,liga,ccmp,locl,mark,mkmk,rvrn'
  --no-hinting
  --desubroutinize
  --drop-tables+=DSIG,meta,STAT
  --name-IDs=1,2
  --flavor=woff2
)

mkdir -p "$OUT"

# Geist Variable Mono cut to the weights used by the web: 400, 500 (.intro ), and 700 (<1475>, <th>)
"${FT[@]}" varLib.instancer "$SRC/geist-mono/GeistMono-Variable.ttf" wght=400:700 -q -o "$TMP/mono.ttf"
"${FT[@]}" subset "$TMP/mono.ttf" "${OPTS[@]}" --output-file="$OUT/GeistMono-Latin.woff2"
"${FT[@]}" subset "$SRC/geist-pixel/GeistPixel-Square.woff2" "${OPTS[@]}" --output-file="$OUT/GeistPixel-Square-Latin.woff2"

ls -l "$OUT"
