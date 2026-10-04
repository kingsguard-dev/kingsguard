import spawn from 'cross-spawn';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

const repository = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  readFileSync(join(repository, 'package.json'), 'utf8'),
);
const originalSource = readFileSync(
  join(repository, 'packages/sentinel-react/src/index.ts'),
  'utf8',
);
let fixture: string;

function write(path: string, content: string) {
  writeFileSync(join(fixture, path), content);
}
function read(path: string) {
  return readFileSync(join(fixture, path), 'utf8');
}
function run(args: string[]) {
  const result = spawn.sync('pnpm', args, { cwd: fixture, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'kingsguard release-'));
  for (const directory of [
    'scripts',
    '.changeset',
    'packages/sentinel-react/src',
  ]) {
    mkdirSync(join(fixture, directory), { recursive: true });
  }
  symlinkSync(
    join(repository, 'node_modules'),
    join(fixture, 'node_modules'),
    'junction',
  );
  for (const path of [
    'scripts/sync-plugin-version.mjs',
    '.changeset/config.json',
    '.prettierrc.json',
  ]) {
    copyFileSync(join(repository, path), join(fixture, path));
  }
  write(
    'package.json',
    JSON.stringify({
      name: 'release-fixture',
      private: true,
      packageManager: manifest.packageManager,
      scripts: { 'release:prepare': manifest.scripts['release:prepare'] },
    }),
  );
  write('pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  write(
    'packages/sentinel-react/package.json',
    JSON.stringify({
      name: '@kingsguard/eslint-plugin-sentinel-react',
      version: '0.0.0',
    }),
  );
  write('packages/sentinel-react/src/index.ts', originalSource);
  const git = spawn.sync('git', ['init', '-q'], { cwd: fixture });
  expect(git.status).toBe(0);
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));

it.each([
  { type: 'patch', beta: false, expected: '0.0.1' },
  { type: 'minor', beta: true, expected: '0.1.0-beta.0' },
])(
  'prepares real Changesets output at $expected and synchronizes metadata',
  ({ type, beta, expected }) => {
    write(
      '.changeset/react.md',
      `---\n'@kingsguard/eslint-plugin-sentinel-react': ${type}\n---\n\nExplain the React change.\n`,
    );
    // A manually parked record is not input to Changesets and must survive.
    write(
      'cli-record.md',
      "---\n'@kingsguard/cli': minor\n---\n\nDeferred CLI change.\n",
    );
    const parked = read('cli-record.md');
    if (beta)
      expect(run(['exec', 'changeset', 'pre', 'enter', 'beta']).status).toBe(0);
    const result = run(['release:prepare']);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(
      JSON.parse(read('packages/sentinel-react/package.json')).version,
    ).toBe(expected);
    expect(read('packages/sentinel-react/CHANGELOG.md')).toContain(
      `## ${expected}`,
    );
    expect(read('packages/sentinel-react/CHANGELOG.md')).toContain(
      'Explain the React change.',
    );
    expect(read('packages/sentinel-react/src/index.ts')).toContain(
      `version: '${expected}'`,
    );
    expect(read('cli-record.md')).toBe(parked);
    expect(
      run([
        'exec',
        'prettier',
        '--check',
        'packages/sentinel-react/src/index.ts',
      ]).status,
    ).toBe(0);
  },
  15_000,
);

it('does not synchronize metadata when Changesets fails', () => {
  write(
    '.changeset/invalid.md',
    "---\n'nonexistent-package': patch\n---\n\nInvalid package.\n",
  );
  const result = run(['release:prepare']);
  expect(result.status).not.toBe(0);
  expect(result.stdout + result.stderr).toContain('nonexistent-package');
  expect(read('packages/sentinel-react/src/index.ts')).toBe(originalSource);
});

it('reports an unsupported metadata target without changing the source', () => {
  write('packages/sentinel-react/src/index.ts', 'export default {};\n');
  const result = run(['exec', 'node', 'scripts/sync-plugin-version.mjs']);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Expected one plugin.meta.version');
  expect(read('packages/sentinel-react/src/index.ts')).toBe(
    'export default {};\n',
  );
});
