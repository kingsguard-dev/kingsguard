export const cliArguments = {
  help: { name: '--help', description: 'Show this help' },
  version: { name: '--version', description: 'Show the CLI version' },
};

export enum CliRequest {
  Help = 'help',
  Version = 'version',
  UsageError = 'usage-error',
}

export function parseArguments(args: string[]): CliRequest {
  if (args.length === 0 || args.includes(cliArguments.help.name)) {
    return CliRequest.Help;
  }
  if (args.includes(cliArguments.version.name)) {
    return CliRequest.Version;
  }
  return CliRequest.UsageError;
}
