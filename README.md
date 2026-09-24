# Kingsguard

Framework-aware tooling for safer and more declarative UIs.

Kingsguard is the ecosystem; **Sentinel** is its first product: an ESLint plugin
that helps keep UI state declarative, starting with React.

## Development

Use Node.js 24 with pnpm 10.12.1 (see `packageManager`) for development.
The published plugin has its own runtime requirements.

```sh
pnpm install
pnpm check
pnpm test:watch
```

`check` runs formatting, lint, type checking, tests, and package builds. CI runs
the same checks on Node 22 and 24. TypeScript stays on 5.9 while the
typescript-eslint dependency supports TypeScript versions below 6.1.

### Test coverage

Run `pnpm test:coverage` to print a summary of statements, branches, functions,
and lines, and generate `coverage/index.html` and `coverage/lcov.info`. Open the
HTML file in a browser to inspect coverage against the original source.
Coverage includes production JavaScript (`.js`) and TypeScript under each package's
`src` directory,
including files no test imports. Tests, declarations, generated directories,
build output, and dependencies are excluded.

CI collects coverage once, on Node 24, for pushes and pull requests. In GitHub,
open **Actions → CI → the run**, download the **coverage-node-24** artifact,
extract it, and open `index.html`; `lcov.info` is included in the same archive.
Reports are generated only after successful checks and tests. Coverage execution
or missing reports fail the job; no minimum coverage threshold is enforced.
Generated reports are ignored by Git and excluded from published package files.

## Workspace

```text
packages/
  sentinel-react/
    src/
      adapters/react.ts       React binding and ref recognition
      rules/                  ESLint diagnostics
      index.ts                Plugin and React flat preset
    tests/                    RuleTester and ESLint integration tests
docs/
  rules/                      Rule behavior and migration examples
  architecture.md             Boundaries and future extensions
```

The workspace starts with one real package, `@kingsguard/eslint-plugin-sentinel-react`.
See its [setup instructions](packages/sentinel-react/README.md) and the first rule,
[no-dom-state](docs/rules/no-dom-state.md).

The minimal `@kingsguard/cli` package currently supports `--help` and `--version`.
See [CLI package instructions](packages/cli/README.md).

Angular, Vue, and axe-core are future work, not implemented integrations.
See the [architecture notes](docs/architecture.md) before extending the project.

## Contributing

Add a rule with valid and invalid cases, document its limits, and run `pnpm check`.
Prefer evidence of framework ownership over broad API blacklists. Keep framework
recognition in adapters and avoid introducing shared packages until there are
multiple consumers. This initial scaffold has no publishing automation.

## License

MIT — see [LICENSE](LICENSE).
