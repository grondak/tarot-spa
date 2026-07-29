import { generateClient } from 'aws-amplify/data';

export async function getAdminMetrics() {
  const client = generateClient();
  const { data, errors } = await client.queries.adminMetrics();
  if (errors?.length) throw new Error(errors[0].message);
  return typeof data === 'string' ? JSON.parse(data) : data;
}
