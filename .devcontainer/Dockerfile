# Development image: Node 24, pnpm, Chromium for `pnpm e2e`, the GitHub CLI and Claude Code.
# Everything runs as the unprivileged `node` user; the image has no sudo.

FROM node:24-bookworm

# Chromium at /usr/bin/chromium is where apps/client/e2e/smoke.ts looks by default.
# The fonts cover glyphs the bundled web fonts lack (card suits, emoji).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium fonts-liberation fonts-noto-color-emoji \
    git less procps ripgrep \
  && rm -rf /var/lib/apt/lists/*

# GitHub CLI from GitHub's own apt repository (Debian's is too old).
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@12.21.0 --activate

ARG CLAUDE_CODE_VERSION=latest
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION} && npm cache clean --force

# The token helpers and the first-start script. The workspace volume is empty when the
# container starts, so these have to live in the image rather than in the repository.
COPY --chmod=755 git-credential-github-token gh-with-token post-create.sh /usr/local/lib/mam/
RUN ln -s /usr/local/lib/mam/gh-with-token /usr/local/bin/gh

# Docker fills an empty named volume from the image's contents at its mount point, ownership
# included, so creating the mount points here as `node` makes the volumes start out writable.
RUN mkdir -p /workspace /home/node/.local/share/pnpm /home/node/.claude \
  && chown -R node:node /workspace /home/node

USER node

# CLAUDE.md tells agents to run `source ~/.nvm/nvm.sh && nvm use 24` first. Node 24 is already
# the system Node here, so a no-op `nvm` keeps those commands working unchanged.
RUN mkdir -p /home/node/.nvm && printf 'nvm() { :; }\n' > /home/node/.nvm/nvm.sh

ENV PNPM_HOME=/home/node/.local/share/pnpm \
    CHROMIUM_PATH=/usr/bin/chromium
