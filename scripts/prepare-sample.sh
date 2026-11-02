#!/usr/bin/env bash
# Compress a swing clip for bundling in public/samples/ and extract a poster frame.
# Usage: scripts/prepare-sample.sh <input-video> <output-name>   (e.g. sample-face-on)
# Keeps the native frame rate (important for slow-motion clips), drops audio,
# caps the shorter side at 720px (works for portrait phone clips), and writes
# web-friendly H.264 with faststart. Phone rotation metadata is applied automatically.
set -euo pipefail

if [ $# -ne 2 ]; then
  echo "Usage: $0 <input-video> <output-name>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/public/samples"
mkdir -p "$OUT_DIR"

ffmpeg -y -i "$1" -an \
  -vf "scale='if(gt(iw,ih),-2,min(720,iw))':'if(gt(iw,ih),min(720,ih),-2)'" \
  -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart \
  "$OUT_DIR/$2.mp4"

ffmpeg -y -ss 0.1 -i "$OUT_DIR/$2.mp4" -frames:v 1 -vf "scale=320:-2" -q:v 4 "$OUT_DIR/$2.jpg"

du -h "$OUT_DIR/$2.mp4" "$OUT_DIR/$2.jpg"
