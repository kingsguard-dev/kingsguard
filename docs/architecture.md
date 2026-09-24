# Architecture

Sentinel provides one ESLint plugin package per framework in this monorepo.
Currently only `@kingsguard/eslint-plugin-sentinel-react` is implemented.
There is no bundler, task orchestrator, or shared core package. pnpm manages workspaces; TypeScript emits ESM and declarations;
ESLint, Vitest, and Prettier provide linting, tests, and formatting.

The React adapter resolves lexical bindings for imports, ref factories, and JSX
refs. Rules decide which recognized operations merit a diagnostic. The plugin
entry point owns React rule registration and `configs.recommended`.
The rule namespace is `@kingsguard/react`. Users install only the framework
package they need.

This follows the [typescript-eslint custom-rule API](https://typescript-eslint.io/developers/custom-rules/)
and [ESLint flat plugin configuration](https://eslint.org/docs/latest/extend/plugins).

## Extension points

- Add React rules alongside the existing rule and reuse adapter recognition.
- Add Angular or Vue support in separate packages only when their parser and
  template ownership semantics are understood. Each package owns its dependencies,
  parser integration, recommended preset, namespace, tests, and release version.
  React JSX recognition must not become a universal ownership assumption.
- Extract `@kingsguard/core` when multiple products actually need shared concepts.
  Avoid forcing unrelated framework ASTs into an interface prematurely.
- Add `@kingsguard/axe` as a separate runtime accessibility integration when
  needed. axe-core requires rendered DOM and belongs outside static ESLint rules.
  Keep its browser/runtime dependencies out of Sentinel.

The browser document-query guard uses lexical scope to distinguish unshadowed
browser globals from local objects. It runs throughout enabled files without
React ownership evidence; its diagnostic policy lives in its rule.

## Intentional limits

The first rule is syntax- and scope-aware, not type- or data-flow-aware. It requires
a direct React ref factory and an intrinsic JSX ref binding in the same file.
It does not prove every runtime value is a DOM element. Conservative coverage and
explicit documentation are preferable to claiming universal DOM operation detection.
Within recognized refs, the rule applies one built-in operation allow list: direct
calls, reads, and writes have distinct permissions. Unknown members are denied.
Direct `const node = ref.current` aliases are recognized within their declaring
function, including nested blocks. Ref-object aliases, alias chains, uses in
nested functions, reflection on bare nodes, and interprocedural behavior remain
detection gaps; effects and third-party calls are not automatic exemptions.

The `@kingsguard/cli` package provides help and version output.

The computed-style guard is a separate global-browser rule: it resolves lexical
bindings for browser APIs without requiring React ref or JSX ownership. Its
read/reference diagnostics live in the rule; it shares the existing static member
and expression-wrapper helpers. It does not infer intent from effects or SDK calls.
