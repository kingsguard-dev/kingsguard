# Kingsguard project instructions

You are working on Kingsguard:
<https://github.com/kingsguard-dev/kingsguard>

Kingsguard is an ecosystem of framework-aware UI tools. Its first product,
Sentinel, is an ESLint plugin that helps developers keep UI state declarative,
starting with React.

## Before making changes

- Read AGENTS.md if present, the README, docs/architecture.md, and relevant rules
  and tests.
- Check the current branch, uncommitted changes, and the merge status of PR #1.
  The initial scaffold is on feat/sentinel-scaffold. Avoid recreating existing
  functionality.
- Understand the existing implementation before modifying it.

## Development principles

- Keep the implementation small and focused. Use the existing pnpm, TypeScript,
  ESLint, and Vitest tooling.
- Recognize framework ownership and lexical scope. Do not rely solely on variable
  names or broadly prohibit DOM APIs.
- Minimize false positives. Preserve legitimate imperative operations such as
  focus, scrolling, and measurements.
- Keep React recognition logic in the adapter and diagnostic logic in rules.
- Angular, Vue, and axe-core are future extensions. Do not add placeholder packages
  or large abstractions unless the current task requires them.
- Do not introduce automatic fixes that could change behavior unless their safety
  can be demonstrated.
- Preserve existing user changes and avoid unrelated refactoring.

## Parallel slice development

- Before implementation, give each slice a specification with scope, exclusions,
  acceptance tests, and real dependencies. Apply the independent review process
  below to the specifications before dispatch. Specification review does not
  approve a future design that is still a task.
- Run independent, ready slices concurrently when useful. A design investigation
  may run alongside unrelated implementation, but its dependent implementation
  must wait for the design and any required review. Shared files alone are not a
  task dependency.
- Give each implementation worker a separate Git worktree and task branch from
  a recorded base commit. Never let concurrent workers edit the same checkout.
  Supply the issue specification, worktree path, branch, and expected deliverable;
  workers must verify their directory and branch before making changes.
- The coordinator supplies task and context snapshots to workers and collects
  their findings, progress, and validation. Keep coordination records separate
  from concurrent source edits.
- Workers stay within their slice, run its checks, and return commit/branch or PR
  references, validation results, and known limitations. Send newly discovered
  work or blockers to the coordinator rather than silently expanding scope.
- The coordinator integrates overlapping changes one at a time into a task or
  integration branch, preserving earlier slices' behavior and tests. Resolve
  conflicts deliberately and run `pnpm check` after each integrated slice before
  proceeding. Independent branch checks do not validate the combined result.
  This does not authorize merging GitHub PRs or publishing packages.
- Record review outcomes, integration status, validation, and PR links with the task.
  Keep implementation completion separate from integration/merge status; if
  integration remains outstanding, track it explicitly rather than implying
  that closing a slice means it has landed.

## Independent slice review

- Before dispatching reviewers, present the review scope, exclusions, acceptance
  criteria, and required validation evidence to the user. Wait for the user to
  confirm these conditions before starting the review. Apply this requirement to
  both specification and implementation reviews. If the conditions change
  materially, obtain confirmation again before reviewing the changed scope.
- Each slice requires two independent reviewers at the specification gate and
  again for the completed implementation (or design deliverable). Use fresh
  contexts, separate from the implementer, with the same specification snapshot,
  repository base, and candidate commit or frozen diff. Reviewers inspect the
  relevant source, tests, documented escape hatches, and acceptance criteria.
- Collect both initial reports before sharing either reviewer's conclusions with
  the other. Reviews must identify evidence, severity, and a ready/blocked verdict;
  passing tests alone are not proof that the specification is satisfied.
- Reviewers are read-only: do not edit files or commit. Run checks
  only in an isolated review checkout when they produce files. The coordinator
  supplies snapshots and records reviewer identities, reviewed versions, reports,
  decisions, and validation with the task.
- If the reports disagree on correctness, scope, severity, or readiness, assign a
  third, fresh-context reviewer who did not implement or perform either review.
  Give this neutral reviewer the same reviewed artifacts, the disputed claims,
  and both reports. Resolve the dispute using specification evidence and focused
  tests, not majority voting. Agreeing findings do not require a third reviewer.
- If the dispute exposes unclear product intent or an unspecified escape hatch,
  ask the user to decide that specific behavior. Keep affected work blocked while
  continuing independent work. Record the decision and update the specification
  and acceptance tests before resuming; reviewers must not invent product policy.
- After fixes, recheck the findings against the updated version and run relevant
  checks. Both original reviewers assess the changed scope and update their
  verdicts; use a neutral reviewer for remaining disagreements. Changed behavior
  or scope invalidates approval for that portion, not unrelated verified work.
- Release a review gate only when both reviewers agree there are no unresolved
  blocking findings, or the neutral review resolves the disagreement with recorded
  evidence. Required product decisions and validation must also be complete. Do
  not treat missing reviews as approvals or close a slice with unresolved blockers.
  Prior single-review results remain evidence but do not satisfy this two-reviewer
  policy on their own. Review approval does not authorize merging a PR.

## Pull request titles

- Use `type(scope): description` for every PR title, written in English.
- Choose a lowercase type: `feat`, `fix`, `docs`, `test`, `ci`, `chore`, or
  `refactor`. Use a short scope that identifies the affected feature or area.
- Start the description with an imperative verb and state the concrete change.
  Keep it concise and update it if the PR scope changes.
- Examples: `chore(release): set up Changesets`,
  `ci(macos): test on Node 22 and 24`, and
  `docs(agents): require release change records`.
- This convention applies to PR titles; it does not change branch naming or
  determine package version bumps.

## Pull request descriptions

- Write in plain English. Start with one short sentence explaining what the PR
  changes and why it matters.
- Use Markdown subheadings to separate sections. Default to `Changes` and
  `Validation`; add sections such as `Commands` only when they help the reader.
- Describe concrete behavior with short paragraphs or bullets. Use a table when
  comparing several commands and their purposes. Avoid dense implementation
  detail, unexplained jargon, and conversational history.
- Report checks actually run and their results. Clearly label pending checks or
  reviews. Mention relevant limitations and deferred work without implying that
  they are implemented.
- Keep the description aligned with the final diff after scope or naming changes.

## After a pull request is merged

- Verify that the PR is merged, then clean up its remote branch, local task
  branch, and associated task worktree. Prune stale remote-tracking references.
  Clean up only that PR's branches and worktree; never delete the default branch
  or unrelated work.
- Before deleting local resources, check for uncommitted or untracked work and
  commits added after the merged PR head. Preserve any such work and report what
  prevented cleanup. Verify the PR head when squash or rebase merging makes Git
  ancestry checks insufficient; do not force removal merely to bypass a warning.
- Run worktree removal from another checkout. Keep the primary project directory;
  if it is on the merged task branch, switch it to the default branch only when
  safe before deleting the task branch. Never remove a worktree still in use by
  another active task. Report completed cleanup and anything retained.

## Completion requirements

- When adding or changing a rule, include valid cases, invalid cases, and tests
  covering potential false positives.
- Update relevant documentation and explain detection boundaries and limitations.
- Run pnpm check and resolve issues introduced by your changes.
- Include a changeset with the PR when changes affect a published package's
  behavior, API, shipped files, or consumer compatibility. Name the affected
  package, describe the user-facing change, and choose the release type using
  the agreed release policy. Ask about unclear release semantics rather than
  guessing the version bump.
- Internal-only changes may omit a changeset; explain why in the PR. Judge the
  actual package impact, not just file extensions. Release-preparation changes
  that only consume approved changesets do not require another changeset.
- Check the available package scripts before creating the record. Use
  `pnpm release:add-change` when provided, or `pnpm exec changeset` when the
  repository-local Changesets CLI is installed. Include the generated file in
  the implementation commit. Do not change package versions or publish as part
  of recording a change, and do not rely on CI alone to catch missing records.
- Unless explicitly instructed otherwise, commit completed changes on a task
  branch, push the branch, and create a pull request (or update the existing pull
  request for that task). Include a summary, validation results, and known
  limitations in the pull request description, and report its URL to the user.
- Report what changed, validation results, and known limitations.
- Do not publish npm packages or merge pull requests unless explicitly requested.
