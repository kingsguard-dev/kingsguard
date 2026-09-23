import { describe, expect, it } from 'vitest';
import { runCli } from '../src/cli.js';

function execute(args: string[]) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = runCli(
    args,
    (text) => stdout.push(text),
    (text) => stderr.push(text),
  );
  return { exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
}

describe('Kingsguard CLI entry', () => {
  it.each([{ args: [] }, { args: ['--help'] }, { args: ['help'] }])(
    'prints help for $args',
    ({ args }) => {
      const result = execute(args);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Kingsguard command line');
      expect(result.stdout).toContain('init       Unavailable');
      expect(result.stderr).toBe('');
    },
  );

  it('prints the package version', () => {
    expect(execute(['--version'])).toEqual({
      exitCode: 0,
      stdout: '0.1.0\n',
      stderr: '',
    });
  });

  it('reports init as unavailable on stderr', () => {
    expect(execute(['init'])).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: 'Kingsguard init is not implemented in this candidate.\n',
    });
  });

  it.each([
    { args: ['unknown'] },
    { args: ['--unknown'] },
    { args: ['--help', 'extra'] },
    { args: ['init', 'extra'] },
    { args: ['--version', '--help'] },
  ])('returns a usage error for $args', ({ args }) => {
    const result = execute(args);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Usage: kingsguard');
  });
});
