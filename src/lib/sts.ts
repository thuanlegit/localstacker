import { type STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

export interface CallerIdentity {
  account: string;
  arn: string;
  userId: string;
}

export async function getCallerIdentity(
  client: STSClient,
): Promise<CallerIdentity> {
  const res = await client.send(new GetCallerIdentityCommand({}));
  if (!res.Account || !res.Arn) {
    throw new Error("STS returned an incomplete caller identity");
  }
  return {
    account: res.Account,
    arn: res.Arn,
    userId: res.UserId ?? "",
  };
}
