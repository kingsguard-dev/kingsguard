export type OutputSink = (text: string) => void;

const help = `Kingsguard command line

Usage: kingsguard [--help | --version | init]

Options:
  --help     Show this help
  --version  Show the CLI version

Commands:
  init       Unavailable in this candidate; it does not inspect or change a project
`;

const usageError =
  'Usage: kingsguard [--help | --version | init]\nRun "kingsguard --help" for details.\n';

export function runCli(
  args: string[],
  stdout: OutputSink,
  stderr: OutputSink,
  version: string,
): number {
  if (
    args.length === 0 ||
    (args.length === 1 && (args[0] === '--help' || args[0] === 'help'))
  ) {
    stdout(help);
    return 0;
  }

  if (args.length === 1 && args[0] === '--version') {
    stdout(`${version}\n`);
    return 0;
  }

  if (args[0] === 'init' && args.length === 1) {
    stderr('Kingsguard init is not implemented in this candidate.\n');
    return 1;
  }

  stderr(usageError);
  return 2;
}
