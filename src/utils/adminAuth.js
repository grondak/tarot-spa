import { fetchAuthSession } from 'aws-amplify/auth';

// null means the session read itself failed (e.g. a concurrent token
// refresh) — callers must not treat that the same as a confirmed false.
export async function isAdmin() {
  let session;
  try {
    session = await fetchAuthSession();
  } catch {
    return null;
  }
  const groups = session.tokens?.idToken?.payload?.['cognito:groups'];
  return Array.isArray(groups) && groups.includes('Admin');
}
