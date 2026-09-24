import { generateClient } from 'aws-amplify/data';

export async function updateAdminConfig({ dailyLimit, monthlyBudget }) {
  const client = generateClient();
  const { data, errors } = await client.models.Config.update({
    id: 'global',
    dailyLimit,
    monthlyBudget,
  });
  if (errors?.length) throw new Error(errors[0].message);
  if (!data) throw new Error('Config was not returned');
  return { dailyLimit: data.dailyLimit, monthlyBudget: data.monthlyBudget };
}
