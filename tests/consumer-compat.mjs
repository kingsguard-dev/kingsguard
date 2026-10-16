import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const versions = ['8.57.0', '8.57.1', '9.39.5', '10.10.0'];
const ids = [
  '@kingsguard/react/no-dom-state',
  '@kingsguard/react/no-dom-query',
  '@kingsguard/react/no-computed-style',
];

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    input: options.input,
  });
  if (result.error) throw result.error;
  return result;
}

function expectSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label}\n${result.stdout}\n${result.stderr}`,
  );
}

const invalid = (ext) => `import { useRef } from 'react';
function Example() {
  const ref = useRef(null);
  ref.current.hidden = true;
  document.querySelector('#example');
  getComputedStyle(ref.current);
  ref.current.focus();
  ref.current.scrollIntoView();
  const width${ext === 'tsx' ? ': number' : ''} = ref.current.clientWidth;
  ref.current.scrollTop = 1;
  return <div ref={ref} data-width={width} />;
}`;

function lint(consumer, ext, mode, input, expectedIds) {
  const result = run(
    process.execPath,
    [
      'node_modules/eslint/bin/eslint.js',
      '--stdin',
      '--stdin-filename',
      `example.${ext}`,
      '--format',
      'json',
    ],
    consumer,
    {
      input,
      env: { ESLINT_USE_FLAT_CONFIG: 'true', SENTINEL_TEST_MODE: mode },
    },
  );
  const severity = mode === 'warn' ? 1 : 2;
  const expectedStatus = severity === 2 && expectedIds.length > 0 ? 1 : 0;
  assert.equal(
    result.status,
    expectedStatus,
    `${ext}/${mode}\n${result.stdout}\n${result.stderr}`,
  );
  const [file] = JSON.parse(result.stdout);
  assert.deepEqual(
    file.messages
      .map(({ ruleId, severity, fatal }) => ({
        ruleId,
        severity,
        fatal: Boolean(fatal),
      }))
      .sort((a, b) => String(a.ruleId).localeCompare(String(b.ruleId))),
    expectedIds
      .map((ruleId) => ({ ruleId, severity, fatal: false }))
      .sort((a, b) => String(a.ruleId).localeCompare(String(b.ruleId))),
    `${ext}/${mode}: unexpected diagnostics`,
  );
}

const temporary = mkdtempSync(join(tmpdir(), 'sentinel-eslint-compat-'));
try {
  let tarball = process.argv[2] && resolve(process.argv[2]);
  if (!tarball) {
    expectSuccess(
      run(
        'pnpm',
        [
          '--filter',
          '@kingsguard/eslint-plugin-sentinel-react',
          'pack',
          '--pack-destination',
          temporary,
        ],
        root,
      ),
      'pack Sentinel',
    );
    const tarballs = readdirSync(temporary).filter((file) =>
      file.endsWith('.tgz'),
    );
    assert.equal(tarballs.length, 1, 'expected one packed Sentinel tarball');
    tarball = join(temporary, tarballs[0]);
  }

  for (const version of versions) {
    const consumer = join(temporary, `eslint-${version}`);
    mkdirSync(consumer);
    writeFileSync(
      join(consumer, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    );
    expectSuccess(
      run(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--save-exact',
          `eslint@${version}`,
          '@typescript-eslint/parser@8.70.0',
          'typescript@5.9.3',
          '@types/node@22.20.4',
          ...(version.startsWith('8.') ? ['@types/eslint@8.56.12'] : []),
          tarball,
        ],
        consumer,
      ),
      `normal npm install with ESLint ${version}`,
    );
    const installed = JSON.parse(
      readFileSync(
        join(
          consumer,
          'node_modules/@kingsguard/eslint-plugin-sentinel-react/package.json',
        ),
        'utf8',
      ),
    );
    assert.equal(installed.name, '@kingsguard/eslint-plugin-sentinel-react');
    assert.equal(
      installed.peerDependencies.eslint,
      '^8.57.0 || ^9.0.0 || ^10.0.0',
    );
    const eslint = JSON.parse(
      readFileSync(join(consumer, 'node_modules/eslint/package.json'), 'utf8'),
    );
    const parser = JSON.parse(
      readFileSync(
        join(consumer, 'node_modules/@typescript-eslint/parser/package.json'),
        'utf8',
      ),
    );
    const typescript = JSON.parse(
      readFileSync(
        join(consumer, 'node_modules/typescript/package.json'),
        'utf8',
      ),
    );
    assert.equal(eslint.version, version);
    assert.equal(parser.version, '8.70.0');
    assert.equal(typescript.version, '5.9.3');

    writeFileSync(
      join(consumer, 'consumer.mts'),
      `import sentinel from '@kingsguard/eslint-plugin-sentinel-react';
import type { Linter } from 'eslint';
const config: Linter.FlatConfig[] = [sentinel.configs.recommended];
const version: string = sentinel.meta.version;
export { config, version };
`,
    );
    expectSuccess(
      run(
        process.execPath,
        [
          'node_modules/typescript/bin/tsc',
          '--noEmit',
          '--strict',
          '--module',
          'NodeNext',
          '--moduleResolution',
          'NodeNext',
          '--target',
          'ES2022',
          'consumer.mts',
        ],
        consumer,
      ),
      `declaration consumption with ESLint ${version}`,
    );

    writeFileSync(
      join(consumer, 'eslint.config.mjs'),
      `import sentinel from '@kingsguard/eslint-plugin-sentinel-react';
import * as parser from '@typescript-eslint/parser';
const mode = process.env.SENTINEL_TEST_MODE;
export default [
  sentinel.configs.recommended,
  { files: ['**/*.tsx'], languageOptions: { parser } },
  ...(mode === 'error' ? [] : [{ rules: Object.fromEntries(${JSON.stringify(ids)}.map((id) => [id, mode])) }]),
];
`,
    );

    for (const ext of ['jsx', 'tsx']) {
      const source = invalid(ext);
      lint(consumer, ext, 'error', source, ids);
      lint(consumer, ext, 'warn', source, ids);
      lint(consumer, ext, 'off', source, []);
      const allowed = source
        .replace('  ref.current.hidden = true;\n', '')
        .replace("  document.querySelector('#example');\n", '')
        .replace('  getComputedStyle(ref.current);\n', '');
      lint(consumer, ext, 'error', allowed, []);
      const violations = [
        '  ref.current.hidden = true;',
        "  document.querySelector('#example');",
        '  getComputedStyle(ref.current);',
      ];
      for (const [index, violation] of violations.entries()) {
        const suppressed = source.replace(
          violation,
          `  // eslint-disable-next-line ${ids[index]} -- legacy widget boundary\n${violation}`,
        );
        lint(
          consumer,
          ext,
          'error',
          suppressed,
          ids.filter((_, i) => i !== index),
        );
      }
      const alias = source.replace(
        '  ref.current.hidden = true;',
        '  const node = ref.current;\n  node.hidden = true;\n  node.focus();',
      );
      lint(consumer, ext, 'error', alias, ids);
    }
    console.log(
      `Node ${process.version}; ESLint ${eslint.version}; parser ${parser.version}; TypeScript ${typescript.version}; Sentinel ${installed.version}: 16 CLI cases passed`,
    );
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
