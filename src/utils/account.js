import { generateClient } from 'aws-amplify/data';

export async function getMyAccount() {
  const client = generateClient();
  const { data, errors } = await client.models.Account.list();
  if (errors?.length) throw new Error(errors[0].message);
  return data?.[0] ?? null;
}
