import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../..');
const packageDirectory = join(repositoryRoot, 'packages/cli');

type InstalledManifest = { version: string; bin: Record<string, string> };

function run(command: string, args: string[], cwd: string) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('packed CLI', () => {
  it('installs and runs the packaged binary without touching the caller directory', () => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'kingsguard-cli-'));
    const packageOutput = join(temporaryDirectory, 'package');
    const installPrefix = join(temporaryDirectory, 'install');
    const callerDirectory = join(temporaryDirectory, 'caller');
    const sentinelPath = join(callerDirectory, 'keep.txt');

    try {
      mkdirSync(packageOutput);
      mkdirSync(callerDirectory);
      execFileSync('pnpm', ['--filter', '@kingsguard/cli', 'build'], {
        cwd: repositoryRoot,
        stdio: 'pipe',
      });
      run(
        'npm',
        ['pack', '--ignore-scripts', '--pack-destination', packageOutput],
        packageDirectory,
      );
      const tarball = join(
        packageOutput,
        readdirSync(packageOutput).find((file) => file.endsWith('.tgz'))!,
      );
      run(
        'npm',
        [
          'install',
          '--ignore-scripts',
          '--offline',
          '--prefix',
          installPrefix,
          tarball,
        ],
        temporaryDirectory,
      );

      writeFileSync(sentinelPath, 'unchanged');
      const executable = join(installPrefix, 'node_modules/.bin/kingsguard');
      const installedPackage = join(
        installPrefix,
        'node_modules/@kingsguard/cli',
      );
      const installedManifest = JSON.parse(
        readFileSync(join(installedPackage, 'package.json'), 'utf8'),
      ) as InstalledManifest;

      const help = capture(executable, ['--help'], callerDirectory);
      expect(help.status).toBe(0);
      expect(help.stdout).toContain('Kingsguard command line');
      expect(help.stdout).not.toContain('init');
      expect(help.stderr).toBe('');
      for (const args of [
        [],
        ['--other', '--help'],
        ['--version', '--help'],
        ['help', '--version'],
      ]) {
        expect(capture(executable, args, callerDirectory)).toEqual(help);
      }
      for (const args of [['--version'], ['--other', '--abc', '--version']]) {
        expect(capture(executable, args, callerDirectory)).toEqual({
          status: 0,
          stdout: `${installedManifest.version}\n`,
          stderr: '',
        });
      }
      for (const args of [['wat'], ['init']]) {
        expect(capture(executable, args, callerDirectory)).toEqual({
          status: 2,
          stdout: '',
          stderr:
            'Usage: kingsguard [--help | --version]\nRun "kingsguard --help" for details.\n',
        });
      }
      const manifestPath = join(installedPackage, 'package.json');
      for (const version of [undefined, 42]) {
        writeFileSync(
          manifestPath,
          JSON.stringify({ ...installedManifest, version }),
        );
        const invalidVersion = capture(
          executable,
          ['--version'],
          callerDirectory,
        );
        expect(invalidVersion.status).toBe(1);
        expect(invalidVersion.stdout).toBe('');
        expect(invalidVersion.stderr).toContain(
          'Invalid CLI package metadata: version must be a string.',
        );
      }
      expect(readFileSync(sentinelPath, 'utf8')).toBe('unchanged');

      expect(statSync(join(installedPackage, 'LICENSE')).isFile()).toBe(true);
      expect(statSync(join(installedPackage, 'README.md')).isFile()).toBe(true);
      expect(statSync(join(installedPackage, 'dist/bin.js')).isFile()).toBe(
        true,
      );
      expect(readdirSync(installedPackage)).not.toContain('src');
      expect(installedManifest.bin).toEqual({
        kingsguard: './dist/bin.js',
      });
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});

function capture(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
