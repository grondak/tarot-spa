import { generateClient } from 'aws-amplify/data';

export async function requestAccess(name, email) {
  const client = generateClient({ authMode: 'apiKey' });
  const { data, errors } = await client.mutations.requestAccess({ name, email });
  if (errors?.length) throw new Error(errors[0].message);
  if (!data) throw new Error('Access request was not sent');
  return true;
}
