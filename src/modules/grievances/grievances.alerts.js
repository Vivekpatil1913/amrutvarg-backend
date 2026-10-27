import { query, queryOne } from "../../db/pool.js";
import { env } from "../../config/env.js";
import { sendSms, sendEmail } from "../../lib/messaging.js";
import { notify, responsibleFor } from "../notifications/notifications.service.js";

// Who hears about a ticket, and when.
//
//   new ticket   district manager (bell + SMS), division manager (bell + SMS),
//                state (bell; HIGH priority for a complaint or one with media),
//                complainant (acknowledgement with the ticket number)
//   level 1      district manager reminded, division manager copied
//   level 2      state alerted as Overdue / Critical
//   resolved     complainant told the outcome, with a rating link

const TYPE_LABEL = { COMPLAINT: "Complaint (तक्रार)", SUGGESTION: "Suggestion (सजेशन)" };

const adminPath = (g) => `/admin/grievances/${g.id}`;
const adminUrl = (g) => `${env.links.admin}${adminPath(g)}`;
const feedbackUrl = (g) => `${env.links.site}/grievance/feedback/${g.feedback_token}`;

async function placeNames(g) {
  return queryOne(
    `SELECT d.name_mr AS district_mr, d.name_en AS district_en, v.name_mr AS division_mr, v.name_en AS division_en
     FROM districts d JOIN vibhags v ON v.id = d.vibhag_id WHERE d.id = $1`,
    [g.district_id]
  ).then((r) => r || {});
}

const placeLabel = (p) => p.district_en || p.district_mr || "your district";

async function smsAll(users, message, grievanceId) {
  await Promise.all(users.filter((u) => u.phone).map((u) => sendSms(u.phone, message, { grievanceId })));
}

async function logEvent(grievanceId, eventType, note, actorId = null) {
  await query(
    `INSERT INTO grievance_events (grievance_id, actor_id, event_type, note) VALUES ($1, $2, $3, $4)`,
    [grievanceId, actorId, eventType, note]
  );
}

export function isPriority(g) {
  return g.submission_type === "COMPLAINT" || (Array.isArray(g.attachments) && g.attachments.length > 0);
}

export async function alertNewGrievance(g) {
  const place = await placeNames(g);
  const { district, division, state } = await responsibleFor({ districtId: g.district_id, divisionId: g.division_id });
  const type = TYPE_LABEL[g.submission_type];
  const priority = isPriority(g) ? "HIGH" : "NORMAL";
  const common = { link: adminPath(g), category: "grievance", grievanceId: g.id };

  await Promise.all([
    notify(district, {
      ...common, priority,
      title: `New ${type} ${g.ticket_no}`,
      body: `${g.full_name}: ${g.subject}`,
    }),
    notify(division, {
      ...common, priority,
      title: `${type} ${g.ticket_no} in ${placeLabel(place)}`,
      body: `${g.full_name}: ${g.subject}`,
    }),
    notify(state, {
      ...common, priority,
      title: `${priority === "HIGH" ? "PRIORITY · " : ""}${type} ${g.ticket_no} — ${placeLabel(place)}`,
      body: `${g.full_name}: ${g.subject}${g.attachments.length ? ` (${g.attachments.length} attachment${g.attachments.length > 1 ? "s" : ""})` : ""}`,
    }),
    smsAll(district, `AMRUT Varg: New ${type} ${g.ticket_no} from ${g.full_name}. Open: ${adminUrl(g)}`, g.id),
    smsAll(division, `AMRUT Varg: ${type} ${g.ticket_no} received in ${placeLabel(place)} from ${g.full_name}. ${adminUrl(g)}`, g.id),
    sendSms(g.mobile, `AMRUT Varg: Your ${g.submission_type === "COMPLAINT" ? "complaint" : "suggestion"} is registered. Ticket ${g.ticket_no}.`, { grievanceId: g.id }),
    sendEmail(
      g.email,
      `AMRUT Varg — ticket ${g.ticket_no} registered`,
      `Dear ${g.full_name},\n\nYour ${g.submission_type === "COMPLAINT" ? "complaint" : "suggestion"} "${g.subject}" has been registered with ticket number ${g.ticket_no}. It has been sent to the AMRUT Varg team for ${placeLabel(place)}.\n\nAMRUT Varg`,
      { grievanceId: g.id }
    ),
  ]);
}

// Level 1: still NEW past the reminder mark.
export async function remindUnacknowledged(g) {
  const place = await placeNames(g);
  const { district, division } = await responsibleFor({ districtId: g.district_id, divisionId: g.division_id });
  const hours = Math.floor((Date.now() - new Date(g.created_at).getTime()) / 3600000);
  const common = { link: adminPath(g), category: "sla", priority: "HIGH", grievanceId: g.id };
  await Promise.all([
    notify(district, { ...common, title: `Reminder: ${g.ticket_no} unacknowledged for ${hours}h`, body: `Please acknowledge "${g.subject}".` }),
    notify(division, { ...common, title: `Copy: ${g.ticket_no} unacknowledged for ${hours}h in ${placeLabel(place)}`, body: `District has not acknowledged "${g.subject}".` }),
    smsAll(district, `AMRUT Varg REMINDER: Ticket ${g.ticket_no} is unacknowledged for ${hours}h. ${adminUrl(g)}`, g.id),
    smsAll(division, `AMRUT Varg: Ticket ${g.ticket_no} in ${placeLabel(place)} unacknowledged for ${hours}h. ${adminUrl(g)}`, g.id),
    logEvent(g.id, "REMINDER", `Level 1: unacknowledged for ${hours} hours; district reminded, division copied`),
  ]);
}

// Level 2: open past the critical mark.
export async function escalateCritical(g) {
  const place = await placeNames(g);
  const { district, division, state } = await responsibleFor({ districtId: g.district_id, divisionId: g.division_id });
  const common = { link: adminPath(g), category: "sla", priority: "HIGH", grievanceId: g.id };
  await Promise.all([
    notify(state, { ...common, title: `OVERDUE / CRITICAL: ${g.ticket_no} — ${placeLabel(place)}`, body: `Unresolved after ${env.sla.criticalHours} hours: ${g.subject}` }),
    notify([...district, ...division], { ...common, title: `${g.ticket_no} escalated to State Coordinator`, body: `Unresolved after ${env.sla.criticalHours} hours.` }),
    smsAll(state, `AMRUT Varg CRITICAL: Ticket ${g.ticket_no} (${placeLabel(place)}) unresolved after ${env.sla.criticalHours}h. ${adminUrl(g)}`, g.id),
    logEvent(g.id, "ESCALATED", `Level 2: unresolved after ${env.sla.criticalHours} hours; escalated to State Coordinator as Overdue / Critical`),
  ]);
}

// The closure loop: sent once, the first time a ticket reaches RESOLVED or
// CLOSED. The UPDATE ... WHERE closure_notified_at IS NULL is what makes it
// once — two administrators closing at the same moment send one message.
export async function notifyComplainantOfClosure(g) {
  const claimed = await queryOne(
    `UPDATE grievances SET closure_notified_at = NOW() WHERE id = $1 AND closure_notified_at IS NULL RETURNING id`,
    [g.id]
  );
  if (!claimed) return;
  const summary = g.action_taken_notes.length > 300 ? `${g.action_taken_notes.slice(0, 297)}…` : g.action_taken_notes;
  await Promise.all([
    sendSms(g.mobile, `AMRUT Varg: Ticket ${g.ticket_no} is ${g.status.toLowerCase()}. Please rate our response: ${feedbackUrl(g)}`, { grievanceId: g.id }),
    sendEmail(
      g.email,
      `AMRUT Varg — ticket ${g.ticket_no} ${g.status.toLowerCase()}`,
      `Dear ${g.full_name},\n\nYour ticket ${g.ticket_no} ("${g.subject}") has been ${g.status.toLowerCase()}.\n\nAction taken:\n${summary}\n\nPlease tell us how satisfied you are: ${feedbackUrl(g)}\n\nAMRUT Varg`,
      { grievanceId: g.id }
    ),
    logEvent(g.id, "COMPLAINANT_NOTIFIED", "Resolution summary and rating link sent by SMS and e-mail"),
  ]);
}
