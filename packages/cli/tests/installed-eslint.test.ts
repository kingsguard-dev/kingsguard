import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  InstalledEslintStatus as Status,
  observeInstalledEslint,
} from '../src/installed-eslint.js';
import { resolveProjectRoot } from '../src/project-root.js';
import type { ReadyProject } from '../src/project-root.js';

let fixture: string;
let project: ReadyProject;
let packagePath: string;
let manifestPath: string;
beforeEach(() => {
  fixture = fs.mkdtempSync(join(tmpdir(), 'kingsguard-eslint-'));
  const root = join(fixture, 'project');
  fs.mkdirSync(root);
  fs.writeFileSync(join(root, 'package.json'), '{}');
  const result = resolveProjectRoot(root, tmpdir());
  if (result.status !== 'ready') throw new Error(JSON.stringify(result));
  project = result;
  packagePath = join(project.root, 'node_modules/eslint');
  manifestPath = join(packagePath, 'package.json');
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(fixture, { recursive: true, force: true });
});

function install(metadata: unknown = { name: 'eslint', version: '10.0.0' }) {
  fs.mkdirSync(packagePath, { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(metadata));
}
function observe() {
  return observeInstalledEslint({ project });
}

it.each([
  '0.0.0',
  '9.39.1',
  '99.0.0-rc.1+build.007',
  'v10.0.0',
  ' 10.0.0',
  '10.0.0 ',
  '10.0.0\n',
])(
  'observes exact npm version %s without compatibility judgment',
  (version) => {
    install({ name: 'eslint', version });
    expect(observe()).toEqual({ status: Status.Found, version, manifestPath });
  },
);

it('follows a pnpm package-directory link while returning the local lookup path', () => {
  const target = join(
    project.root,
    'node_modules/.pnpm/eslint@10/node_modules/eslint',
  );
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(
    join(target, 'package.json'),
    JSON.stringify({ name: 'eslint', version: '10.0.0' }),
  );
  fs.symlinkSync(target, packagePath, 'junction');
  expect(observe()).toEqual({
    status: Status.Found,
    version: '10.0.0',
    manifestPath,
  });
});

it('does not fall back to ancestor, global, launcher, or CLI-owned ESLint', () => {
  const ancestorPackage = join(fixture, 'node_modules/eslint');
  fs.mkdirSync(ancestorPackage, { recursive: true });
  fs.writeFileSync(
    join(ancestorPackage, 'package.json'),
    JSON.stringify({ name: 'eslint', version: '9.0.0' }),
  );
  vi.stubEnv('NODE_PATH', join(fixture, 'node_modules'));
  vi.stubEnv('npm_execpath', join(ancestorPackage, 'bin/eslint.js'));
  const stat = vi.spyOn(fs, 'lstatSync');
  expect(observe()).toEqual({ status: Status.NotInstalled, manifestPath });
  expect(stat.mock.calls).toEqual([[packagePath]]);
});

it.each(['dangling link', 'missing metadata'])(
  'classifies %s as a broken installation',
  (kind) => {
    fs.mkdirSync(join(project.root, 'node_modules'));
    if (kind === 'dangling link')
      fs.symlinkSync(join(fixture, 'missing'), packagePath, 'junction');
    else fs.mkdirSync(packagePath);
    expect(observe()).toEqual({ status: Status.IoError, manifestPath });
  },
);

it.each(['package file', 'metadata directory', 'metadata symlink'])(
  'rejects a nonregular installation: %s',
  (kind) => {
    fs.mkdirSync(join(project.root, 'node_modules'));
    if (kind === 'package file') fs.writeFileSync(packagePath, '{}');
    else {
      fs.mkdirSync(packagePath);
      if (kind === 'metadata directory') fs.mkdirSync(manifestPath);
      else fs.symlinkSync(project.root, manifestPath, 'junction');
    }
    expect(observe()).toEqual({ status: Status.InvalidMetadata, manifestPath });
  },
);

it.each([
  null,
  [],
  'eslint',
  42,
  {},
  { name: 'other', version: '10.0.0' },
  { name: 'eslint' },
  ...[
    null,
    10,
    '',
    '10',
    '^10.0.0',
    '=10.0.0',
    '01.0.0',
    '10.0.0-01',
    '10.0.0+',
  ].map((version) => ({ name: 'eslint', version })),
])('rejects invalid metadata %j', (metadata) => {
  install(metadata);
  expect(observe()).toEqual({ status: Status.InvalidMetadata, manifestPath });
});

it('preserves the JSON parsing diagnostic without printing it', () => {
  install();
  fs.writeFileSync(manifestPath, '{');
  const stderr = vi.spyOn(console, 'error');
  const stdout = vi.spyOn(console, 'log');
  let message = '';
  try {
    JSON.parse('{');
  } catch (error) {
    if (error instanceof Error) message = error.message;
  }
  expect(message).not.toBe('');
  expect(observe()).toEqual({
    status: Status.InvalidMetadata,
    manifestPath,
    reason: `Invalid JSON: ${message}`,
  });
  expect(stderr).not.toHaveBeenCalled();
  expect(stdout).not.toHaveBeenCalled();
});

it.each(['EACCES', 'EIO', undefined, null, 'unexpected'])(
  'reports entry access failure %j without claiming absence',
  (error) => {
    vi.spyOn(fs, 'lstatSync').mockImplementation(() => {
      throw typeof error === 'string' && error.startsWith('E')
        ? { code: error }
        : error;
    });
    expect(observe()).toEqual({ status: Status.IoError, manifestPath });
  },
);

it.each(['realpathSync', 'readFileSync'] as const)(
  'reports %s failures as I/O errors',
  (operation) => {
    install();
    vi.spyOn(fs, operation).mockImplementation(() => {
      throw { code: 'EACCES' };
    });
    expect(observe()).toEqual({ status: Status.IoError, manifestPath });
  },
);

it('never executes package/config code and leaves fixture contents unchanged', () => {
  install({ name: 'eslint', version: '10.0.0', main: 'index.js' });
  const code = 'throw new Error("must not execute");';
  fs.writeFileSync(join(packagePath, 'index.js'), code);
  fs.writeFileSync(join(project.root, 'eslint.config.js'), code);
  const paths = [
    manifestPath,
    join(packagePath, 'index.js'),
    join(project.root, 'eslint.config.js'),
    project.manifestPath,
  ];
  const before = paths.map((path) => fs.readFileSync(path, 'utf8'));
  const read = vi.spyOn(fs, 'readFileSync');
  expect(observe().status).toBe(Status.Found);
  expect(read.mock.calls).toEqual([[manifestPath, 'utf8']]);
  read.mockRestore();
  expect(paths.map((path) => fs.readFileSync(path, 'utf8'))).toEqual(before);
  expect(fs.readdirSync(packagePath).sort()).toEqual([
    'index.js',
    'package.json',
  ]);
  expect(fs.readdirSync(project.root).sort()).toEqual([
    'eslint.config.js',
    'node_modules',
    'package.json',
  ]);
});
