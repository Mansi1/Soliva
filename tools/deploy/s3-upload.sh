#!/bin/sh
# Lädt einen Build nach S3 hinter CloudFront (infra/app.ts): tools/deploy/s3-upload.sh dist s3://<bucket>[/pr-<n>]
# Braucht die AWS CLI mit Zugang und node. Löscht nichts: Offene Tabs laden noch Chunks des alten Stands nach.
set -eu
dist=$1
target=$2

# Ohne `git lfs pull` baut Vite die Zeiger-Dateien klaglos mit ein - die Seite wäre ohne Musik.
if grep -rlI '^version https://git-lfs.github.com/spec/v1' "$dist"; then
  echo "Git-LFS-Zeiger statt Dateien im Build (oben gelistet) - vor dem Build git lfs pull." >&2
  exit 1
fi

# CloudFront komprimiert nur Dateien bis 10.000.000 Byte. Größere (world-*.js, ~18 MB) liegen darum
# schon mit Brotli kodiert in S3; jeder Browser mit WebGL 2 versteht br.
# ponytail: Clients ohne br bekommen die Datei trotzdem br-kodiert; Aushandlung per CloudFront Function
# mit .gz daneben einbauen, wenn das jemand braucht. Entfällt, sobald kein Chunk mehr über 10 MB ist.
big=$(find "$dist" -type f -size +10000000c)
set --  # sammelt die --exclude für den Sync der übrigen Assets
for f in $big; do
  case $f in "$dist"/assets/*) ;; *) echo "$f: über 10 MB, aber ohne Hash in assets/ - immutable wäre falsch." >&2; exit 1 ;; esac
  node -e 'const fs = require("node:fs"), zlib = require("node:zlib"); const f = process.argv[1];
    fs.writeFileSync(f, zlib.brotliCompressSync(fs.readFileSync(f), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }));' "$f"
  set -- "$@" --exclude "${f#"$dist/assets/"}"
done

immutable='public, max-age=31536000, immutable'
# Erst die Assets (Hash im Namen, ändern sich nie), zuletzt der Rest samt index.html: So zeigt eine
# neue index.html nie auf Chunks, die noch fehlen.
aws s3 sync "$dist/assets" "$target/assets" --cache-control "$immutable" "$@"
for f in $big; do
  aws s3 cp "$f" "$target/${f#"$dist/"}" --cache-control "$immutable" --content-encoding br
done
aws s3 sync "$dist" "$target" --exclude 'assets/*' --cache-control 'public, max-age=0, must-revalidate'
