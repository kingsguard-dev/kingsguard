import fs from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export type UnsupportedProject = {
  status: 'unsupported';
  reason:
    | 'missing-manifest'
    | 'invalid-manifest'
    | 'unsafe-path'
    | 'workspace'
    | 'io-error';
  path: string;
};

export type ReadyProject = {
  status: 'ready';
  root: string;
  manifestPath: string;
  manifestText: string;
  manifest: Record<string, unknown>;
  /** Parents only, nearest first, including the filesystem root. */
  ancestorsChecked: string[];
};

function unsupported(
  reason: UnsupportedProject['reason'],
  path: string,
): UnsupportedProject {
  return { status: 'unsupported', reason, path };
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function metadata(path: string): 'absent' | 'regular' | UnsupportedProject {
  try {
    return fs.lstatSync(path).isFile()
      ? 'regular'
      : unsupported('unsafe-path', path);
  } catch (error) {
    return isMissing(error) ? 'absent' : unsupported('io-error', path);
  }
}

type Manifest = {
  status: 'manifest';
  text: string;
  value: Record<string, unknown>;
};

function readManifest(path: string): Manifest | UnsupportedProject {
  let text: string;
  try {
    text = fs.readFileSync(path, 'utf8');
  } catch {
    return unsupported('io-error', path);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return unsupported('invalid-manifest', path);
    }
    return {
      status: 'manifest',
      text,
      value: value as Record<string, unknown>,
    };
  } catch {
    return unsupported('invalid-manifest', path);
  }
}

/** Read only explicit project metadata; never search upward for a project. */
export function resolveProjectRoot(
  selectedDirectory: string,
  cwd: string,
): ReadyProject | UnsupportedProject {
  if (!isAbsolute(cwd)) return unsupported('unsafe-path', cwd);
  const selectedPath = resolve(cwd, selectedDirectory);
  try {
    if (!fs.lstatSync(selectedPath).isDirectory()) {
      return unsupported('unsafe-path', selectedPath);
    }
  } catch (error) {
    return unsupported(
      isMissing(error) ? 'unsafe-path' : 'io-error',
      selectedPath,
    );
  }

  let root: string;
  try {
    root = fs.realpathSync(selectedPath);
  } catch {
    return unsupported('io-error', selectedPath);
  }
  const manifestPath = join(root, 'package.json');
  const ancestorsChecked: string[] = [];
  let selectedManifest: Manifest | undefined;
  let directory = root;
  for (;;) {
    const path = join(directory, 'package.json');
    const state = metadata(path);
    if (typeof state !== 'string') return state;
    if (state === 'absent' && directory === root) {
      return unsupported('missing-manifest', path);
    }
    if (state === 'regular') {
      const manifest = readManifest(path);
      if (manifest.status === 'unsupported') return manifest;
      if (Object.hasOwn(manifest.value, 'workspaces')) {
        return unsupported('workspace', path);
      }
      if (directory === root) selectedManifest = manifest;
    }
    const workspacePath = join(directory, 'pnpm-workspace.yaml');
    const workspaceState = metadata(workspacePath);
    if (typeof workspaceState !== 'string') return workspaceState;
    if (workspaceState === 'regular') {
      return unsupported('workspace', workspacePath);
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    ancestorsChecked.push(parent);
    directory = parent;
  }
  // The selected manifest is mandatory and was validated before ancestor scanning.
  return {
    status: 'ready',
    root,
    manifestPath,
    manifestText: selectedManifest!.text,
    manifest: selectedManifest!.value,
    ancestorsChecked,
  };
}
