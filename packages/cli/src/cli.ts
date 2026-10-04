import { cliArguments } from './arguments.js';

export type OutputSink = (text: string) => void;

export type CliOptions = {
  args: string[];
  stdout: OutputSink;
  version: string;
};

const usage = `Usage: kingsguard [${cliArguments.help.name} | ${cliArguments.version.name}]`;
const help = `Kingsguard command line

${usage}

Options:
  ${cliArguments.help.name}     ${cliArguments.help.description}
  ${cliArguments.version.name}  ${cliArguments.version.description}
`;

export function runCli({ args, stdout, version }: CliOptions): number {
  stdout(
    !args.includes(cliArguments.help.name) &&
      args.includes(cliArguments.version.name)
      ? `${version}\n`
      : help,
  );
  return 0;
}
