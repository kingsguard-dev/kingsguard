#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runCli } from './cli.js';
import { parseVersion } from './version.js';

const version = parseVersion(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

process.exitCode = runCli({
  args: process.argv.slice(2),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  version,
});
