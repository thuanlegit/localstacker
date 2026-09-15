import {
  type KMSClient,
  ListKeysCommand,
  DescribeKeyCommand,
  ListAliasesCommand,
  CreateKeyCommand,
  CreateAliasCommand,
  DeleteAliasCommand,
  EncryptCommand,
  DecryptCommand,
  GetKeyRotationStatusCommand,
  GetKeyPolicyCommand,
  ScheduleKeyDeletionCommand,
} from "@aws-sdk/client-kms";

export interface KeyRef {
  keyId: string;
  arn: string;
}

export interface KeySummary {
  keyId: string;
  arn: string;
  description: string;
  state: string;
  usage: string;
  spec: string;
  creationDate?: Date;
  manager: string;
  enabled: boolean;
}

export interface AliasRef {
  name: string;
  targetKeyId: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function listKeys(client: KMSClient): Promise<KeyRef[]> {
  const out: KeyRef[] = [];
  let marker: string | undefined;
  do {
    const res = await client.send(new ListKeysCommand({ Marker: marker, Limit: 100 }));
    for (const k of res.Keys ?? []) {
      if (!k.KeyId) continue;
      out.push({ keyId: k.KeyId, arn: k.KeyArn ?? "" });
    }
    marker = res.Truncated ? res.NextMarker : undefined;
  } while (marker);
  return out;
}

export async function describeKey(
  client: KMSClient,
  keyId: string,
): Promise<KeySummary> {
  const res = await client.send(new DescribeKeyCommand({ KeyId: keyId }));
  const m = res.KeyMetadata;
  if (!m?.KeyId) throw new Error("KMS returned no key metadata");
  return {
    keyId: m.KeyId,
    arn: m.Arn ?? "",
    description: m.Description ?? "",
    state: m.KeyState ?? "",
    usage: m.KeyUsage ?? "",
    spec: m.CustomerMasterKeySpec ?? "",
    creationDate: m.CreationDate,
    manager: m.KeyManager ?? "",
    enabled: m.Enabled ?? false,
  };
}

export async function listAliases(
  client: KMSClient,
  keyId?: string,
): Promise<AliasRef[]> {
  const out: AliasRef[] = [];
  let marker: string | undefined;
  do {
    const res = await client.send(
      new ListAliasesCommand({ KeyId: keyId, Marker: marker, Limit: 100 }),
    );
    for (const a of res.Aliases ?? []) {
      if (!a.AliasName) continue;
      out.push({ name: a.AliasName, targetKeyId: a.TargetKeyId ?? "" });
    }
    marker = res.Truncated ? res.NextMarker : undefined;
  } while (marker);
  return out;
}

export async function createKey(
  client: KMSClient,
  input: { description: string },
): Promise<string> {
  const res = await client.send(
    new CreateKeyCommand({
      Description: input.description,
      KeyUsage: "ENCRYPT_DECRYPT",
      CustomerMasterKeySpec: "SYMMETRIC_DEFAULT",
    }),
  );
  if (!res.KeyMetadata?.KeyId) throw new Error("KMS created no key");
  return res.KeyMetadata.KeyId;
}

export async function createAlias(
  client: KMSClient,
  input: { name: string; targetKeyId: string },
): Promise<void> {
  if (!input.name.startsWith("alias/")) {
    throw new Error('Alias names must start with "alias/"');
  }
  await client.send(
    new CreateAliasCommand({ AliasName: input.name, TargetKeyId: input.targetKeyId }),
  );
}

export async function deleteAlias(client: KMSClient, name: string): Promise<void> {
  await client.send(new DeleteAliasCommand({ AliasName: name }));
}

export async function encrypt(
  client: KMSClient,
  input: { keyId: string; plaintext: string },
): Promise<string> {
  const res = await client.send(
    new EncryptCommand({
      KeyId: input.keyId,
      Plaintext: new TextEncoder().encode(input.plaintext),
    }),
  );
  return bytesToBase64(res.CiphertextBlob ?? new Uint8Array());
}

export async function decrypt(
  client: KMSClient,
  input: { keyId: string; ciphertextBase64: string },
): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(input.ciphertextBase64.trim());
  } catch {
    throw new Error("Ciphertext is not valid base64");
  }
  const res = await client.send(
    new DecryptCommand({ KeyId: input.keyId, CiphertextBlob: bytes }),
  );
  return new TextDecoder().decode(res.Plaintext ?? new Uint8Array());
}

export async function getRotationStatus(
  client: KMSClient,
  keyId: string,
): Promise<boolean> {
  const res = await client.send(new GetKeyRotationStatusCommand({ KeyId: keyId }));
  return res.KeyRotationEnabled ?? false;
}

export async function getKeyPolicy(client: KMSClient, keyId: string): Promise<string> {
  const res = await client.send(
    new GetKeyPolicyCommand({ KeyId: keyId, PolicyName: "default" }),
  );
  return res.Policy ?? "";
}

export async function deleteKey(client: KMSClient, keyId: string): Promise<void> {
  await client.send(
    new ScheduleKeyDeletionCommand({ KeyId: keyId, PendingWindowInDays: 7 }),
  );
}
