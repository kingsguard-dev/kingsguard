import { execFileSync } from 'node:child_process';
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

      expect(run(executable, ['--help'], callerDirectory)).toContain(
        'Unavailable',
      );
      expect(run(executable, ['--version'], callerDirectory)).toBe('0.1.0\n');
      const initResult = capture(executable, ['init'], callerDirectory);
      expect(initResult).toEqual({
        status: 1,
        stdout: '',
        stderr: 'Kingsguard init is not implemented in this candidate.\n',
      });
      expect(capture(executable, ['wat'], callerDirectory).status).toBe(2);
      expect(readFileSync(sentinelPath, 'utf8')).toBe('unchanged');

      const installedPackage = join(
        installPrefix,
        'node_modules/@kingsguard/cli',
      );
      expect(statSync(join(installedPackage, 'LICENSE')).isFile()).toBe(true);
      expect(statSync(join(installedPackage, 'README.md')).isFile()).toBe(true);
      expect(statSync(join(installedPackage, 'dist/bin.js')).isFile()).toBe(
        true,
      );
      expect(readdirSync(installedPackage)).not.toContain('src');
      expect(
        JSON.parse(readFileSync(join(installedPackage, 'package.json'), 'utf8'))
          .bin,
      ).toEqual({
        kingsguard: './dist/bin.js',
      });
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  }, 30_000);
});

function capture(command: string, args: string[], cwd: string) {
  try {
    return { status: 0, stdout: run(command, args, cwd), stderr: '' };
  } catch (error) {
    const result = error as {
      status?: number;
      stdout?: Buffer;
      stderr?: Buffer;
    };
    return {
      status: result.status ?? -1,
      stdout: result.stdout?.toString() ?? '',
      stderr: result.stderr?.toString() ?? '',
    };
  }
}
