// Sends a notification whenever a new application comes in. Both channels
// are optional and degrade gracefully — if their env vars aren't set yet,
// they're skipped (logged, not thrown), so applications still save fine
// and only the dashboard shows them until notifications are configured.
//
// Email uses Resend (https://resend.com) — set RESEND_API_KEY and
// NOTIFY_EMAIL_TO in your .env / Vercel environment variables.
//
// WhatsApp/SMS uses Twilio (https://twilio.com) — set
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, and
// NOTIFY_WHATSAPP_TO (or NOTIFY_SMS_TO).

async function sendEmailNotification(application) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;

  if (!apiKey || !to) {
    console.log('Email notification skipped — RESEND_API_KEY / NOTIFY_EMAIL_TO not configured.');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.NOTIFY_EMAIL_FROM || 'PakConnect Broadband <onboarding@resend.dev>',
        to,
        subject: `New application: ${application.fullName} (${application.applicationId})`,
        text:
          `New PTCL connection application received.\n\n` +
          `Name: ${application.fullName}\n` +
          `Mobile: ${application.mobile}\n` +
          `Email: ${application.email}\n` +
          `Address: ${application.address}\n` +
          `Package: ${application.packageId}\n\n` +
          `View it on the staff dashboard.`,
      }),
    });

    if (!res.ok) {
      console.error('Email notification failed:', await res.text());
      return { sent: false, reason: 'send_failed' };
    }
    return { sent: true };
  } catch (err) {
    console.error('Email notification error:', err && err.message ? err.message : err);
    return { sent: false, reason: 'error' };
  }
}

async function sendWhatsAppNotification(application) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER; // e.g. 'whatsapp:+14155238886'
  const to = process.env.NOTIFY_WHATSAPP_TO; // e.g. 'whatsapp:+92XXXXXXXXXX'

  if (!sid || !token || !from || !to) {
    console.log('WhatsApp notification skipped — Twilio env vars not configured.');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const body = new URLSearchParams({
      From: from,
      To: to,
      Body:
        `New PTCL application: ${application.fullName} (${application.mobile}) — ` +
        `package ${application.packageId}. Ref #${application.applicationId}.`,
    });

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      console.error('WhatsApp notification failed:', await res.text());
      return { sent: false, reason: 'send_failed' };
    }
    return { sent: true };
  } catch (err) {
    console.error('WhatsApp notification error:', err && err.message ? err.message : err);
    return { sent: false, reason: 'error' };
  }
}

// Fires both notifications without letting a failure in one block the
// other, or block the application from being saved successfully.
async function notifyNewApplication(application) {
  const [email, whatsapp] = await Promise.all([
    sendEmailNotification(application).catch(() => ({ sent: false, reason: 'error' })),
    sendWhatsAppNotification(application).catch(() => ({ sent: false, reason: 'error' })),
  ]);
  return { email, whatsapp };
}

module.exports = { notifyNewApplication };
