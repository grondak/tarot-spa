import { fetchAuthSession } from 'aws-amplify/auth';

export async function isAdmin() {
  try {
    const session = await fetchAuthSession();
    const groups = session.tokens?.idToken?.payload?.['cognito:groups'];
    return Array.isArray(groups) && groups.includes('Admin');
  } catch {
    return false;
  }
}
