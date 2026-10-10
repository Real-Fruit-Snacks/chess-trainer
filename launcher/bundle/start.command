#!/bin/sh
# Chess Trainer for macOS: double-click this file to start it (see README.txt).
here=$(cd "$(dirname "$0")" && pwd) || exit 1
# A downloaded folder is quarantined, and macOS would stop the launcher inside it
# even once this script has been allowed to run: lift the flag from this folder.
xattr -dr com.apple.quarantine "$here" 2>/dev/null
case $(uname -m) in
  arm64) launcher="$here/bin/chess-trainer-macos-arm64" ;;
  *) launcher="$here/bin/chess-trainer-macos-x64" ;;
esac
[ -x "$launcher" ] || chmod +x "$launcher" 2>/dev/null
exec "$launcher" "$@"
