# Sentinel React

ESLint rules that help keep React UI state declarative. Sentinel is part of
[Kingsguard](https://github.com/kingsguard-dev/kingsguard).

Use React state and props to describe the UI, and refs for necessary imperative
operations such as focus, scrolling, and measurement.

## Installation

Install the beta into a project with a working ESLint flat configuration:

```sh
npm install --save-dev @kingsguard/eslint-plugin-sentinel-react@beta
```

Requirements:

- Node.js 22.12 or newer.
- ESLint `^8.57.0`, `^9.0.0`, or `^10.0.0` with flat configuration.
- TypeScript `>=4.8.4 <6.1.0` as a peer dependency. Type-aware linting is not required.

The package is ESM-only. Your ESLint and parser versions may require a newer
Node.js version. No React runtime dependency is required by the plugin.

## Configuration

Append `sentinel.configs.recommended` to your existing configuration array.
Keep your existing parser, file patterns, and other settings; Sentinel does not
set up ESLint for you.

```js
// eslint.config.mjs
import sentinel from '@kingsguard/eslint-plugin-sentinel-react';

export default [
  // Your existing configuration entries go here.
  sentinel.configs.recommended,
];
```

For TypeScript/TSX, retain your TypeScript parser configuration. For example,
a project already using `typescript-eslint` can configure:

```js
// eslint.config.mjs
import tseslint from 'typescript-eslint';
import sentinel from '@kingsguard/eslint-plugin-sentinel-react';

export default [...tseslint.configs.recommended, sentinel.configs.recommended];
```

Run ESLint to check your project:

```sh
npx eslint .
```

Legacy `.eslintrc` configuration is not supported. With ESLint 8, set
`ESLINT_USE_FLAT_CONFIG=true` when invoking ESLint. TypeScript code importing the
plugin's declarations with ESLint 8 also needs `@types/eslint@8`; ESLint 9 and 10
include their own declarations.

## Rules

The recommended preset registers the `@kingsguard/react` namespace and enables
all three rules at error severity:

| Rule                                                                                                          | Purpose                                                                    |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`no-dom-state`](https://github.com/kingsguard-dev/kingsguard/blob/main/docs/rules/no-dom-state.md)           | Keep React-owned DOM state in JSX props and React state.                   |
| [`no-dom-query`](https://github.com/kingsguard-dev/kingsguard/blob/main/docs/rules/no-dom-query.md)           | Prefer React refs over browser document queries.                           |
| [`no-computed-style`](https://github.com/kingsguard-dev/kingsguard/blob/main/docs/rules/no-computed-style.md) | Keep UI state in React state and props instead of reading computed styles. |

### React DOM refs

`no-dom-state` checks React refs attached to native JSX elements and direct
`const node = ref.current` aliases within their declaring function. It allows
built-in operations for focus, scrolling, selection, measurement, and playback;
scalar geometry/scroll reads; and scroll-position writes. Other direct member
reads, calls, and writes report. Ordinary data refs remain outside this rule.

For example, control visibility through JSX rather than writing to a DOM ref:

```jsx
// Reported when ref is a recognized React DOM ref:
ref.current.hidden = !visible;

// Express visibility in JSX instead:
<div hidden={!visible} />;
```

### Browser APIs

`no-dom-query` reports browser document `getElementById`, `querySelector`, and
`querySelectorAll` accesses, including method retrieval and direct static
destructuring.

`no-computed-style` reports browser `getComputedStyle` reads, captured references,
and direct static extraction.

Both browser API rules apply throughout enabled files, including files without
React imports or JSX. Local bindings that shadow browser globals remain allowed.
Effects and SDK calls are not automatic exemptions.

## Severity and exceptions

Violations fail lint and CI by default. For gradual adoption, override individual
rules to `warn` or `off` in a later flat-config entry:

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

For a necessary exception, suppress the specific rule at the affected location
and explain why:

```js
// eslint-disable-next-line @kingsguard/react/no-dom-state -- Required by this widget's integration contract.
ref.current.dataset.widgetMode = mode;
```

## Limitations

Detection is based on syntax and lexical scope, not runtime types or full data
flow. DOM-ref recognition requires a direct React `useRef` or `createRef` binding
attached to a native JSX element in the same file. Ref-object aliases, node alias
chains, callback refs, and node aliases used inside nested functions are not
tracked. Refs attached only to custom components do not establish DOM ownership.

The rules do not detect every DOM operation. Undetected patterns are detection
gaps, not approved usage. See the linked rule documentation for exact allowed
operations, supported syntax, and remaining boundaries.

There are no automatic fixes, custom rule options, or configurable operation
allow lists. Moving imperative code into React state and JSX can change behavior
and requires an intentional component change.

Packed-package compatibility is checked with ESLint 8.57.0, 8.57.1, 9.39.5, and
10.10.0 on Node.js 22 and 24.

## License

[MIT](https://github.com/kingsguard-dev/kingsguard/blob/main/LICENSE).
