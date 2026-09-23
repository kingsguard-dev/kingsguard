#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runCli } from './cli.js';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

process.exitCode = runCli(
  process.argv.slice(2),
  (text) => process.stdout.write(text),
  (text) => process.stderr.write(text),
  version,
);
