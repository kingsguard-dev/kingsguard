# Sentinel React

React ESLint rules for declarative UIs, part of Kingsguard.

## Installation

The first beta is `0.1.0-beta.0`. Once it is published, install it into a project
with a working ESLint flat configuration:

```sh
npm install --save-dev @kingsguard/eslint-plugin-sentinel-react@0.1.0-beta.0
```

To test a release candidate before publication, install the supplied tarball instead:

```sh
npm install --save-dev /absolute/path/to/kingsguard-eslint-plugin-sentinel-react-0.1.0-beta.0.tgz
```

Use ESLint 8.57+, 9, or 10
and a compatible TypeScript version (currently `>=4.8.4 <6.1.0`). The supported
ESLint range is for flat config only; the packed package is checked with ESLint
8.57.0, 8.57.1, 9.39.5, and 10.10.0 on Node 22 and 24. The package is ESM-only
and requires Node.js 22.12+. Your ESLint and parser versions may require a newer
Node.js version. Keep the parser and other settings from your working configuration
when adding Sentinel; it does not set up ESLint for you.

Append `sentinel.configs.recommended` to your existing configuration array:

```js
// eslint.config.mjs
import sentinel from '@kingsguard/eslint-plugin-sentinel-react';

export default [sentinel.configs.recommended];
```

For TypeScript/TSX, keep your existing TypeScript parser setup. For example, a
project using `typescript-eslint` can append Sentinel after its configuration:

```js
import tseslint from 'typescript-eslint';
import sentinel from '@kingsguard/eslint-plugin-sentinel-react';

export default [...tseslint.configs.recommended, sentinel.configs.recommended];
```

The flat React preset enables all three rules at error severity:

- `@kingsguard/react/no-dom-state`
- `@kingsguard/react/no-dom-query`
- `@kingsguard/react/no-computed-style`

No type-aware linting or React runtime dependency is required.
Legacy `.eslintrc` configuration and plugin loading are not supported. Use the
flat preset `sentinel.configs.recommended`. For ESLint 8, set
`ESLINT_USE_FLAT_CONFIG=true` when invoking ESLint; the compatibility matrix
checks this explicit flat-config path rather than default config discovery.
The React preset belongs to this plugin; it does not require separate
`@kingsguard/core` or `@kingsguard/axe` packages.

For TypeScript code that imports Sentinel's declarations with ESLint 8, also
install `@types/eslint@8`. ESLint 9 and 10 include their own declarations.

Run `npx eslint .` to check your project. Violations fail lint and CI by
default. For gradual adoption, override selected rules to `warn` in a later
flat-config entry, or use `off` to disable a rule:

```js
import sentinel from '@kingsguard/eslint-plugin-sentinel-react';

export default [
  sentinel.configs.recommended,
  {
    rules: {
      '@kingsguard/react/no-dom-state': 'warn',
      '@kingsguard/react/no-dom-query': 'warn',
      '@kingsguard/react/no-computed-style': 'warn',
    },
  },
];
```

## DOM-ref operation guard

For a React ref attached to a native JSX element, Sentinel allows only its
built-in operations: direct focus, scrolling, selection, measurement and playback
calls; scalar geometry/scroll reads; and scroll-position writes. Other direct
member reads, calls, and writes report. Prefer JSX props derived from React
state. Ordinary data refs remain outside this DOM-ref rule.
Direct `const node = ref.current` aliases are checked in their declaring function.

See the [full rule documentation](https://github.com/kingsguard-dev/kingsguard/blob/main/docs/rules/no-dom-state.md)
for exact coverage, exceptions, and limitations. No automatic fix is offered.

## Browser document queries

`no-dom-query` reports browser document `getElementById`,
`querySelector`, and `querySelectorAll` accesses, including method retrieval and
direct static destructuring. It applies throughout enabled files, including files
without React imports or JSX. Local bindings shadowing browser globals remain
allowed. Prefer React refs for element access; effects and SDK calls are not
automatic exemptions.

See [query rule coverage and limitations](https://github.com/kingsguard-dev/kingsguard/blob/main/docs/rules/no-dom-query.md)
for supported receivers, detection gaps, severity configuration, and explained
ESLint suppressions. No autofix or custom rule options are provided.

## Computed-style guard

The React preset also enables
`@kingsguard/react/no-computed-style` at error severity.
It reports browser `getComputedStyle` reads, captured references, and direct static
extraction in every file scope, including files without React imports or JSX.
Prefer React state and props as the source of UI state. Local functions and objects
that shadow browser globals are exempt. See the
[computed-style rule documentation](https://github.com/kingsguard-dev/kingsguard/blob/main/docs/rules/no-computed-style.md)
for detection boundaries, configuration, and explained ESLint suppression.

## Updating rule names

If you used an earlier unpublished build, update explicit rule settings and
ESLint suppression comments using this mapping. Previous IDs are no longer
registered.

| Previous rule ID                                              | New rule ID                           |
| ------------------------------------------------------------- | ------------------------------------- |
| `@kingsguard/sentinel/react-no-imperative-dom-state`          | `@kingsguard/react/no-dom-state`      |
| `@kingsguard/sentinel/react-prefer-ref-over-dom-query`        | `@kingsguard/react/no-dom-query`      |
| `@kingsguard/sentinel/react-prefer-state-over-computed-style` | `@kingsguard/react/no-computed-style` |

If you already adopted the short rule names under `@kingsguard/sentinel/`, replace
that prefix with `@kingsguard/react/`. If you register the plugin manually, use
`plugins: { '@kingsguard/react': sentinel }`.

The React package is `@kingsguard/eslint-plugin-sentinel-react`.
`sentinel.configs.recommended` registers the new namespace and enables all three rules
as errors automatically.

## Updating the package and preset

Earlier unpublished builds used `@kingsguard/eslint-plugin-sentinel` and
`sentinel.configs.react`. Install `@kingsguard/eslint-plugin-sentinel-react`,
update the import, and use `sentinel.configs.recommended` instead. The old package
and preset are not provided as compatibility aliases.

The `@kingsguard/react` namespace and its three rule IDs are unchanged.
Each future framework integration will have its own package; this package
contains only React support.
