import { query, queryOne } from "../db/pool.js";
import { env } from "../config/env.js";

// Outbound SMS and e-mail.
//
// Every message is written to message_outbox first, then handed to the
// configured webhook. With no webhook configured the row is marked LOGGED:
// the alert is still on record and visible to an administrator, which is
// better than a dropped message nobody knows about. A gateway failure marks
// the row FAILED with the reason, and never fails the request that caused it.

async function deliver(channel, url, payload, outboxId) {
  if (!url) {
    await query(`UPDATE message_outbox SET status = 'LOGGED' WHERE id = $1`, [outboxId]);
    if (env.isDev) console.log(`[${channel} logged] ${payload.to}: ${payload.subject ? `${payload.subject} — ` : ""}${payload.message}`);
    return;
  }
  try {
    const headers = { "Content-Type": "application/json" };
    if (env.messaging.webhookToken) headers.Authorization = `Bearer ${env.messaging.webhookToken}`;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await query(`UPDATE message_outbox SET status = 'SENT', sent_at = NOW() WHERE id = $1`, [outboxId]);
  } catch (err) {
    await query(`UPDATE message_outbox SET status = 'FAILED', error = $2 WHERE id = $1`, [outboxId, String(err.message).slice(0, 500)]);
  }
}

async function enqueue(channel, recipient, subject, body, grievanceId) {
  return queryOne(
    `INSERT INTO message_outbox (channel, recipient, subject, body, grievance_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [channel, recipient, subject, body, grievanceId ?? null]
  );
}

export async function sendSms(to, message, { grievanceId } = {}) {
  if (!to) return;
  try {
    const row = await enqueue("SMS", to, "", message, grievanceId);
    await deliver("SMS", env.messaging.smsWebhookUrl, { to, message }, row.id);
  } catch (err) {
    console.error("SMS dispatch failed:", err.message);
  }
}

export async function sendEmail(to, subject, message, { grievanceId } = {}) {
  if (!to) return;
  try {
    const row = await enqueue("EMAIL", to, subject, message, grievanceId);
    await deliver("EMAIL", env.messaging.emailWebhookUrl, { to, subject, message }, row.id);
  } catch (err) {
    console.error("E-mail dispatch failed:", err.message);
  }
}
