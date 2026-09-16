// lib/hospitalizationAttention.js
// Shared "does this admitted case need attention" logic — the single
// source of truth for the blinking-cage alarm across Cage Layout,
// Hospital Wall, the mobile cage list, and the nav badge. Reasons split
// into two severities:
//   yellow — routine reminders (owner waiting on a reply, a missed
//            scheduled temperature/weight check) that clear themselves
//            once the underlying thing is done
//   red    — a doctor checkup was explicitly requested (migration 106)
//            and stays red until a doctor is marked as having checked
//            the case — nothing else clears it automatically
// A case with both active blinks between the two (see .cage-alarm-both /
// .nav-alarm-both in globals.css) rather than picking just one.

import { formatDateTime } from '@/lib/formatTimestamp';
import { isWithinOfficeHours } from '@/lib/officeHours';

function updateRequestReason(hosp) {
  const when = formatDateTime(hosp.update_requested_at);
  const afterHours = !isWithinOfficeHours(new Date(hosp.update_requested_at));
  const message = hosp.update_request_message ? `: "${hosp.update_request_message}"` : '';
  return `Owner requested an update ${when}${afterHours ? ' (after hours)' : ''}${message}`;
}

function scheduledUpdateReason(period) {
  if (period === 'morning_and_afternoon') return 'Morning and afternoon temperature checks overdue';
  if (period === 'afternoon') return 'Afternoon temperature check overdue';
  return 'Morning temperature check overdue';
}

export function hospitalizationAttentionReasons(hosp) {
  const yellow = [];
  if (hosp.update_requested_at) yellow.push(updateRequestReason(hosp));
  if (hosp.scheduled_update_overdue) yellow.push(scheduledUpdateReason(hosp.scheduled_update_overdue_period));
  if (hosp.vitals_weight_overdue) yellow.push('Weight not checked today');

  const red = [];
  if (hosp.doctor_checkup_requested_at) {
    red.push(`Doctor checkup requested ${formatDateTime(hosp.doctor_checkup_requested_at)}`);
  }

  return { yellow, red };
}

// 'none' | 'yellow' | 'red' | 'both'
export function hospitalizationAlarmLevel(hosp) {
  const { yellow, red } = hospitalizationAttentionReasons(hosp);
  if (yellow.length > 0 && red.length > 0) return 'both';
  if (red.length > 0) return 'red';
  if (yellow.length > 0) return 'yellow';
  return 'none';
}

// Combines several cases' alarm levels into one overall level — used by
// nav-badge-style indicators that need to reflect "the worst thing going
// on anywhere", not any one case in particular.
export function combineAlarmLevels(levels) {
  const hasRed = levels.some((l) => l === 'red' || l === 'both');
  const hasYellow = levels.some((l) => l === 'yellow' || l === 'both');
  if (hasRed && hasYellow) return 'both';
  if (hasRed) return 'red';
  if (hasYellow) return 'yellow';
  return 'none';
}

// The cage-tile family of classes (Cage Layout, Hospital Wall, mobile
// cage list) — '' for 'none' so callers can drop it straight into a
// template string.
export function cageAlarmClass(level) {
  if (level === 'both') return 'cage-alarm-both';
  if (level === 'red') return 'cage-doctor-checkup-requested';
  if (level === 'yellow') return 'cage-update-requested';
  return '';
}

// The topnav-pill family of classes (desktop nav link, mobile square
// tile, cleaner tab).
export function navAlarmClass(level) {
  if (level === 'both') return 'nav-alarm-both';
  if (level === 'red') return 'nav-alarm-red';
  if (level === 'yellow') return 'nav-update-requested';
  return '';
}
