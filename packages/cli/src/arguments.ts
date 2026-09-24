export const cliArguments = {
  help: { name: '--help', alias: 'help', description: 'Show this help' },
  version: { name: '--version', description: 'Show the CLI version' },
};

export type CliRequest = 'help' | 'version' | 'usage-error';

export function parseArguments(args: string[]): CliRequest {
  if (
    args.length === 0 ||
    args.includes(cliArguments.help.name) ||
    args.includes(cliArguments.help.alias)
  ) {
    return 'help';
  }
  if (args.includes(cliArguments.version.name)) {
    return 'version';
  }
  return 'usage-error';
}
