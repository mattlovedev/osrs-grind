# Working in this repo

## Git workflow — read before committing anything

A push to `main` triggers a real, automatic deploy to production Cloud Run
(`.github/workflows/deploy.yml`, via GitHub Actions + Workload Identity
Federation — see `docs/DESIGN.md` "Roadmap - deployment" for the full
setup). That changes what "just commit it" safely means in this repo:

- **Docs-only changes** (`docs/DESIGN.md`, `README.md`, this file) — fine
  to commit and push straight to `main` without asking first. These paths
  are excluded from the deploy workflow's trigger (`paths-ignore`), so
  this never costs a deploy.
- **Any code or config change** — never commit directly to `main`.
  Commit to a branch instead (create one if currently on `main`). The
  branch doesn't need a name matching the work, and doesn't need to be
  one-branch-per-feature — batching several loosely-related or unrelated
  commits onto one working branch is fine. Only commit when explicitly
  told to (implement → let the user test/confirm → commit on request,
  never automatically right after a change looks done).
- **Merging that branch into `main`** is a separate, higher-bar action
  from committing — do it only when explicitly told to merge/deploy/ship,
  never inferred from a commit instruction or a "looks good." Merge with
  a plain `git merge` (or `git merge --no-ff` for an explicit merge commit
  even when a fast-forward would apply) — never `--squash` or anything
  else that collapses a branch's commits into one. No PRs on this repo,
  so there's no "squash and merge" button to worry about either.
- **After merging and pushing to `main`, delete the feature branch —
  local and remote — without asking.** Nothing does this automatically
  here: no PRs means no "delete branch" button, and a plain `git merge`
  never removes the source branch on its own. Once merged, the branch's
  commits are permanently part of `main`'s history regardless of deploy
  outcome, so cleanup isn't gated on the deploy succeeding.
  `git branch -d <branch>` (safe delete - refuses if somehow not fully
  merged) then `git push origin --delete <branch>`.

This applies regardless of which machine or session you're reading this
from — it's a fact about how this repo is wired, not a one-off
instruction from a single conversation.
