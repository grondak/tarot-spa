import { generateClient } from 'aws-amplify/data';

// A user's cases and the timestamps of their cycle (epic F4, S8.3, S8.4). Both live in owner-only
// tables, so the server returns only the signed-in user's rows. A case holds the user's own words;
// a cycle event holds only the case id, what happened and when.
const PAGE_SIZE = 1000;

function check({ data, errors }) {
  if (errors?.length) throw new Error(errors[0].message);
  return data;
}

async function listAll(model, options = {}) {
  const rows = [];
  let nextToken;
  do {
    const { data, errors, nextToken: next } = await model.list({ ...options, limit: PAGE_SIZE, nextToken });
    if (errors?.length) throw new Error(errors[0].message);
    rows.push(...data);
    nextToken = next;
  } while (nextToken);
  return rows;
}

const pick = ({ id, title, hypothesis, rivalHypothesis, status }) => ({ id, title, hypothesis: hypothesis ?? '', rivalHypothesis: rivalHypothesis ?? '', status });
const pickEvent = ({ id, caseId, kind, at }) => ({ id, caseId, kind, at });
const pickTag = ({ caseId, itemId, itemAt, stance, stakes }) => ({
  caseId, itemId, itemAt, stance: stance ?? undefined, stakes: Number.isInteger(stakes) ? stakes : undefined,
});

async function recordEvent(client, caseId, kind) {
  check(await client.models.CycleEvent.create({ caseId, kind, at: new Date().toISOString() }));
}

export async function loadCases() {
  const client = generateClient();
  const [cases, events, tags] = await Promise.all([
    listAll(client.models.Case), listAll(client.models.CycleEvent), listAll(client.models.CaseTag),
  ]);
  return { cases: cases.map(pick), events: events.map(pickEvent), tags: tags.map(pickTag) };
}

export async function openCase({ title, hypothesis }) {
  const client = generateClient();
  const made = pick(check(await client.models.Case.create({ title, hypothesis, status: 'OPEN' })));
  await recordEvent(client, made.id, 'OPENED');
  return made;
}

export async function saveCaseText(id, { title, hypothesis, rivalHypothesis }) {
  const client = generateClient();
  return pick(check(await client.models.Case.update({ id, title, hypothesis, ...(rivalHypothesis !== undefined && { rivalHypothesis }) })));
}

export async function setCaseStatus(id, status) {
  const client = generateClient();
  const updated = pick(check(await client.models.Case.update({ id, status })));
  await recordEvent(client, id, status === 'CLOSED' ? 'CLOSED' : 'REOPENED');
  return updated;
}

// The user's stance on one item for one case. `exists` says whether a tag is already stored for it.
export async function setTag({ caseId, itemId, itemAt, stance, stakes }, exists) {
  const client = generateClient();
  const input = { caseId, itemId, itemAt, stance, stakes };
  return pickTag(check(await (exists ? client.models.CaseTag.update(input) : client.models.CaseTag.create(input))));
}

export async function clearTag(caseId, itemId) {
  check(await generateClient().models.CaseTag.delete({ caseId, itemId }));
}

export async function recordHandoff(caseId) {
  await recordEvent(generateClient(), caseId, 'HANDED_OFF');
}

// A deleted case takes its timestamps and tags with it (default pending the S4.8 / S8.4 open question).
export async function deleteCase(id) {
  const client = generateClient();
  const [events, tags] = await Promise.all([
    listAll(client.models.CycleEvent, { filter: { caseId: { eq: id } } }),
    listAll(client.models.CaseTag, { filter: { caseId: { eq: id } } }),
  ]);
  await Promise.all(events.map((event) => client.models.CycleEvent.delete({ id: event.id }).then(check)));
  await Promise.all(tags.map((tag) => client.models.CaseTag.delete({ caseId: tag.caseId, itemId: tag.itemId }).then(check)));
  check(await client.models.Case.delete({ id }));
}

export async function deleteAllCases() {
  const client = generateClient();
  const [cases, events, tags] = await Promise.all([
    listAll(client.models.Case), listAll(client.models.CycleEvent), listAll(client.models.CaseTag),
  ]);
  await Promise.all(events.map((event) => client.models.CycleEvent.delete({ id: event.id }).then(check)));
  await Promise.all(tags.map((tag) => client.models.CaseTag.delete({ caseId: tag.caseId, itemId: tag.itemId }).then(check)));
  await Promise.all(cases.map((one) => client.models.Case.delete({ id: one.id }).then(check)));
}

const DAY = 86400e3;
const HOUR = 3600e3;

export function formatSpan(ms) {
  if (ms < HOUR) return 'under an hour';
  if (ms < DAY) {
    const hours = Math.round(ms / HOUR);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  const days = Math.floor(ms / DAY);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

// From a case's events: when it was opened, first handed to Orient, and (if closed now) last closed,
// with the time from opening to each. Any part not reached yet is null.
export function cycleSummary(events, status) {
  const times = (kind) => events
    .filter((event) => event.kind === kind)
    .map((event) => Date.parse(event.at))
    .filter((ms) => !Number.isNaN(ms))
    .sort((a, b) => a - b);
  const opened = times('OPENED')[0] ?? null;
  const handedOff = times('HANDED_OFF')[0] ?? null;
  const closed = status === 'CLOSED' ? (times('CLOSED').at(-1) ?? null) : null;
  const span = (ms) => (opened !== null && ms !== null && ms >= opened ? ms - opened : null);
  return { opened, handedOff, closed, toOrient: span(handedOff), toDecide: span(closed) };
}

// One rival explanation for a case, from the suggest-rival Lambda. Nothing is stored; the user
// decides whether to keep it. Throws an Error whose message is the server's reason.
export async function suggestRival({ title, hypothesis, items }) {
  const client = generateClient();
  const { data, errors } = await client.mutations.suggestRival({ title, hypothesis, items: JSON.stringify(items) });
  if (errors?.length) throw new Error(errors[0].message);
  const result = typeof data === 'string' ? JSON.parse(data) : data;
  if (typeof result?.rival !== 'string' || !Array.isArray(result?.fits)) throw new Error('RIVAL_UNAVAILABLE');
  return { rival: result.rival, fits: result.fits };
}
