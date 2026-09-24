import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';

const testVersion = '9.8.7-test';

function execute(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = runCli({
    args,
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    version: testVersion,
  });
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

describe('Kingsguard CLI entry', () => {
  it.each(
    [
      [],
      ['--help'],
      ['--help', '--other'],
      ['--other', '--help', '--abc'],
      ['--other', '--abc', '--help'],
      ['--version', '--help'],
      ['--help', '--version'],
      ['--help', '--help'],
    ].map((args) => ({ args })),
  )('prints help for $args', ({ args }) => {
    const result = execute(args);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Kingsguard command line');
    expect(result.stdout).toContain('--help     Show this help');
    expect(result.stdout).toContain('--version  Show the CLI version');
    expect(result.stdout).not.toContain('init');
    expect(result.stdout).not.toContain(testVersion);
    expect(result.stderr).toBe('');
  });

  it.each(
    [
      ['--version'],
      ['help', '--version'],
      ['--version', 'help'],
      ['--version', '--other'],
      ['--other', '--version', '--abc'],
      ['--other', '--abc', '--version'],
      ['--version', '--version'],
    ].map((args) => ({ args })),
  )('prints the package version for $args', ({ args }) => {
    expect(execute(args)).toEqual({
      exitCode: 0,
      stdout: `${testVersion}\n`,
      stderr: '',
    });
  });

  it.each(
    [
      ['unknown'],
      ['help'],
      ['--other', 'help'],
      ['--unknown'],
      ['init'],
      ['init', 'extra'],
      ['--other', '--abc'],
      ['--helpful'],
      ['--version=1'],
    ].map((args) => ({ args })),
  )('falls back to full help for $args', ({ args }) => {
    expect(execute(args)).toEqual(execute(['--help']));
  });
});
