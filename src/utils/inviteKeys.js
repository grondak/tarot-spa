import { generateClient } from 'aws-amplify/data';

export async function checkInviteKey(code) {
  const client = generateClient({ authMode: 'apiKey' });
  const { data, errors } = await client.queries.checkInviteKey({ code });
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}
