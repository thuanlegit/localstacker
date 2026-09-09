import {
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  ListSecretVersionIdsCommand,
  ListSecretsCommand,
  PutSecretValueCommand,
  type SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export interface SecretSummary {
  name: string;
  arn: string;
  description?: string;
  createdDate?: Date;
  lastChangedDate?: Date;
}

export interface SecretVersion {
  versionId: string;
  createdDate?: Date;
  lastAccessedDate?: Date;
  stages: string[];
}

export const SECRET_NAME_REGEX = /^[a-zA-Z0-9/_+=.@-]{1,512}$/;

export async function listSecrets(
  client: SecretsManagerClient,
): Promise<SecretSummary[]> {
  const secrets: SecretSummary[] = [];
  let nextToken: string | undefined;

  do {
    const res = await client.send(
      new ListSecretsCommand({
        NextToken: nextToken,
      }),
    );

    if (res.SecretList) {
      for (const s of res.SecretList) {
        secrets.push({
          name: s.Name ?? "",
          arn: s.ARN ?? "",
          description: s.Description,
          createdDate: s.CreatedDate ? new Date(s.CreatedDate) : undefined,
          lastChangedDate: s.LastChangedDate
            ? new Date(s.LastChangedDate)
            : undefined,
        });
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  return secrets;
}

export async function getSecretValue(
  client: SecretsManagerClient,
  params: {
    secretId: string;
    versionId?: string;
    versionStage?: string;
  },
): Promise<{
  name: string;
  versionId?: string;
  secretString?: string;
  secretBinary?: Uint8Array;
  createdDate?: Date;
}> {
  const versionStage =
    params.versionId
      ? undefined
      : params.versionStage ?? "AWSCURRENT";

  const res = await client.send(
    new GetSecretValueCommand({
      SecretId: params.secretId,
      VersionId: params.versionId,
      VersionStage: versionStage,
    }),
  );

  return {
    name: res.Name ?? params.secretId,
    versionId: res.VersionId,
    secretString: res.SecretString,
    secretBinary: res.SecretBinary,
    createdDate: res.CreatedDate ? new Date(res.CreatedDate) : undefined,
  };
}

export async function listSecretVersions(
  client: SecretsManagerClient,
  params: { secretId: string },
): Promise<SecretVersion[]> {
  const versions: SecretVersion[] = [];
  let nextToken: string | undefined;

  do {
    const res = await client.send(
      new ListSecretVersionIdsCommand({
        SecretId: params.secretId,
        NextToken: nextToken,
      }),
    );

    if (res.Versions) {
      for (const v of res.Versions) {
        versions.push({
          versionId: v.VersionId ?? "",
          createdDate: v.CreatedDate ? new Date(v.CreatedDate) : undefined,
          lastAccessedDate: v.LastAccessedDate
            ? new Date(v.LastAccessedDate)
            : undefined,
          stages: v.VersionStages ?? [],
        });
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  // Sort descending by createdDate with undated last
  versions.sort((a, b) => {
    if (!a.createdDate && !b.createdDate) return 0;
    if (!a.createdDate) return 1;
    if (!b.createdDate) return -1;
    return b.createdDate.getTime() - a.createdDate.getTime();
  });

  return versions;
}

export async function createSecret(
  client: SecretsManagerClient,
  params: {
    name: string;
    secretString: string;
    description?: string;
  },
): Promise<{
  name: string;
  arn: string;
  versionId?: string;
}> {
  const res = await client.send(
    new CreateSecretCommand({
      Name: params.name,
      SecretString: params.secretString,
      ...(params.description ? { Description: params.description } : {}),
    }),
  );

  return {
    name: res.Name ?? params.name,
    arn: res.ARN ?? "",
    versionId: res.VersionId,
  };
}

export async function putSecretValue(
  client: SecretsManagerClient,
  params: {
    secretId: string;
    secretString: string;
  },
): Promise<{
  versionId?: string;
  versionStages: string[];
}> {
  const res = await client.send(
    new PutSecretValueCommand({
      SecretId: params.secretId,
      SecretString: params.secretString,
    }),
  );

  return {
    versionId: res.VersionId,
    versionStages: res.VersionStages ?? [],
  };
}

export async function deleteSecret(
  client: SecretsManagerClient,
  secretId: string,
): Promise<void> {
  await client.send(
    new DeleteSecretCommand({
      SecretId: secretId,
      ForceDeleteWithoutRecovery: true,
    }),
  );
}
