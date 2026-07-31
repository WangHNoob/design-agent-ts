export function versionContentImmutableError(
  kind: string,
  name: string,
  version: string,
): Error {
  return new Error(
    `Artifact version ${kind}/${name}@${version} already exists with different content; bump version to publish changes`,
  );
}
