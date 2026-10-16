import type { ESLint, Linter } from 'eslint';
import packageJson from '../package.json' with { type: 'json' };
import { noDomQuery } from './rules/no-dom-query.js';
import { noComputedStyle } from './rules/no-computed-style.js';
import { noDomState } from './rules/no-dom-state.js';

const plugin = {
  meta: {
    name: '@kingsguard/eslint-plugin-sentinel-react',
    version: packageJson.version,
  },
  // typescript-eslint uses a narrower TS AST context than ESLint's generic
  // plugin API. Keep that type boundary here; integration tests exercise it.
  rules: {
    'no-dom-query': noDomQuery as unknown as NonNullable<
      ESLint.Plugin['rules']
    >[string],
    'no-computed-style': noComputedStyle as unknown as NonNullable<
      ESLint.Plugin['rules']
    >[string],
    'no-dom-state': noDomState as unknown as NonNullable<
      ESLint.Plugin['rules']
    >[string],
  },
  configs: {} as { recommended: Linter.FlatConfig },
};

plugin.configs.recommended = {
  name: '@kingsguard/react',
  files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { '@kingsguard/react': plugin },
  rules: {
    '@kingsguard/react/no-dom-state': 'error',
    '@kingsguard/react/no-dom-query': 'error',
    '@kingsguard/react/no-computed-style': 'error',
  },
};

export default plugin;
