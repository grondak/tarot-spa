import { generateClient } from 'aws-amplify/data';

// Sends a source suggestion to the operator by email. Nothing is stored.
export async function suggestSource(suggestion, contact) {
  const client = generateClient();
  const { data, errors } = await client.mutations.suggestSource({
    suggestion,
    contact: contact || undefined,
  });
  if (errors?.length) throw new Error(errors[0].message);
  if (!data) throw new Error('Suggestion was not sent');
  return true;
}
