import { generateClient } from 'aws-amplify/data';

export async function getAdminLogs() {
  const client = generateClient();
  const { data, errors } = await client.queries.adminLogs();
  if (errors?.length) throw new Error(errors[0].message);
  return typeof data === 'string' ? JSON.parse(data) : data;
}
