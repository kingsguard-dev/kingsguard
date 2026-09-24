export function parseVersion(packageJson: string): string {
  const metadata: unknown = JSON.parse(packageJson);
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    !('version' in metadata) ||
    typeof metadata.version !== 'string'
  ) {
    throw new Error('Invalid CLI package metadata: version must be a string.');
  }
  return metadata.version;
}
