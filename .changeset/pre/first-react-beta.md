---
'@kingsguard/eslint-plugin-sentinel-react': minor
---

Introduce the first Sentinel React beta with a recommended flat ESLint preset:

- `no-dom-state` checks recognized React DOM refs and direct `const` node aliases against built-in permissions for focus, scrolling, selection, measurement and playback.
- `no-dom-query` reports browser document queries; use React refs for element access.
- `no-computed-style` reports browser computed-style access; keep UI state in React state and props.

All three rules default to errors and support ESLint severity overrides and explained suppression comments. Detection is syntax- and scope-aware, with documented limits; no automatic fixes are provided.

Expose the recommended preset as a flat configuration type across ESLint 8, 9 and 10.
