import fs from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import type { ReadyProject } from './project-root.js';

export enum InstalledEslintStatus {
  Found = 'found',
  NotInstalled = 'not-installed',
  InvalidMetadata = 'invalid-metadata',
  IoError = 'io-error',
}

export type ObserveInstalledEslintOptions = { project: ReadyProject };
export type InstalledEslintResult =
  | {
      status: InstalledEslintStatus.Found;
      version: string;
      manifestPath: string;
    }
  | {
      status:
        | InstalledEslintStatus.NotInstalled
        | InstalledEslintStatus.InvalidMetadata
        | InstalledEslintStatus.IoError;
      manifestPath: string;
    };

const eslintPackageName = 'eslint';

function isMissingEntry(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (!('code' in error)) return false;
  return error.code === 'ENOENT';
}

type EslintMetadata = { name: typeof eslintPackageName; version: string };

function isEslintMetadata(value: unknown): value is EslintMetadata {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  if (!('name' in value) || value.name !== eslintPackageName) return false;
  if (!('version' in value) || typeof value.version !== 'string') return false;
  // semver accepts a leading v; require exact version syntax without coercion.
  if (!/^[0-9]/u.test(value.version) || value.version.trim() !== value.version)
    return false;
  return semver.valid(value.version) !== null;
}

export function observeInstalledEslint({
  project,
}: ObserveInstalledEslintOptions): InstalledEslintResult {
  const packagePath = join(project.root, 'node_modules', eslintPackageName);
  const manifestPath = join(packagePath, 'package.json');
  try {
    fs.lstatSync(packagePath);
  } catch (error) {
    return {
      status: isMissingEntry(error)
        ? InstalledEslintStatus.NotInstalled
        : InstalledEslintStatus.IoError,
      manifestPath,
    };
  }

  let text: string;
  try {
    // Package-directory links are normal for pnpm; metadata links are not.
    const directory = fs.realpathSync(packagePath);
    if (
      !fs.statSync(directory).isDirectory() ||
      !fs.lstatSync(join(directory, 'package.json')).isFile()
    ) {
      return { status: InstalledEslintStatus.InvalidMetadata, manifestPath };
    }
    text = fs.readFileSync(join(directory, 'package.json'), 'utf8');
  } catch {
    // An entry exists: dangling links and missing manifests are broken installs.
    return { status: InstalledEslintStatus.IoError, manifestPath };
  }

  try {
    const metadata: unknown = JSON.parse(text);
    if (isEslintMetadata(metadata)) {
      return {
        status: InstalledEslintStatus.Found,
        version: metadata.version,
        manifestPath,
      };
    }
  } catch {
    // Invalid JSON is metadata failure, separate from filesystem access failures.
  }
  return { status: InstalledEslintStatus.InvalidMetadata, manifestPath };
}
