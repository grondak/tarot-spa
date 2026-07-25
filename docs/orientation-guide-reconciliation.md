# Orientation Guide reconciliation runbook

## Ownership and service level

Tony owns the `OrientationGuideWorkerFailureAlarm` notification delivered through SNS and the `orientation-alert` email function.

- Acknowledge an alarm within one hour.
- Reconcile every affected Session within one business day.
- Use Session IDs and durable-execution metadata only. Never paste Context, cards, Current Events, prompts, Guide text, credentials, or secret values into logs, tickets, or messages.

## What the alarm means

The alarm watches the durable worker Lambda `Errors` metric. A Session can remain parked in `RUNNING` when either:

1. Bedrock completed and the checkpointed result could not be persisted after all retries. Usage remains reserved because provider spend occurred.
2. A pre-completion failure occurred but compensation could not be confirmed. Usage remains reserved until rollback is safely completed.

`RUNNING` is therefore an exceptional reconciliation state. It is excluded from delivered-Guide metrics and must not enter Story 3.5 judging until terminalized.

## Response procedure

1. Record the alarm timestamp, region, worker version/`live` alias target, and affected durable execution name. The execution name is the Session ID.
2. Inspect durable execution status and step history using identifiers and status metadata only. Do not print step payloads or Session content.
3. Read only the Session lifecycle and accounting markers needed to classify it: `status`, `errorCode`, `usageReservedAt`, `usageCompensatedAt`, `completedAt`, and timestamps.
4. Classify the checkpoint boundary:
   - If a successful Bedrock result is checkpointed, do not compensate. Retry or repair result persistence from that checkpoint, then conditionally move `RUNNING` to `SUCCEEDED`.
   - If failure occurred before a successful Bedrock checkpoint and `usageReservedAt` exists without `usageCompensatedAt`, rerun the idempotent compensation for the originally captured UTC day/month, then conditionally move `RUNNING` to `FAILED` with `GENERATION_FAILED`.
   - If compensation is already marked, do not decrement counters again; terminalize to `FAILED` conditionally.
   - If the Session is already terminal, make no state change and treat the alarm as a replay or unrelated worker error.
5. Verify the exact Session is terminal, counter changes occurred no more than once, and the durable execution/alarm state is understood.
6. If the Session was manually reconciled to `SUCCEEDED`, optionally invoke the judge once because the worker's dispatch step never ran: `aws lambda invoke --function-name <orientation-judge> --invocation-type Event --cli-binary-format raw-in-base64-out --payload '{"sessionId":"<id>"}' <output-file>`. Never judge a Session reconciled to `FAILED`.
7. Record content-safe evidence in the Story 3.8 verification log: Session ID may be abbreviated or omitted; include lifecycle transition, execution status, counter deltas, worker version, and alarm disposition.

## Escalation and safeguards

- Never mark a post-Bedrock persistence failure `FAILED` or compensate it merely to clear the alarm; that would erase a paid result and undercount spend.
- Never force `SUCCEEDED` without a complete persisted result contract.
- If the checkpoint boundary cannot be established safely, leave the Session parked, keep it excluded from metrics/judging, and escalate before changing counters or lifecycle state.
- After every worker deployment, probe Tavily through the qualified `live` alias. An unqualified `$LATEST` probe is not valid evidence.
