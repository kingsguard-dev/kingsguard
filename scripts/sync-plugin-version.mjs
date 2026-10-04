import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { format, resolveConfig } from 'prettier';

const packageRoot = new URL('../packages/sentinel-react/', import.meta.url);
const { version } = JSON.parse(
  await readFile(new URL('package.json', packageRoot), 'utf8'),
);
if (typeof version !== 'string' || version.length === 0) {
  throw new Error('React package version must be a nonempty string.');
}

const sourcePath = fileURLToPath(new URL('src/index.ts', packageRoot));
const source = await readFile(sourcePath, 'utf8');
const pattern = /(\bmeta:\s*\{[^}]*\bversion:\s*)'[^']*'/g;
if ([...source.matchAll(pattern)].length !== 1) {
  throw new Error('Expected one plugin.meta.version to synchronize.');
}
const updated = source.replace(
  pattern,
  (_, prefix) => prefix + JSON.stringify(version),
);
const formatted = await format(updated, {
  ...(await resolveConfig(sourcePath)),
  filepath: sourcePath,
});
if (formatted !== source) await writeFile(sourcePath, formatted);
