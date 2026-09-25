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

## Manifest field impact

`classifyManifest({ base, head })` compares parsed manifest objects without reading
files or executing scripts. Each side supplies `manifest`, affected public
`packages` (or `null` when unknown), and `toolOnly: { dependencies, scripts }`.
Use `null` for an absent manifest; both absent is invalid. Public manifests may
omit `private`; known attribution must include their own name. Private/root
manifests use caller-supplied affected public identities. An empty attribution
list is known empty, but cannot satisfy a requiring change; it remains unresolved.

Tool-only lists are trusted evidence that those entries do not participate in
builds or shipped output, not permissions accepted from the PR. Both old and new
values need evidence when changed; additions need head evidence, deletions base.
The component validates JSON shape, nonempty names, dependency/script maps and
input lists. Callers establish identity attribution and tool-only provenance from
base-approved policy; this component does not discover or verify dependency graphs.

| Changed field                                                                                                                                                                    | Classification                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `name`, `private`, `version`, `description`, `license`, `repository`, `homepage`, `bugs`, `author`, `contributors`, `keywords`                                                   | Require affected-package coverage        |
| `type`, `main`, `module`, `browser`, `types`, `typings`, `exports`, `imports`, `bin`, `files`, `engines`, `os`, `cpu`, `libc`                                                    | Require                                  |
| `dependencies`, `optionalDependencies`, `peerDependencies`, `peerDependenciesMeta`, `bundledDependencies`, `bundleDependencies`, `publishConfig`, `packageManager`, `workspaces` | Require                                  |
| Scripts `build`, `prepack`, `prepare`, `prepublish`, `prepublishOnly`, `postpack`, `preinstall`, `install`, `postinstall`                                                        | Require regardless of tool-only evidence |
| Dev dependencies `typescript`, `@types/node`, `@types/cross-spawn`, `vite`, `rollup`, `esbuild`, `tsup`, `webpack`                                                               | Require regardless of tool-only evidence |
| Dev dependencies `eslint`, `@eslint/js`, `typescript-eslint`, `@typescript-eslint/parser`, `@typescript-eslint/rule-tester`, `vitest`, `@vitest/coverage-v8`, `prettier`         | Exempt only with tool-only evidence      |
| Any other field, dev dependency or script                                                                                                                                        | Unresolved                               |

Only these exact script name/command pairs can be exempt with tool-only evidence:

| Name            | Command                     |
| --------------- | --------------------------- |
| `test`          | `vitest run`                |
| `test:watch`    | `vitest`                    |
| `test:coverage` | `vitest run --coverage`     |
| `lint`          | `eslint . --max-warnings 0` |
| `format`        | `prettier --write .`        |
| `format:check`  | `prettier --check .`        |

Results retain per-field evidence (per entry for scripts/dev dependencies), with
unresolved taking precedence over require, then exempt. Known affected identities
remain present even when another change is unresolved. Missing attribution makes
requiring evidence unresolved. Entire added/deleted manifests require coverage
when attributable, otherwise remain unresolved; an empty evidence field path
identifies this whole-manifest case. Key ordering does not count as a change;
array ordering does. No semantic changes produce an exempt result with no evidence.
This is a component result, not a complete release decision or installed CI check.

## Normalized lockfile graph impact

`classifyLockfileGraph({ base, head })` classifies complete normalized dependency
graphs. It does not parse pnpm/YAML, discover dependencies, install packages, or
provide an integrated lockfile check. Each snapshot supplies:

- `complete: true`, plus a `metadataFingerprint` for global lockfile settings.
- Nodes with stable opaque `id`, `fingerprint`, and dependency-node IDs.
- Roots with stable `id`, `fingerprint`, `target`, trusted `impact`, and affected
  public `packages` (`null` means unknown).

The caller must preserve every dependency edge, including optional and peer
relationships, and all nonstructural data in canonical fingerprints, including
resolution/integrity metadata. Root identities distinguish importer, dependency
category and name; node identities distinguish peer-qualified instances. Global
metadata not represented by nodes/roots belongs in the metadata fingerprint.
Missing/unsupported normalization must never be presented as a complete graph.

Root impact is supplied by trusted base policy, never taken from a lockfile:
`exempt` proves exclusively internal test/lint/format usage and has no package
names; `require` represents runtime/build impact; `unresolved` means unknown usage.
The function validates shape, uniqueness and references, but cannot prove caller
completeness, policy provenance or fingerprints. Requiring roots without package
attribution remain unresolved; unknown roots retain any known package names.

| Change                                                                     | Result                                       |
| -------------------------------------------------------------------------- | -------------------------------------------- |
| Node reachable only from proven internal roots                             | Exempt                                       |
| Node shared with runtime/build roots                                       | Require every affected package               |
| Unknown root, missing attribution, or changed node orphaned on either side | Unresolved, retaining known package coverage |
| Root added, removed, rewired or reclassified                               | Combine old/new root impact                  |
| Global metadata fingerprint changes                                        | Unresolved                                   |
| Ordering changes or duplicate edges only                                   | No semantic change                           |

Traversal considers every reaching root on both sides and terminates on cycles.
Removed nodes and roots retain base coverage. Each changed node/root has evidence;
metadata has its own entry. Unknown takes precedence over require, then exempt.
Results and identifiers are deterministic; input arrays remain untouched. Dangling
references, duplicate node/root IDs and incomplete snapshots throw. Complete empty
graphs represent absent lockfiles; equal snapshots return exempt with no evidence.
