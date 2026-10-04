import { expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { defineConfig } from 'eslint/config';
import * as parser from '@typescript-eslint/parser';
import plugin from '../src/index.js';
import packageJson from '../package.json' with { type: 'json' };

it('works with the default JavaScript parser and preserves imperative focus', async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [plugin.configs.recommended],
  });
  const [result] = await eslint.lintText(
    "import React from 'react'; function Example(){ const ref = React.useRef(null); ref.current.focus(); ref.current.tabIndex = -1; return <button ref={ref}/>; }",
    { filePath: 'example.jsx' },
  );
  expect(result?.messages).toEqual([
    expect.objectContaining({
      ruleId: '@kingsguard/react/no-dom-state',
      severity: 2,
    }),
  ]);
});

it('loads the React flat preset and reports through ESLint', async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      plugin.configs.recommended,
      { languageOptions: { parser } },
    ],
  });
  const [result] = await eslint.lintText(
    "import {useRef} from 'react'; function Example(){ const ref = useRef(null); ref.current.tabIndex = -1; return <button ref={ref}/>; }",
    { filePath: 'example.tsx' },
  );
  expect(result?.messages).toEqual([
    expect.objectContaining({
      ruleId: '@kingsguard/react/no-dom-state',
      severity: 2,
    }),
  ]);
});

it('registers only the public guard names with matching documentation', () => {
  expect(plugin.meta.version).toBe(packageJson.version);
  expect(plugin.meta.name).toBe('@kingsguard/eslint-plugin-sentinel-react');
  expect(Object.keys(plugin.configs)).toEqual(['recommended']);
  const names = ['no-dom-state', 'no-dom-query', 'no-computed-style'];
  expect(Object.keys(plugin.rules).sort()).toEqual([...names].sort());
  expect(Object.keys(plugin.configs.recommended.plugins ?? {})).toEqual([
    '@kingsguard/react',
  ]);
  expect(plugin.configs.recommended.plugins?.['@kingsguard/react']).toBe(
    plugin,
  );
  expect(plugin.configs.recommended.rules).toEqual({
    '@kingsguard/react/no-dom-state': 'error',
    '@kingsguard/react/no-dom-query': 'error',
    '@kingsguard/react/no-computed-style': 'error',
  });
  for (const name of names) {
    const rule = plugin.rules[name as keyof typeof plugin.rules];
    expect(rule?.meta?.docs?.url).toBe(
      `https://github.com/kingsguard-dev/kingsguard/blob/main/docs/rules/${name}.md`,
    );
  }
});

it('resolves the scoped plugin namespace in string preset references', async () => {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: defineConfig({
      plugins: { '@kingsguard/react': plugin },
      extends: ['@kingsguard/react/recommended'],
    }),
  });
  const [result] = await eslint.lintText(
    "document.querySelector('#example');",
    {
      filePath: 'example.js',
    },
  );
  expect(result?.messages).toEqual([
    expect.objectContaining({
      ruleId: '@kingsguard/react/no-dom-query',
      severity: 2,
    }),
  ]);
});
