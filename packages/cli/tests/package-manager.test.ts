import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  detectPackageManager,
  ManagerName,
  PackageManagerStatus as Status,
} from '../src/package-manager.js';
import type { PackageManager } from '../src/package-manager.js';
import { resolveProjectRoot } from '../src/project-root.js';
import type { ReadyProject } from '../src/project-root.js';

let fixture: string;
let project: ReadyProject;
beforeEach(() => {
  fixture = fs.mkdtempSync(join(tmpdir(), 'kingsguard-manager-'));
  fs.writeFileSync(join(fixture, 'package.json'), '{}');
  const result = resolveProjectRoot(fixture, tmpdir());
  if (result.status !== 'ready') throw new Error(JSON.stringify(result));
  project = result;
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(fixture, { recursive: true, force: true });
});
function locks(...names: string[]) {
  for (const name of names)
    fs.writeFileSync(join(project.root, name), 'opaque');
}

it.each([
  ['npm@10.9.0', [], Status.Selected, ManagerName.Npm],
  ['pnpm@10.12.1+sha512.abc', [], Status.Selected, ManagerName.Pnpm],
  [undefined, ['package-lock.json'], Status.Selected, ManagerName.Npm],
  [undefined, ['npm-shrinkwrap.json'], Status.Selected, ManagerName.Npm],
  [undefined, ['pnpm-lock.yaml'], Status.Selected, ManagerName.Pnpm],
  [
    'npm@10',
    ['package-lock.json', 'npm-shrinkwrap.json'],
    Status.Selected,
    ManagerName.Npm,
  ],
  ['pnpm@10', ['pnpm-lock.yaml'], Status.Selected, ManagerName.Pnpm],
  ['npm@10', ['pnpm-lock.yaml'], Status.Conflict, undefined],
  [
    undefined,
    ['package-lock.json', 'pnpm-lock.yaml'],
    Status.Conflict,
    undefined,
  ],
  [undefined, ['package-lock.json', 'yarn.lock'], Status.Conflict, undefined],
  ['yarn@4', [], Status.Unsupported, undefined],
  [undefined, ['yarn.lock'], Status.Unsupported, undefined],
  ['bun@1', ['bun.lock', 'bun.lockb'], Status.Unsupported, undefined],
  [undefined, ['bun.lock'], Status.Unsupported, undefined],
  [undefined, ['bun.lockb'], Status.Unsupported, undefined],
  ['custom@1', [], Status.Unsupported, undefined],
  ['custom@1', ['package-lock.json'], Status.Conflict, undefined],
  [undefined, [], Status.NeedsSelection, undefined],
] as const)('classifies %s with %j', (declaration, files, status, manager) => {
  if (declaration !== undefined) project.manifest.packageManager = declaration;
  locks(...files);
  const result = detectPackageManager({ project });
  expect(result.status).toBe(status);
  expect('manager' in result ? result.manager : undefined).toBe(manager);
});

it.each([
  [undefined, [], ManagerName.Npm, Status.Selected],
  [undefined, [], ManagerName.Pnpm, Status.Selected],
  ['npm@10', ['package-lock.json'], ManagerName.Npm, Status.Selected],
  ['npm@10', [], ManagerName.Pnpm, Status.Conflict],
  [undefined, ['pnpm-lock.yaml'], ManagerName.Npm, Status.Conflict],
  ['yarn@4', [], ManagerName.Npm, Status.Unsupported],
  [undefined, ['bun.lock'], ManagerName.Pnpm, Status.Unsupported],
  [
    undefined,
    ['package-lock.json', 'pnpm-lock.yaml'],
    ManagerName.Npm,
    Status.Conflict,
  ],
] as const)(
  'bounds explicit choice for %s / %j / %s',
  (declaration, files, choice, status) => {
    if (declaration !== undefined)
      project.manifest.packageManager = declaration;
    locks(...files);
    const result = detectPackageManager({ project, choice });
    expect(result.status).toBe(status);
    if (result.status === Status.Selected) expect(result.manager).toBe(choice);
    expect(result.evidence).toHaveLength(
      files.length + Number(declaration !== undefined),
    );
  },
);

it.each([
  null,
  10,
  {},
  '',
  ManagerName.Npm,
  'npm@',
  ' npm@10',
  'npm@10 ',
  'npm@10\n',
  'npm@a@b',
  'NPM@10',
])('rejects malformed declaration %j even with a lock and choice', (value) => {
  project.manifest.packageManager = value;
  locks('package-lock.json');
  expect(detectPackageManager({ project, choice: ManagerName.Npm })).toEqual({
    status: Status.InvalidMetadata,
    path: project.manifestPath,
    evidence: [],
  });
});

it('rejects an invalid runtime choice', () => {
  // Deliberately simulate a caller bypassing the TypeScript boundary.
  expect(
    detectPackageManager({
      project,
      choice: ManagerName.Yarn as PackageManager,
    }),
  ).toEqual({
    status: Status.InvalidChoice,
    evidence: [],
  });
});

it('uses own declaration evidence and ignores the launcher environment', () => {
  Object.setPrototypeOf(project.manifest, { packageManager: 'npm@10' });
  locks('pnpm-lock.yaml');
  vi.stubEnv('npm_config_user_agent', 'npm/10 node/v22');
  vi.stubEnv('npm_execpath', '/npx/npm-cli.js');
  expect(detectPackageManager({ project })).toEqual({
    status: Status.Selected,
    manager: ManagerName.Pnpm,
    evidence: [
      {
        source: 'lockfile',
        manager: ManagerName.Pnpm,
        path: join(project.root, 'pnpm-lock.yaml'),
      },
    ],
  });
});

it('returns ordered evidence without reading or changing project files', () => {
  project.manifest.packageManager = 'npm@opaque-version';
  locks('package-lock.json', 'npm-shrinkwrap.json', 'unrelated.lock');
  const before = fs
    .readdirSync(project.root)
    .map((name) => [name, fs.readFileSync(join(project.root, name), 'utf8')]);
  const read = vi.spyOn(fs, 'readFileSync');
  const stat = vi.spyOn(fs, 'lstatSync');
  expect(detectPackageManager({ project, choice: ManagerName.Npm })).toEqual({
    status: Status.Selected,
    manager: ManagerName.Npm,
    evidence: [
      {
        source: 'packageManager',
        manager: ManagerName.Npm,
        path: project.manifestPath,
      },
      ...['package-lock.json', 'npm-shrinkwrap.json'].map((name) => ({
        source: 'lockfile',
        manager: ManagerName.Npm,
        path: join(project.root, name),
      })),
    ],
  });
  expect(read).not.toHaveBeenCalled();
  expect(stat.mock.calls.map(([path]) => path)).toEqual(
    [
      'package-lock.json',
      'npm-shrinkwrap.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'bun.lock',
      'bun.lockb',
    ].map((name) => join(project.root, name)),
  );
  read.mockRestore();
  expect(
    fs
      .readdirSync(project.root)
      .map((name) => [name, fs.readFileSync(join(project.root, name), 'utf8')]),
  ).toEqual(before);
});

it.each(['directory', 'symlink'])(
  'rejects a late %s rather than selecting early',
  (kind) => {
    locks('package-lock.json');
    const path = join(project.root, 'bun.lockb');
    if (kind === 'directory') fs.mkdirSync(path);
    else fs.symlinkSync(project.root, path, 'junction');
    expect(
      detectPackageManager({ project, choice: ManagerName.Npm }),
    ).toMatchObject({
      status: Status.UnsafePath,
      path,
    });
  },
);

it.each(['EACCES', 'EIO', undefined])(
  'does not treat a late filesystem failure %s as absence',
  (code) => {
    locks('package-lock.json');
    const path = join(project.root, 'bun.lockb');
    const actual = fs.lstatSync;
    vi.spyOn(fs, 'lstatSync').mockImplementation((...args) => {
      if (args[0] === path) throw Object.assign(new Error('failed'), { code });
      return actual(...args);
    });
    expect(
      detectPackageManager({ project, choice: ManagerName.Npm }),
    ).toMatchObject({
      status: Status.IoError,
      path,
    });
  },
);

it.each([null, undefined, 'failed', 42, {}])(
  'reports an unexpected thrown value %j as an I/O failure',
  (error) => {
    const path = join(project.root, 'package-lock.json');
    vi.spyOn(fs, 'lstatSync').mockImplementation(() => {
      throw error;
    });
    expect(detectPackageManager({ project })).toEqual({
      status: Status.IoError,
      path,
      evidence: [],
    });
  },
);

it('preserves each conflicting source and path', () => {
  project.manifest.packageManager = 'npm@10';
  locks('pnpm-lock.yaml');
  expect(detectPackageManager({ project })).toEqual({
    status: Status.Conflict,
    evidence: [
      {
        source: 'packageManager',
        manager: ManagerName.Npm,
        path: project.manifestPath,
      },
      {
        source: 'lockfile',
        manager: ManagerName.Pnpm,
        path: join(project.root, 'pnpm-lock.yaml'),
      },
    ],
  });
});
