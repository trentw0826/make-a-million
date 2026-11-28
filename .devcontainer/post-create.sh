#!/bin/sh
# Runs once, when the container is created: clones the repository into the empty workspace
# volume using the fine-grained token, pins git to that token, and installs dependencies.
set -eu

helper=/usr/local/lib/mam/git-credential-github-token
cd /workspace

if [ ! -d .git ]; then
  echo "Cloning $MAM_REPO_URL into /workspace"
  # The empty helper first clears any credential helper VS Code forwarded from the host.
  git -c credential.helper= -c "credential.helper=$helper" clone "$MAM_REPO_URL" .
fi

# Local config is read last, so this reset also wins over helpers in ~/.gitconfig: inside the
# container the only GitHub credential is the token.
git config --local --unset-all credential.helper 2>/dev/null || true
git config --local --add credential.helper ''
git config --local --add credential.helper "$helper"
git config --local remote.origin.url "$MAM_REPO_URL"

pnpm install --frozen-lockfile

if [ -z "$(git config user.name || true)" ] || [ -z "$(git config user.email || true)" ]; then
  echo
  echo "No git identity is set. Before committing, run:"
  echo "  git config --global user.name  'Your Name'"
  echo "  git config --global user.email 'you@users.noreply.github.com'"
fi
