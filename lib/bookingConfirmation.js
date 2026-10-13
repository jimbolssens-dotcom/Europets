// lib/bookingConfirmation.js
// "Your appointment is confirmed" for an approved self-booking (see
// app/api/intake-requests/[id]). Sent from the clinic's WhatsApp number
// and logged in the client's thread with its full text, so staff can see
// it went (and its delivered/read ticks) like every other automated
// message. A WhatsApp that can't be sent is logged as failed with Meta's
// reason, and the confirmation goes by email instead when the client has
// one. A WhatsApp that Meta accepts but later reports as failed also
// falls back to email (fallback_email, see lib/emailFallback.js).

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendBookingConfirmation, bookingConfirmationMessageText } from '@/lib/metaWhatsapp';
import { sendFallbackEmail } from '@/lib/emailFallback';
import { whatsappDigits } from '@/lib/clientPhoneDigits';

const SUBJECT = 'Your appointment at Europets Clinic is confirmed';

// Server-side clock is UTC, so the clinic's zone is set explicitly (a
// 9:30am Dubai booking otherwise reads "05:30 AM"); hour12 forced since
// en-GB defaults to a 24-hour clock.
export function bookingDateTimeLabels(start) {
  const d = new Date(start);
  return {
    dateLabel: d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      timeZone: 'Asia/Dubai',
    }),
    timeLabel: d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Dubai',
    }),
  };
}

// Returns { sent, channel: 'whatsapp' | 'email' | null, error, message }.
// message is the text the client got (or should get), for staff's
// "send by hand" fallback when nothing could be sent.
export async function sendBookingConfirmationToClient({ client, patientName, start }) {
  const params = {
    clientName: client.full_name,
    patientName,
    ...bookingDateTimeLabels(start),
  };
  const message = bookingConfirmationMessageText(params);
  const email = (client.email || '').trim();
  const digits = whatsappDigits(client.phone);
  let waError = digits ? null : 'No phone number on file';

  if (digits) {
    try {
      const waMessageId = await sendBookingConfirmation(digits, params);
      await supabaseAdmin.from('client_messages').insert([
        {
          client_id: client.id,
          phone: digits,
          channel: 'whatsapp',
          // 'system', not 'staff': see migration 163.
          sender: 'system',
          body: message,
          wa_message_id: waMessageId,
          status: 'sent',
          fallback_email: email ? { to: email, subject: SUBJECT, text: message } : null,
        },
      ]);
      return { sent: true, channel: 'whatsapp', error: null, message };
    } catch (err) {
      waError = err.message;
      await supabaseAdmin.from('client_messages').insert([
        {
          client_id: client.id,
          phone: digits,
          channel: 'whatsapp',
          sender: 'system',
          body: message,
          status: 'failed',
          wa_error: waError,
        },
      ]);
    }
  }

  if (email) {
    try {
      await sendFallbackEmail({
        clientId: client.id,
        to: email,
        subject: SUBJECT,
        text: message,
      });
      return {
        sent: true,
        channel: 'email',
        error: `WhatsApp: ${waError}`,
        message,
      };
    } catch (err) {
      return {
        sent: false,
        channel: null,
        error: `WhatsApp: ${waError}. Email: ${err.message}`,
        message,
      };
    }
  }
  return {
    sent: false,
    channel: null,
    error: `WhatsApp: ${waError}. No email on file.`,
    message,
  };
}
