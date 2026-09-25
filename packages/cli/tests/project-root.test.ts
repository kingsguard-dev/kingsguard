import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveProjectRoot } from '../src/project-root.js';

let fixture: string;
let root: string;
const original = '{\n  "name": "standalone", "private": true\n}\n';

beforeEach(() => {
  // Preserve the platform's temporary-directory alias for the input path.
  fixture = fs.mkdtempSync(join(tmpdir(), 'kingsguard-root-'));
  root = join(fixture, 'project');
  fs.mkdirSync(root);
  fs.writeFileSync(join(root, 'package.json'), original);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(fixture, { recursive: true, force: true });
});

function canonical(path: string): string {
  return fs.realpathSync(path);
}

function expectUnsupported(reason: string, path: string, selected = root) {
  expect(resolveProjectRoot(selected, fixture)).toEqual({
    status: 'unsupported',
    reason,
    path,
  });
}

describe('explicit project resolution', () => {
  it('resolves relative and absolute selections, preserving text and all checked parents', () => {
    const canonicalRoot = canonical(root);
    const parents: string[] = [];
    let parent = dirname(canonicalRoot);
    for (;;) {
      parents.push(parent);
      if (dirname(parent) === parent) break;
      parent = dirname(parent);
    }
    const expected = {
      status: 'ready',
      root: canonicalRoot,
      manifestPath: join(canonicalRoot, 'package.json'),
      manifestText: original,
      manifest: { name: 'standalone', private: true },
      ancestorsChecked: parents,
    };
    expect(resolveProjectRoot('project', fixture)).toEqual(expected);
    expect(resolveProjectRoot(root, fixture)).toEqual(expected);
    expect(fs.readFileSync(join(root, 'package.json'), 'utf8')).toBe(original);
    expect(fs.readdirSync(root)).toEqual(['package.json']);
  });

  it('accepts an ancestor alias but rejects a selected directory alias', () => {
    const alias = join(fixture, 'alias');
    const target = join(fixture, 'target');
    fs.mkdirSync(target);
    fs.renameSync(root, join(target, 'project'));
    // Junctions require no symlink privilege on Windows.
    fs.symlinkSync(target, alias, 'junction');
    const result = resolveProjectRoot(join(alias, 'project'), fixture);
    expect(result).toMatchObject({
      status: 'ready',
      root: canonical(join(target, 'project')),
    });
    expectUnsupported('unsafe-path', alias, alias);
  });

  it('does not climb to a parent manifest when the selected manifest is absent', () => {
    fs.writeFileSync(join(fixture, 'package.json'), '{}');
    fs.rmSync(join(root, 'package.json'));
    expectUnsupported(
      'missing-manifest',
      join(canonical(root), 'package.json'),
    );
  });

  it('keeps the selected root beneath ordinary ancestor packages', () => {
    fs.writeFileSync(join(fixture, 'package.json'), '{"name":"parent"}');
    expect(resolveProjectRoot(root, fixture)).toMatchObject({
      status: 'ready',
      root: canonical(root),
      manifestText: original,
    });
  });

  it.each(['{', 'null', '[]', '42', '"text"', 'true'])(
    'rejects invalid selected manifest %s',
    (text) => {
      fs.writeFileSync(join(root, 'package.json'), text);
      expectUnsupported(
        'invalid-manifest',
        join(canonical(root), 'package.json'),
      );
    },
  );

  it('rejects invalid ancestor metadata', () => {
    fs.writeFileSync(join(fixture, 'package.json'), 'null');
    expectUnsupported(
      'invalid-manifest',
      join(canonical(fixture), 'package.json'),
    );
  });

  it('rejects absent and nondirectory selections and a relative cwd', () => {
    const absent = join(fixture, 'absent');
    expectUnsupported('unsafe-path', absent, absent);
    const file = join(root, 'package.json');
    expectUnsupported('unsafe-path', file, file);
    expect(resolveProjectRoot(root, 'relative')).toEqual({
      status: 'unsupported',
      reason: 'unsafe-path',
      path: 'relative',
    });
  });
});

describe('workspace boundaries', () => {
  it.each([false, true])(
    'rejects workspace metadata in an ancestor: %s',
    (ancestor) => {
      const directory = ancestor ? fixture : root;
      const path = join(directory, 'package.json');
      fs.writeFileSync(path, '{"workspaces":null}');
      expectUnsupported(
        'workspace',
        join(canonical(directory), 'package.json'),
      );
    },
  );

  it.each([false, true])(
    'rejects workspace YAML in an ancestor: %s',
    (ancestor) => {
      const directory = ancestor ? fixture : root;
      const path = join(directory, 'pnpm-workspace.yaml');
      // Presence is sufficient; no membership parsing or YAML reads.
      fs.writeFileSync(path, 'not valid yaml: [');
      const read = vi.spyOn(fs, 'readFileSync');
      expectUnsupported(
        'workspace',
        join(canonical(directory), 'pnpm-workspace.yaml'),
      );
      expect(
        read.mock.calls.some(([name]) => String(name) === canonical(path)),
      ).toBe(false);
    },
  );
});

describe('unsafe and inaccessible metadata', () => {
  it.each([
    ['selected', 'package.json'],
    ['ancestor', 'package.json'],
    ['selected', 'pnpm-workspace.yaml'],
    ['ancestor', 'pnpm-workspace.yaml'],
  ])('rejects nonregular %s %s before reading', (location, name) => {
    const directory = location === 'selected' ? root : fixture;
    const path = join(directory, name!);
    fs.rmSync(path, { force: true });
    fs.mkdirSync(path);
    const unsafePath = join(canonical(directory), name!);
    const read = vi.spyOn(fs, 'readFileSync');
    expectUnsupported('unsafe-path', unsafePath);
    expect(read.mock.calls.some(([name]) => String(name) === unsafePath)).toBe(
      false,
    );
  });

  it.each(['package.json', 'pnpm-workspace.yaml'])(
    'rejects symlink metadata %s at selected and ancestor levels',
    (name) => {
      const target = join(fixture, 'link-target');
      fs.mkdirSync(target);
      for (const directory of [root, fixture]) {
        const path = join(directory, name);
        const unsafePath = join(canonical(directory), name);
        fs.rmSync(path, { force: true });
        fs.symlinkSync(target, path, 'junction');
        const read = vi.spyOn(fs, 'readFileSync');
        expectUnsupported('unsafe-path', unsafePath);
        expect(
          read.mock.calls.some(([name]) => String(name) === unsafePath),
        ).toBe(false);
        read.mockRestore();
        fs.rmSync(path);
        if (name === 'package.json') fs.writeFileSync(path, original);
      }
    },
  );

  it.each(['selected', 'ancestor'])(
    'reports unreadable %s manifest as io-error',
    (location) => {
      const directory = location === 'selected' ? root : fixture;
      fs.writeFileSync(join(directory, 'package.json'), original);
      const path = join(canonical(directory), 'package.json');
      const realRead = fs.readFileSync;
      vi.spyOn(fs, 'readFileSync').mockImplementation((...args) => {
        if (String(args[0]) === path)
          throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return realRead(...args);
      });
      expectUnsupported('io-error', path);
    },
  );

  it('does not treat inaccessible ancestor metadata as absent', () => {
    const path = join(canonical(fixture), 'pnpm-workspace.yaml');
    const realStat = fs.lstatSync;
    vi.spyOn(fs, 'lstatSync').mockImplementation((...args) => {
      if (String(args[0]) === path)
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
      return realStat(...args);
    });
    expectUnsupported('io-error', path);
  });
});
