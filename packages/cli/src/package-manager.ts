import fs from 'node:fs';
import { join } from 'node:path';
import type { ReadyProject } from './project-root.js';

export type PackageManager = 'npm' | 'pnpm';
export type ManagerEvidence = {
  source: 'packageManager' | 'lockfile';
  manager: string;
  path: string;
};
export type DetectPackageManagerOptions = {
  project: ReadyProject;
  choice?: PackageManager;
};
export type PackageManagerResult =
  | { status: 'selected'; manager: PackageManager; evidence: ManagerEvidence[] }
  | {
      status: 'needs-selection' | 'conflict' | 'unsupported' | 'invalid-choice';
      evidence: ManagerEvidence[];
    }
  | {
      status: 'invalid-metadata' | 'io-error' | 'unsafe-path';
      evidence: ManagerEvidence[];
      path: string;
    };

const lockfiles = [
  ['package-lock.json', 'npm'],
  ['npm-shrinkwrap.json', 'npm'],
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
] as const;

function isSupported(manager: unknown): manager is PackageManager {
  return manager === 'npm' || manager === 'pnpm';
}

/** Observe the resolved project only; never execute a manager or read lock contents. */
export function detectPackageManager({
  project,
  choice,
}: DetectPackageManagerOptions): PackageManagerResult {
  const evidence: ManagerEvidence[] = [];
  if (choice !== undefined && !isSupported(choice)) {
    return { status: 'invalid-choice', evidence };
  }
  if (Object.hasOwn(project.manifest, 'packageManager')) {
    const declaration = project.manifest.packageManager;
    // Extract a manager and opaque version token, without claiming version validity.
    const match =
      typeof declaration === 'string'
        ? /^([a-z][a-z0-9-]*)@[^\s@]+$/u.exec(declaration)
        : null;
    if (!match || match[0] !== declaration) {
      return {
        status: 'invalid-metadata',
        evidence,
        path: project.manifestPath,
      };
    }
    evidence.push({
      source: 'packageManager',
      manager: match[1]!,
      path: project.manifestPath,
    });
  }

  for (const [name, manager] of lockfiles) {
    const path = join(project.root, name);
    try {
      if (!fs.lstatSync(path).isFile()) {
        return { status: 'unsafe-path', evidence, path };
      }
      evidence.push({ source: 'lockfile', manager, path });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        continue;
      }
      return { status: 'io-error', evidence, path };
    }
  }

  const managers = new Set(evidence.map((item) => item.manager));
  if (managers.size > 1) return { status: 'conflict', evidence };
  const observed = evidence[0]?.manager;
  if (observed !== undefined) {
    if (!isSupported(observed)) return { status: 'unsupported', evidence };
    if (choice !== undefined && choice !== observed) {
      return { status: 'conflict', evidence };
    }
    return { status: 'selected', manager: observed, evidence };
  }
  return choice === undefined
    ? { status: 'needs-selection', evidence }
    : { status: 'selected', manager: choice, evidence };
}
