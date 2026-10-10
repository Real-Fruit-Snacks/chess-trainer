#!/bin/sh
# Chess Trainer for Linux: run this file to start it (see README.txt).
here=$(cd "$(dirname "$0")" && pwd) || exit 1
case $(uname -m) in
  x86_64 | amd64) launcher="$here/bin/chess-trainer-linux-x64" ;;
  aarch64 | arm64) launcher="$here/bin/chess-trainer-linux-arm64" ;;
  *)
    echo "There is no launcher for this computer ($(uname -m)). The app folder is a static" >&2
    echo "website: serve it with any web server, from the root of a site (see README.txt)." >&2
    exit 1
    ;;
esac
[ -x "$launcher" ] || chmod +x "$launcher" 2>/dev/null
exec "$launcher" "$@"
