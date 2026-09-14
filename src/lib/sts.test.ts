import { describe, it, expect, vi } from "vitest";
import type { STSClient } from "@aws-sdk/client-sts";
import { getCallerIdentity } from "./sts";

describe("sts data plane", () => {
  it("maps account, arn, and user id", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      Account: "000000000000",
      Arn: "arn:aws:iam::000000000000:user/localstacker",
      UserId: "AKIAIOSFODNN7EXAMPLE",
    });
    const client = { send } as unknown as STSClient;

    expect(await getCallerIdentity(client)).toEqual({
      account: "000000000000",
      arn: "arn:aws:iam::000000000000:user/localstacker",
      userId: "AKIAIOSFODNN7EXAMPLE",
    });
  });

  it("throws when identity fields are missing", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as STSClient;
    await expect(getCallerIdentity(client)).rejects.toThrow(/identity/i);
  });
});
