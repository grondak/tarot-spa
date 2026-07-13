import { generateClient } from 'aws-amplify/data';

export async function checkInviteKey(code) {
  const client = generateClient({ authMode: 'apiKey' });
  const { data, errors } = await client.queries.checkInviteKey({ code });
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

export async function mintOnwardKey() {
  const client = generateClient();
  const { data, errors } = await client.mutations.mintOnwardKey();
  if (errors?.length) throw new Error(errors[0].message);
  if (!data) throw new Error('Invite Key was not returned');
  return data;
}
