import fs from 'node:fs';
import { isMissingFileError } from './file-errors.js';
import { join } from 'node:path';
import type { ReadyProject } from './project-root.js';

export const ManagerName = {
  Npm: 'npm',
  Pnpm: 'pnpm',
  Yarn: 'yarn',
  Bun: 'bun',
} as const;
export type PackageManager = typeof ManagerName.Npm | typeof ManagerName.Pnpm;
export enum PackageManagerStatus {
  Selected = 'selected',
  NeedsSelection = 'needs-selection',
  Conflict = 'conflict',
  Unsupported = 'unsupported',
  InvalidChoice = 'invalid-choice',
  InvalidMetadata = 'invalid-metadata',
  IoError = 'io-error',
  UnsafePath = 'unsafe-path',
}
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
  | {
      status: PackageManagerStatus.Selected;
      manager: PackageManager;
      evidence: ManagerEvidence[];
    }
  | {
      status:
        | PackageManagerStatus.NeedsSelection
        | PackageManagerStatus.Conflict
        | PackageManagerStatus.Unsupported
        | PackageManagerStatus.InvalidChoice;
      evidence: ManagerEvidence[];
    }
  | {
      status:
        | PackageManagerStatus.InvalidMetadata
        | PackageManagerStatus.IoError
        | PackageManagerStatus.UnsafePath;
      evidence: ManagerEvidence[];
      path: string;
    };

const lockfiles = [
  ['package-lock.json', ManagerName.Npm],
  ['npm-shrinkwrap.json', ManagerName.Npm],
  ['pnpm-lock.yaml', ManagerName.Pnpm],
  ['yarn.lock', ManagerName.Yarn],
  ['bun.lock', ManagerName.Bun],
  ['bun.lockb', ManagerName.Bun],
] as const;

function isSupported(manager: unknown): manager is PackageManager {
  return manager === ManagerName.Npm || manager === ManagerName.Pnpm;
}

export function detectPackageManager({
  project,
  choice,
}: DetectPackageManagerOptions): PackageManagerResult {
  const evidence: ManagerEvidence[] = [];
  if (choice !== undefined && !isSupported(choice)) {
    return { status: PackageManagerStatus.InvalidChoice, evidence };
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
        status: PackageManagerStatus.InvalidMetadata,
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
        return { status: PackageManagerStatus.UnsafePath, evidence, path };
      }
      evidence.push({ source: 'lockfile', manager, path });
    } catch (error) {
      if (isMissingFileError(error)) {
        continue;
      }
      return { status: PackageManagerStatus.IoError, evidence, path };
    }
  }

  const managers = new Set(evidence.map((item) => item.manager));
  if (managers.size > 1)
    return { status: PackageManagerStatus.Conflict, evidence };
  const observed = evidence[0]?.manager;
  if (observed !== undefined) {
    if (!isSupported(observed))
      return { status: PackageManagerStatus.Unsupported, evidence };
    if (choice !== undefined && choice !== observed) {
      return { status: PackageManagerStatus.Conflict, evidence };
    }
    return {
      status: PackageManagerStatus.Selected,
      manager: observed,
      evidence,
    };
  }
  return choice === undefined
    ? { status: PackageManagerStatus.NeedsSelection, evidence }
    : { status: PackageManagerStatus.Selected, manager: choice, evidence };
}
