#!/bin/sh
# Runs on the host before the container starts (initializeCommand). Stops early, with
# instructions, if the fine-grained token file is missing or readable by other users.
set -eu

file="${HOME}/.config/make-a-million/github-token"

if [ ! -s "$file" ]; then
  echo "No GitHub token found at $file." >&2
  echo "Create a fine-grained token as .devcontainer/README.md describes, then run:" >&2
  echo "  mkdir -p ~/.config/make-a-million && chmod 700 ~/.config/make-a-million" >&2
  echo "  (umask 077; cat > ~/.config/make-a-million/github-token)   # paste, then Ctrl-D" >&2
  exit 1
fi

mode="$(stat -c '%a' "$file" 2>/dev/null || stat -f '%Lp' "$file")"
case "$mode" in
  600 | 400) ;;
  *)
    echo "$file is mode $mode; run: chmod 600 $file" >&2
    exit 1
    ;;
esac
