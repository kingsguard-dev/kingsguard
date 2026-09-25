# Release path impact

`classifyPaths` is a pure internal component, not an installed release check.
It consumes a complete changed-path list and independently complete base/head
workspace package inventories. It does not read files, discover packages, parse
manifests/lockfiles, validate notes, infer release types, or grant exemptions.

Callers must supply explicit `private`, `shipped`, and `build` metadata for every
workspace package, including removed packages in base and new packages in head.
The private repository root is not a workspace package; its manifest is deferred
separately. Empty arrays mean known empty metadata, never unavailable data.
Selectors are normalized repository-relative literal files or directory subtrees,
not package-relative paths or packaging globs. Absolute paths, empty/dot segments,
backslashes, control characters, colons, and glob metacharacters (`*?[]{}`) are
rejected rather than normalized. Resolve packaging/build metadata
before calling; this component cannot prove a caller's completeness assertion.
`src` under each public package is always source. Other source locations must be
included in build inputs. Shared build inputs name public packages on that side;
`null` attribution produces unresolved evidence. Root `tsconfig.json` defaults to
all known public packages when no supplied impact matches it.

Each change retains base/head evidence and the union of affected public identities.
Unknown evidence takes precedence over require, which takes precedence over
exempt. Thus a rename to an unknown path remains unresolved while retaining its
old package coverage obligation. A requiring side cannot disappear behind an
internal-only destination. Manifest and lockfile paths are always deferred as
unresolved for sibling content classifiers, even if listed as shipped.

Known internal paths cover root docs/tests/README, package tests, CI workflows,
current lint/format/test configuration, and Changeset Markdown/configuration.
Public source, shipped, and build inputs override these exemptions; arbitrary
Markdown, private-package source, unknown configuration, and unknown files remain
unresolved. Trusted callers must use base-approved policy and reliable inventories;
PR edits to this code cannot authorize their own exemption. No overall pass/fail
or complete release decision should be inferred from these partial results.
