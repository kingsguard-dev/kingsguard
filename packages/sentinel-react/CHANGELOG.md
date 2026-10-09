# @kingsguard/eslint-plugin-sentinel-react

## 0.1.0-beta.0

### Minor Changes

- Introduce the first Sentinel React beta with a recommended flat ESLint preset:

  - `no-dom-state` checks recognized React DOM refs and direct `const` node aliases against built-in permissions for focus, scrolling, selection, measurement and playback.
  - `no-dom-query` reports browser document queries; use React refs for element access.
  - `no-computed-style` reports browser computed-style access; keep UI state in React state and props.

  All three rules default to errors and support ESLint severity overrides and explained suppression comments. Detection is syntax- and scope-aware, with documented limits; no automatic fixes are provided.

  Expose the recommended preset as a flat configuration type across ESLint 8, 9 and 10.

- cf06e6c: Detect direct immutable DOM-node aliases of React refs within their declaring function in `no-dom-state`.

### Patch Changes

- 3b78e6f: Support ESLint 8.57, 9, and 10 in flat configuration.
- 103e1c6: Read the plugin metadata version from package.json so it matches the installed package version.
