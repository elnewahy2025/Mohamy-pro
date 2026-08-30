# AGENTS.md — Agent Instructions

## Canonical Working Directory

The canonical, single source of truth for this repository is:

```
/root/Mohamy-pro-backup
```

This is the full clone that is synced to the GitHub remote `elnewahy2025/Mohamy-pro`
(branch `main`). **All** git operations (commit, push, pull, checkout), code edits, skill
loading, and verification MUST be performed from this directory.

### Rules

1. **Never** operate on the stale worktree `/root/imported-project/...` (a truncated,
   upper case `Docs/` snapshot from an older lineage). It is not the source of truth.
2. **Never** run `git` operations or read/write code from any checkout other than
   `/root/Mohamy-pro-backup`.
3. If you are inside any other working directory, relocate to `/root/Mohamy-pro-backup`
   before reading or editing repository files.

## Mandatory Skills

Load and apply BOTH of the following skills (installed globally at `~/.agents/skills/`)
before any implementation, debugging, refactoring, testing, security, or review task:

- `engineering-governance` — evidence-based governance; never claim a result is verified
  unless the command was actually executed (record command, cwd, exit code, result).
- `single-responsibility-file-architecture` — strict file-level separation of
  responsibilities; one focused responsibility per file.

Use the `skill` tool with these names. If they are not visible in `<available_skills>`,
they may not have been registered for the current session — read their `SKILL.md` from
`~/.agents/skills/<name>/SKILL.md` directly and apply them.

## Data Safety

Preserve the user's work unconditionally. Never delete or overwrite repository content
without confirmation. When in doubt about whether data will be lost, create an offline
tarball backup first under `/root/safety-backups/`.
