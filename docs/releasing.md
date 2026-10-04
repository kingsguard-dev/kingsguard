# Release preparation

Use the installed workspace tools through these commands:

| Command                   | Purpose                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm release:add-change` | Select packages, release types, and a summary using Changesets. Commit the generated record with the change. |
| `pnpm release:status`     | Inspect pending changes.                                                                                     |
| `pnpm release:prepare`    | Generate package versions and changelogs, then synchronize the React plugin's metadata version.              |

For example, record a React bug fix with `release:add-change`, choosing patch
when it does not expand diagnostics or break existing configuration. At release
time, `release:prepare` applies the pending records through Changesets. These
command names are stable entry points; their underlying tool can change later.

Preparation uses all pending Changesets. For the first React-only beta, manually
move CLI-only records outside `.changeset` before preparing, then restore them
afterwards for a later release. Do not discard them. Review any record covering
both packages separately before proceeding.

The initial beta is a one-time preparation: set the unpublished React package's
version baseline to `0.0.0`, retain its minor release record, then run:

```sh
pnpm exec changeset pre enter beta
pnpm release:prepare
```

This produces `0.1.0-beta.0`. Subsequent preparation uses the existing prerelease
state; do not reset the baseline or re-enter beta each time.

Before committing, inspect `git diff` and `git status`: confirm the intended
package versions, changelogs, React metadata, and Changesets records (including
prerelease state). If dependency ranges changed, refresh the lockfile with
`pnpm install --lockfile-only`. Run `pnpm check`, then review and commit.
Repository-only changes do not need a package changeset.

Failures remain visible and return a nonzero exit status. If Changesets fails,
metadata synchronization does not run. Inspect any generated changes before
continuing; the command does not automatically undo them. Preparation never
commits, tags, or publishes. Publication is a separate step.
