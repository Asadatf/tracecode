#!/usr/bin/env bash
# One-time setup after cloning: ./scripts/onboard.sh
# Safe to re-run — every step skips itself when already done.
set -euo pipefail
cd "$(dirname "$0")/.."

REQUIRED_NODE="22.18.0"
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
ok() { printf '  ✓ %s\n' "$1"; }
warn() { printf '  ! %s\n' "$1"; }

# Node ≥ 22.18 — older 22.x can't load the .mts unit tests, and the pre-push
# hook runs them, so every push would be blocked.
step "Node ≥ $REQUIRED_NODE"
node_ok() { command -v node >/dev/null && node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=18)?0:1)"; }
if ! node_ok; then
	if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
		# shellcheck disable=SC1091
		. "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
		nvm install "$(cat .nvmrc)" >/dev/null
		# Resolve nvm's binary directly: 'nvm use' loses to another Node earlier
		# on PATH (e.g. Homebrew's node@22) while still reporting success.
		NODE_BIN="$(nvm which "$(cat .nvmrc)")"
		export PATH="$(dirname "$NODE_BIN"):$PATH"
	fi
fi
if node_ok; then
	ok "node $(node -v)"
	if [ -n "${NODE_BIN:-}" ]; then
		warn "using nvm's $(node -v) for this script only — run 'nvm alias default 22' and make sure no other Node (e.g. Homebrew's) comes first on PATH, or git push's pre-push tests fail"
	fi
else
	warn "node $(node -v 2>/dev/null || echo 'not found') — install Node 22 LTS (nvm: https://github.com/nvm-sh/nvm, then 'nvm install'), then re-run"
	exit 1
fi

# pnpm, pinned in package.json's packageManager
step "pnpm"
if ! command -v pnpm >/dev/null; then
	corepack enable
fi
ok "pnpm $(pnpm -v)"

# Also installs the git hooks (prepare → core.hooksPath .githooks:
# commit-msg format, secrets scan, pre-push gates) and generates the Prisma client.
step "Dependencies + git hooks"
pnpm install
[ "$(git config core.hooksPath)" = ".githooks" ] && ok "git hooks active (.githooks)" || warn "git hooks not active — run 'git config core.hooksPath .githooks'"

step "Environment"
if [ -f .env.local ]; then
	ok ".env.local already exists — left untouched"
else
	cp .env.example .env.local
	ok "created .env.local from .env.example — ask your teammate for the shared Supabase values"
fi

# Claude Code session logs: .claude/settings.json registers
# .claude/hooks/extract-log.py, which writes each session to .claude-logs/.
# Claude Code asks you to trust the project's hooks the first time you open it here.
step "Agent session logs"
command -v python3 >/dev/null && ok "python3 found — Claude Code sessions will log to .claude-logs/" || warn "python3 not found — the session-log hook needs it"
if grep -qs "extract-log.py" "$HOME/.claude/settings.json"; then
	warn "you also have extract-log.py in ~/.claude/settings.json — the project hook covers this repo, so it will run twice (harmless, same file)"
fi
echo "  Using Codex instead? Its transcripts go in .codex-logs/ (see docs/rules/secrets.md)."

step "Git identity"
if [ -n "$(git config user.name)" ] && [ -n "$(git config user.email)" ]; then
	ok "$(git config user.name) <$(git config user.email)>"
else
	warn "set git config user.name / user.email — commits and session logs are attributed with them"
fi
command -v gh >/dev/null && gh auth status >/dev/null 2>&1 && ok "gh signed in" || warn "install and sign in to the GitHub CLI ('gh auth login') — PRs and CI checks use it"

cat <<'MSG'

Done. Read next, in this order:
  1. specs/README.md          how we work with specs, fixes, ADRs; status board
  2. specs/00-product.md      what we're building and what's out of scope
  3. specs/02-trace-contract.md   the engine ↔ visualiser contract
  4. README.md → "Working in this repo"   branches, commits, PRs, merging

Run the app:  pnpm dev   (http://localhost:3000)
MSG
