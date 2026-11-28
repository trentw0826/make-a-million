# Dev container

A container for working on this repository, and for running Claude Code unattended, that
shares nothing with the host except one read-only GitHub token scoped to this repository.

The container doesn't mount your checkout. On first start it clones the repository from GitHub
into a container volume, and all work happens there. You move work between the container and
the host by pushing to GitHub.

## One-time setup

1. **Create a fine-grained personal access token** at GitHub → Settings → Developer settings →
   Fine-grained tokens:
   - Repository access: **Only select repositories** → `make-a-million`.
   - Repository permissions:
     - Contents: **Read and write** (clone, fetch, push branches)
     - Pull requests: **Read and write** (`gh pr create`, review comments)
     - Actions: **Read** (`gh run watch`, CI logs)
     - Commit statuses: **Read** (`gh pr checks`)
     - Metadata: Read (required, added automatically)
   - Leave everything else, including **Workflows**, at *No access*. Without Workflows, the
     token can't push changes to `.github/workflows/`, so the container can't change CI.
   - Set an expiry date.
2. **Save the token on the host**, outside the repository:

   ```sh
   mkdir -p ~/.config/make-a-million && chmod 700 ~/.config/make-a-million
   (umask 077; cat > ~/.config/make-a-million/github-token)   # paste, Enter, Ctrl-D
   ```

   `check-token.sh` refuses to start the container if the file is missing or readable by
   other users.
3. **Protect `main` on GitHub** (Settings → Rules → Rulesets): require a pull request before
   merging. A fine-grained token can't be limited to particular branches, so this rule is what
   stops the container from pushing straight to `main`.
4. **Turn off VS Code's credential forwarding** in your *host* user settings. The container
   already ignores forwarded git helpers and SSH agents, but turning them off means they're
   never offered:

   ```json
   "dev.containers.copyGitConfig": false,
   "dev.containers.gitCredentialHelperConfigLocation": "none",
   "dev.containers.dockerCredentialHelper": false
   ```

## Starting it

Open this folder in VS Code and choose **Dev Containers: Reopen in Container**, or run
`devcontainer up --workspace-folder .`. The first start clones the repository, sets git to
use the token and runs `pnpm install`. Then set a git identity inside the container
(`git config --global user.name …` and `user.email` with your GitHub noreply address).

`pnpm dev`, `pnpm check` and `pnpm e2e` work as the main README describes. Ports 5173 (Vite)
and 3000 (server) are forwarded to the host. Claude Code keeps its login in its own volume, so
you sign in once inside the container.

## What the container can reach

| Resource | Inside the container |
| --- | --- |
| Host checkout, `$HOME`, `~/.ssh`, `~/.claude`, `~/.gitconfig` | Not mounted |
| Source code, `node_modules` | A container volume, cloned from GitHub |
| GitHub | This repository only, with the token's permissions |
| Docker socket | Not mounted |
| Root | No sudo; all capabilities dropped; `no-new-privileges` |
| Network | Unrestricted outbound (npm, GitHub, Anthropic API) |

Git and `gh` read the token from `/run/secrets/github-token` at the moment they need it: git
through a credential helper that never stores it, and `gh` through a wrapper. The token is never
kept in the environment or in a config file. Any process in the container can still read that
file, so treat the token as the container's to use, and keep its scope narrow.

## Things to know

- **Unpushed work lives only in the volume.** Rebuilding the container keeps it; deleting the
  `mam-<id>-workspace` volume does not. Push branches often.
- **The host checkout still matters, but only for its `.devcontainer/` files.** VS Code reads
  the container setup from there, so a change to these files takes effect after you pull it on
  the host and rebuild.
- **Outbound network is open.** To restrict it to an allowlist, add a firewall like the one
  in Anthropic's reference dev container. That needs `NET_ADMIN`, which this setup leaves out.
- **Rotating the token:** overwrite the host file in place
  (`(umask 077; cat > ~/.config/make-a-million/github-token)`), and the container sees the new
  token at once. An editor that saves by replacing the file leaves the container on the old
  one until it restarts.
- **Starting clean:** remove the container and its `mam-<id>-*` volumes with
  `docker volume rm`, then reopen it.
