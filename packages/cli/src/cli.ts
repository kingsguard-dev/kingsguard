import { cliArguments, parseArguments } from './arguments.js';

export type OutputSink = (text: string) => void;

export type CliOptions = {
  args: string[];
  stdout: OutputSink;
  stderr: OutputSink;
  version: string;
};

export enum ExitCode {
  Success = 0,
  UsageError = 2,
}

const usage = `Usage: kingsguard [${cliArguments.help.name} | ${cliArguments.version.name}]`;
const help = `Kingsguard command line

${usage}

Options:
  ${cliArguments.help.name}     ${cliArguments.help.description}
  ${cliArguments.version.name}  ${cliArguments.version.description}
`;
const usageError = `${usage}\nRun "kingsguard ${cliArguments.help.name}" for details.\n`;

export function runCli({
  args,
  stdout,
  stderr,
  version,
}: CliOptions): ExitCode {
  switch (parseArguments(args)) {
    case 'help':
      stdout(help);
      return ExitCode.Success;
    case 'version':
      stdout(`${version}\n`);
      return ExitCode.Success;
    case 'usage-error':
      stderr(usageError);
      return ExitCode.UsageError;
  }
}
