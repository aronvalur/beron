// Thin wrapper around nodemailer for transactional emails (birthday/jól
// reminders to HR contacts, see lib/notifications.js).
//
// Configured entirely via environment variables so no credentials ever live
// in the codebase or get pasted into chat - set these in a local .env file
// (see .env.example) or in Render's Environment settings for production:
//
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
//
// Works with any standard SMTP provider - a Gmail/Google Workspace app
// password, or a transactional service like Resend/Postmark/SendGrid's SMTP
// relay. If these aren't set (e.g. local dev before anyone's configured
// anything), sendMail() logs what it WOULD have sent and returns without
// error instead of crashing the app or silently pretending to succeed.

const nodemailer = require('nodemailer');

let transporter = null;
let attemptedSetup = false;

function isConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (attemptedSetup) return transporter;
  attemptedSetup = true;
  if (!isConfigured()) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return transporter;
}

// to: string or array of strings. Never throws - a failed/unconfigured send
// should never take down the page that triggered it (e.g. a dashboard load).
async function sendMail({ to, subject, text }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipients.length === 0) return { sent: false, reason: 'no-recipients' };

  const t = getTransporter();
  if (!t) {
    console.log(`[mailer] SMTP ekki stillt - hefði sent á ${recipients.join(', ')}: "${subject}"`);
    return { sent: false, reason: 'not-configured' };
  }

  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients.join(', '),
      subject,
      text
    });
    return { sent: true };
  } catch (err) {
    console.error('[mailer] Póstsending mistókst:', err.message);
    return { sent: false, reason: 'send-error', error: err.message };
  }
}

module.exports = { sendMail, isConfigured };
