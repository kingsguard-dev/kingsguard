import fs from 'node:fs';
import { join } from 'node:path';
import semver from 'semver';
import { isMissingFileError } from './file-errors.js';
import type { ReadyProject } from './project-root.js';

const eslintPackageName = 'eslint';

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
      reason?: string;
    };

type EslintMetadata = { name: typeof eslintPackageName; version: string };

function isEslintMetadata(value: unknown): value is EslintMetadata {
  if (typeof value !== 'object' || value === null) return false;
  if (!('name' in value) || value.name !== eslintPackageName) return false;
  if (!('version' in value) || typeof value.version !== 'string') return false;
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
      status: isMissingFileError(error)
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

  let metadata: unknown;
  try {
    metadata = JSON.parse(text);
  } catch (error) {
    return {
      status: InstalledEslintStatus.InvalidMetadata,
      manifestPath,
      reason: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (isEslintMetadata(metadata)) {
    return {
      status: InstalledEslintStatus.Found,
      version: metadata.version,
      manifestPath,
    };
  }
  return { status: InstalledEslintStatus.InvalidMetadata, manifestPath };
}
