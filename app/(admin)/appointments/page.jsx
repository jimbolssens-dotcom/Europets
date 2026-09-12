// app/(admin)/appointments/page.jsx
'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import SearchSelect from '@/app/_components/SearchSelect';
import ClientOrPatientSearch from '@/app/_components/ClientOrPatientSearch';
import EditAppointmentModal from '@/app/_components/EditAppointmentModal';
import AppointmentRequestsPanel from '@/app/_components/AppointmentRequestsPanel';
import { buildStaffColorMap, colorForAppointment, UNASSIGNED_STAFF_COLOR } from '@/lib/staffColors';
import { openWhatsApp } from '@/lib/whatsapp';

const OPEN_HOUR = 8;
const CLOSE_HOUR = 19;
const PIXELS_PER_MINUTE = 2.2;
const SCHEDULE_HEADER_HEIGHT = 48;
const SNAP_MINUTES = 15;
const SURGERY_INCREMENT_MINUTES = 10;
const TIME_COL_WIDTH = 64;
const ROOM_COL_WIDTH = 130;
const WEEK_DAY_MIN_WIDTH = 132;
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function pad(n) { return String(n).padStart(2, '0'); }
function toISODate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dateFromISO(iso) { return new Date(`${iso}T00:00:00`); }
function toMonthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function todayISODate() { return toISODate(new Date()); }
function addDays(date, amount) { const d = new Date(date); d.setDate(d.getDate() + amount); return d; }
function startOfWeek(date) { const d = new Date(date); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day)); d.setHours(0, 0, 0, 0); return d; }
function weekDates(date) { const start = startOfWeek(date); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); }
function buildMonthGrid(year, monthIndex) { const first = new Date(year, monthIndex, 1); const start = addDays(first, -((first.getDay() + 6) % 7)); return Array.from({ length: 42 }, (_, i) => addDays(start, i)); }
function formatTime(iso) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function formatSlotLabel(time24) { const [h, m] = time24.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
function minutesSinceOpen(iso) { const d = new Date(iso); return (d.getHours() - OPEN_HOUR) * 60 + d.getMinutes(); }
function timeFromMinutes(minutesFromOpen) { const total = OPEN_HOUR * 60 + minutesFromOpen; return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`; }
function startTimeFromMinutes(dateISO, minutesFromOpen) { return new Date(`${dateISO}T${timeFromMinutes(minutesFromOpen)}:00`).toISOString(); }
function buildHourMarks() { const marks = []; for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) marks.push(h); return marks; }
const HOUR_MARKS = buildHourMarks();
function buildQuarterMarks() { const marks = []; const total = (CLOSE_HOUR - OPEN_HOUR) * 60; for (let m = SNAP_MINUTES; m < total; m += SNAP_MINUTES) if (m % 60 !== 0) marks.push(m); return marks; }
const QUARTER_MARKS = buildQuarterMarks();

// Packs a set of time-ranged items (appointments) into side-by-side
// columns so ones whose times actually overlap split the available width
// instead of stacking on top of each other — the same "meeting scheduler"
// column-packing approach calendar apps use. Items are grouped into
// clusters of mutually-overlapping ranges first, so an appointment with
// no real time conflict still gets full width even if it's near a
// crowded slot.
//
// Also returns, per item, how many minutes are actually free below it
// before the next appointment in the list starts (maxMinutes) — a short
// appointment's block still has a readable minimum height (see the 22px
// floor at each call site), but that floor must never be taller than the
// real gap to whatever's chronologically next, or two back-to-back
// 15-minute slots visually bleed into each other even though nothing is
// really double-booked. When the next appointment overlaps this one in
// time, they're already rendered side by side in different columns
// (see above) rather than stacked, so no cap is needed against it.
//
// Returns a Map from item.id -> { col, count, maxMinutes }.
function layoutOverlaps(items) {
  const layout = new Map();
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  let cluster = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (cluster.length === 0) return;
    const columnEnds = [];
    for (const item of cluster) {
      let col = columnEnds.findIndex((end) => end <= item.start);
      if (col === -1) { col = columnEnds.length; columnEnds.push(item.end); }
      else columnEnds[col] = item.end;
      item._col = col;
    }
    const count = columnEnds.length;
    for (const item of cluster) layout.set(item.id, { col: item._col, count, maxMinutes: Infinity });
    cluster = [];
  }

  for (const item of sorted) {
    if (cluster.length > 0 && item.start >= clusterEnd) { flushCluster(); clusterEnd = -Infinity; }
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flushCluster();

  for (let i = 0; i < sorted.length - 1; i++) {
    const item = sorted[i];
    const next = sorted[i + 1];
    if (next.start >= item.end) layout.get(item.id).maxMinutes = next.start - item.start;
  }

  return layout;
}
function playAlertBeep() { try { const Ctx = window.AudioContext || window.webkitAudioContext; const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = 'sine'; osc.frequency.value = 880; gain.gain.setValueAtTime(0.15, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.35); } catch {} }

const emptyForm = { client_id: '', patient_id: '', room_id: '', vet_id: '', type: 'consult', time: '', duration_minutes: '10', reason: '' };

export default function AppointmentsPage() {
  return <Suspense fallback={<p>Loading...</p>}><AppointmentsPageInner /></Suspense>;
}

function AppointmentsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = new Date();
  const [calendarView, setCalendarView] = useState('week');
  const [monthOpen, setMonthOpen] = useState(false);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonthIndex, setViewMonthIndex] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayISODate());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [clientPatients, setClientPatients] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [vets, setVets] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [hoverSlot, setHoverSlot] = useState(null);
  const [openingConsultId, setOpeningConsultId] = useState(null);
  const [rosterBlock, setRosterBlock] = useState(null);
  const [resolvingRosterBlock, setResolvingRosterBlock] = useState(false);
  const pixelsPerMinute = PIXELS_PER_MINUTE;
  const [scheduleError, setScheduleError] = useState(null);
  const [dragSelect, setDragSelect] = useState(null);
  const [dragMove, setDragMove] = useState(null);
  const [dragResize, setDragResize] = useState(null);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const bookingFormRef = useRef(null);
  const pendingClickTimeoutRef = useRef(null);
  const scheduleWrapRef = useRef(null);
  const scheduleHeight = (CLOSE_HOUR - OPEN_HOUR) * 60 * pixelsPerMinute;

  const selectedDateObj = useMemo(() => dateFromISO(selectedDate), [selectedDate]);
  const currentWeek = useMemo(() => weekDates(selectedDateObj), [selectedDateObj]);
  const monthGrid = useMemo(() => buildMonthGrid(viewYear, viewMonthIndex), [viewYear, viewMonthIndex]);
  const monthLabel = new Date(viewYear, viewMonthIndex, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
  const selectedDateLabel = selectedDateObj.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const weekLabel = `${currentWeek[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${currentWeek[6].toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const visibleMonthKeys = useMemo(() => {
    const dates = calendarView === 'week' ? currentWeek : [selectedDateObj];
    const keys = new Set(dates.map(toMonthKey));
    keys.add(`${viewYear}-${pad(viewMonthIndex + 1)}`);
    return [...keys];
  }, [calendarView, currentWeek, selectedDateObj, viewYear, viewMonthIndex]);

  async function loadAppointments() {
    setLoading(true);
    try {
      const chunks = await Promise.all(visibleMonthKeys.map((month) => fetch(`/api/appointments?month=${month}`).then((res) => res.json())));
      const byId = new Map();
      for (const chunk of chunks) {
        if (!Array.isArray(chunk)) continue;
        for (const appointment of chunk) byId.set(appointment.id, appointment);
      }
      setAppointments([...byId.values()]);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadAppointments(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [visibleMonthKeys.join('|'), refreshTick]);

  useEffect(() => {
    Promise.all([fetch('/api/rooms').then((res) => res.json()), fetch('/api/staff?role=vet').then((res) => res.json())]).then(([roomsData, vetsData]) => {
      setRooms(Array.isArray(roomsData) ? roomsData : []);
      setVets(Array.isArray(vetsData) ? vetsData : []);
    });
    const channel = supabase.channel('appointments-view-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => setRefreshTick((n) => n + 1)).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const vetColor = useMemo(() => buildStaffColorMap(vets), [vets]);
  const colorForVetAppt = (vetId, type) => colorForAppointment(vetColor, vetId, type);
  useEffect(() => { if (rosterBlock) playAlertBeep(); }, [rosterBlock]);
  useEffect(() => () => { if (pendingClickTimeoutRef.current) clearTimeout(pendingClickTimeoutRef.current); }, []);
  function scrollToShift(hour) { const el = scheduleWrapRef.current; if (el) el.scrollTo({ top: Math.max(0, (hour - OPEN_HOUR) * 60 * pixelsPerMinute - 8), behavior: 'smooth' }); }

  const countsByDate = useMemo(() => { const counts = {}; for (const a of appointments) { if (a.status === 'cancelled') continue; const d = toISODate(new Date(a.start_time)); counts[d] = (counts[d] || 0) + 1; } return counts; }, [appointments]);
  const dayAppointments = useMemo(() => appointments.filter((a) => a.status !== 'cancelled' && toISODate(new Date(a.start_time)) === selectedDate), [appointments, selectedDate]);
  const weekAppointmentsByDate = useMemo(() => { const result = {}; for (const d of currentWeek) result[toISODate(d)] = []; for (const a of appointments) { if (a.status === 'cancelled') continue; const iso = toISODate(new Date(a.start_time)); if (result[iso]) result[iso].push(a); } return result; }, [appointments, currentWeek]);
  const liveDayAppointments = useMemo(() => { if (!dragMove && !dragResize) return dayAppointments; return dayAppointments.map((a) => { if (dragMove?.appointmentId === a.id) return { ...a, room_id: dragMove.roomId, start_time: startTimeFromMinutes(selectedDate, dragMove.startMinutes) }; if (dragResize?.appointmentId === a.id) return { ...a, duration_minutes: dragResize.duration }; return a; }); }, [dayAppointments, dragMove, dragResize, selectedDate]);
  const selectedSlotPreview = useMemo(() => { if (!form.time) return null; const [hour, minute] = form.time.split(':').map(Number); const startMinutes = (hour - OPEN_HOUR) * 60 + minute; const duration = form.type === 'surgery' ? Math.max(SURGERY_INCREMENT_MINUTES, Number(form.duration_minutes) || SURGERY_INCREMENT_MINUTES) : SNAP_MINUTES; return { roomId: form.room_id, startMinutes, duration, date: selectedDate }; }, [form.time, form.room_id, form.type, form.duration_minutes, selectedDate]);

  useEffect(() => { if (!form.client_id) { setClientPatients([]); return; } fetch(`/api/patients?client_id=${form.client_id}`).then((res) => res.json()).then((data) => setClientPatients(Array.isArray(data) ? data : [])); }, [form.client_id]);
  useEffect(() => { const clientId = searchParams.get('client_id'); const patientId = searchParams.get('patient_id'); if (!clientId) return; fetch(`/api/clients/${clientId}`).then((res) => res.json()).then((client) => { if (!client || client.error) return; setSelectedOwner({ id: client.id, full_name: client.full_name }); setForm((f) => ({ ...f, client_id: clientId, patient_id: patientId || '' })); bookingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function syncMonthToDate(d) { setViewYear(d.getFullYear()); setViewMonthIndex(d.getMonth()); }
  function selectDay(d, switchToDay = false) { setSelectedDate(toISODate(d)); syncMonthToDate(d); if (switchToDay) setCalendarView('day'); }
  function navigate(direction) { selectDay(addDays(selectedDateObj, direction * (calendarView === 'week' ? 7 : 1))); }
  function goToday() { selectDay(new Date()); }
  function goToMonth(delta) { const d = new Date(viewYear, viewMonthIndex + delta, 1); setViewYear(d.getFullYear()); setViewMonthIndex(d.getMonth()); }
  function computeSlot(e) { const rect = e.currentTarget.getBoundingClientRect(); const raw = (e.clientY - rect.top) / pixelsPerMinute; const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES; const clamped = Math.max(0, Math.min(snapped, (CLOSE_HOUR - OPEN_HOUR) * 60 - SNAP_MINUTES)); return { minutesFromOpen: clamped, time: timeFromMinutes(clamped) }; }

  function applySlotSelection(roomId, startMinutes, durationMinutes, dateISO = selectedDate) {
    const time = timeFromMinutes(startMinutes);
    const room = rooms.find((r) => r.id === roomId);
    setSelectedDate(dateISO); syncMonthToDate(dateFromISO(dateISO));
    if (durationMinutes <= SNAP_MINUTES) { const type = room?.type === 'surgery' ? 'surgery' : 'consult'; setForm((f) => ({ ...f, time, room_id: roomId || f.room_id, type, duration_minutes: '10' })); }
    else { const rounded = Math.max(SURGERY_INCREMENT_MINUTES, Math.round(durationMinutes / SURGERY_INCREMENT_MINUTES) * SURGERY_INCREMENT_MINUTES); setForm((f) => ({ ...f, time, room_id: roomId || f.room_id, type: 'surgery', duration_minutes: String(rounded) })); }
    setError(null); setRosterBlock(null); bookingFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startDragSelect(e, roomId) {
    if (calendarView !== 'day' || e.button !== 0 || dragMove || dragResize) return;
    const rect = e.currentTarget.getBoundingClientRect(); const { minutesFromOpen } = computeSlot(e); setDragSelect({ roomId, startMinutes: minutesFromOpen, endMinutes: minutesFromOpen }); setHoverSlot(null);
    function onMove(moveEvent) { const raw = (moveEvent.clientY - rect.top) / pixelsPerMinute; const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES; const clamped = Math.max(0, Math.min(snapped, (CLOSE_HOUR - OPEN_HOUR) * 60 - SNAP_MINUTES)); setDragSelect((prev) => prev ? { ...prev, endMinutes: clamped } : prev); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); setDragSelect((prev) => { if (prev) { const start = Math.min(prev.startMinutes, prev.endMinutes); const end = Math.max(prev.startMinutes, prev.endMinutes) + SNAP_MINUTES; applySlotSelection(prev.roomId, start, end - start); } return null; }); }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }
  function hoverGrid(e, roomId, dateISO = selectedDate) { if (dragSelect || dragMove || dragResize) return; const { minutesFromOpen, time } = computeSlot(e); setHoverSlot({ roomId, dateISO, top: minutesFromOpen * pixelsPerMinute, label: formatSlotLabel(time) }); }

  function startMoveAppointment(e, appointment) {
    if (calendarView !== 'day' || e.button !== 0 || appointment.status === 'cancelled' || appointment.status === 'complete') return;
    e.stopPropagation(); const trackEl = e.currentTarget.closest('.schedule-room-track'); if (!trackEl) return;
    const originalRoomId = appointment.room_id; const originalStartMinutes = minutesSinceOpen(appointment.start_time); const duration = appointment.duration_minutes; const totalMinutes = (CLOSE_HOUR - OPEN_HOUR) * 60; const grabOffsetMinutes = (e.clientY - trackEl.getBoundingClientRect().top) / pixelsPerMinute - originalStartMinutes; const startX = e.clientX; const startY = e.clientY; let moved = false;
    setDragMove({ appointmentId: appointment.id, roomId: originalRoomId, startMinutes: originalStartMinutes }); setHoverSlot(null);
    function resolve(clientX, clientY) { const el = document.elementFromPoint(clientX, clientY)?.closest('.schedule-room-track'); const roomId = el?.dataset.roomId || originalRoomId; const rect = el ? el.getBoundingClientRect() : trackEl.getBoundingClientRect(); const raw = (clientY - rect.top) / pixelsPerMinute - grabOffsetMinutes; const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES; return { roomId, startMinutes: Math.max(0, Math.min(snapped, totalMinutes - duration)) }; }
    function onMove(moveEvent) { if (Math.abs(moveEvent.clientX - startX) > 3 || Math.abs(moveEvent.clientY - startY) > 3) moved = true; setDragMove((prev) => prev ? { ...prev, ...resolve(moveEvent.clientX, moveEvent.clientY) } : prev); }
    function onUp(upEvent) { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); setDragMove(null); if (!moved) { if (pendingClickTimeoutRef.current) { clearTimeout(pendingClickTimeoutRef.current); pendingClickTimeoutRef.current = null; } else pendingClickTimeoutRef.current = setTimeout(() => { pendingClickTimeoutRef.current = null; openEditModal(appointment); }, 250); return; } const next = resolve(upEvent.clientX, upEvent.clientY); if (next.roomId === originalRoomId && next.startMinutes === originalStartMinutes) return; patchAppointment(appointment.id, { room_id: next.roomId, start_time: startTimeFromMinutes(selectedDate, next.startMinutes), date: selectedDate, shift: OPEN_HOUR + Math.floor(next.startMinutes / 60) < 12 ? 'morning' : 'afternoon' }); }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }

  function startResizeAppointment(e, appointment) {
    if (calendarView !== 'day' || e.button !== 0) return; e.stopPropagation(); const trackEl = e.currentTarget.closest('.schedule-room-track'); if (!trackEl) return;
    const rect = trackEl.getBoundingClientRect(); const startMinutes = minutesSinceOpen(appointment.start_time); const totalMinutes = (CLOSE_HOUR - OPEN_HOUR) * 60; const originalDuration = appointment.duration_minutes; setDragResize({ appointmentId: appointment.id, duration: originalDuration });
    function onMove(moveEvent) { const raw = (moveEvent.clientY - rect.top) / pixelsPerMinute - startMinutes; const snapped = Math.round(raw / SURGERY_INCREMENT_MINUTES) * SURGERY_INCREMENT_MINUTES; const clamped = Math.max(SURGERY_INCREMENT_MINUTES, Math.min(snapped, totalMinutes - startMinutes)); setDragResize((prev) => prev ? { ...prev, duration: clamped } : prev); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); setDragResize((prev) => { if (prev && prev.duration !== originalDuration) patchAppointment(appointment.id, { duration_minutes: prev.duration, date: selectedDate, shift: startMinutes < (12 - OPEN_HOUR) * 60 ? 'morning' : 'afternoon' }); return null; }); }
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  }

  async function submitAppointment(payload) { const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await res.json(); if (!res.ok) { if (data.code === 'not_on_roster') setRosterBlock({ message: `${data.vet_name} isn't on the staff roster for that ${data.shift} (${data.date}).`, vetId: data.vet_id, vetName: data.vet_name, date: data.date, shift: data.shift, payload }); else setError(data.error || 'Failed to book appointment'); } else { setRosterBlock(null); setForm({ ...emptyForm, client_id: form.client_id }); setRefreshTick((n) => n + 1); } return res.ok; }
  async function patchAppointment(appointmentId, body) { const res = await fetch(`/api/appointments/${appointmentId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await res.json().catch(() => null); if (!res.ok) { if (data?.code === 'not_on_roster') { setRosterBlock({ message: `${data.vet_name} isn't on the staff roster for that ${data.shift} (${data.date}).`, vetId: data.vet_id, vetName: data.vet_name, date: data.date, shift: data.shift, payload: { __reschedule: true, appointmentId, body } }); return { ok: false, rosterBlocked: true }; } const message = data?.error || 'Failed to update the appointment'; setScheduleError(message); return { ok: false, rosterBlocked: false, error: message }; } setScheduleError(null); setRosterBlock(null); setRefreshTick((n) => n + 1); return { ok: true }; }
  function openEditModal(appointment) { if (pendingClickTimeoutRef.current) { clearTimeout(pendingClickTimeoutRef.current); pendingClickTimeoutRef.current = null; } setScheduleError(null); setEditingAppointment(appointment); }
  async function handleEditSave(body) { const result = await patchAppointment(editingAppointment.id, body); if (result.ok || result.rosterBlocked) { setEditingAppointment(null); return {}; } return { error: result.error }; }
  async function addToRosterAndBook() { if (!rosterBlock) return; setResolvingRosterBlock(true); setError(null); try { const res = await fetch('/api/staff-roster', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ staff_id: rosterBlock.vetId, date: rosterBlock.date, shift: rosterBlock.shift }) }); if (!res.ok) { const data = await res.json().catch(() => null); setError(data?.error || 'Failed to add to the staff roster'); return; } const payload = rosterBlock.payload; setRosterBlock(null); if (payload?.__reschedule) await patchAppointment(payload.appointmentId, payload.body); else await submitAppointment(payload); } finally { setResolvingRosterBlock(false); } }
  function rebookWithOtherVet() { setRosterBlock(null); setForm((f) => ({ ...f, vet_id: '' })); }

  async function handleSubmit(e) { e.preventDefault(); if (!form.time || !form.room_id) { setError('Pick a date/time on the schedule and select a room'); return; } if (!form.client_id || !form.patient_id) { setError('Select an owner and patient'); return; } setSubmitting(true); setError(null); setRosterBlock(null); const startTime = new Date(`${selectedDate}T${form.time}:00`); await submitAppointment({ patient_id: form.patient_id, room_id: form.room_id, vet_id: form.vet_id || null, type: form.type, start_time: startTime.toISOString(), duration_minutes: form.type === 'surgery' ? Number(form.duration_minutes) : undefined, reason: form.reason, date: selectedDate, shift: startTime.getHours() < 12 ? 'morning' : 'afternoon' }); setSubmitting(false); }
  async function cancelAppointment(id) { await fetch(`/api/appointments/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) }); setRefreshTick((n) => n + 1); }
  function reminderMessage(a) { const dateLabel = new Date(a.start_time).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }); return `Hi ${a.clients?.full_name || 'there'}, this is a reminder that ${a.patients?.name || 'your pet'} has an appointment at Europets Clinic on ${dateLabel} at ${formatTime(a.start_time)}. See you then! — Europets Clinic`; }
  function sendReminder(a) { if (!openWhatsApp(a.clients?.phone, reminderMessage(a))) return; fetch(`/api/appointments/${a.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mark_reminded: true }) }).then(() => setRefreshTick((n) => n + 1)); }
  // A booked appointment is per-definition either a consult or a day
  // procedure (see appointment.type) — surgery-type slots check straight
  // into a day procedure (hospitalizations.appointment_id) instead of a
  // consult, no prompt needed, since that mapping is fixed.
  async function checkIn(appointment) {
    if (appointment.type === 'surgery') {
      await fetch('/api/hospitalizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment_id: appointment.id, kind: 'day_procedure' }) });
    } else {
      await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment_id: appointment.id }) });
    }
    setRefreshTick((n) => n + 1);
  }
  async function openConsult(appointment) { if (openingConsultId) return; setOpeningConsultId(appointment.id); try { if (appointment.status === 'booked') { const res = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment_id: appointment.id }) }); const data = await res.json(); if (res.ok && data.id) return router.push(`/consults/${data.id}`); } else if (appointment.status === 'checked_in' || appointment.status === 'complete') { const res = await fetch(`/api/visits?appointment_id=${appointment.id}`); const data = await res.json(); const visit = Array.isArray(data) ? data[0] : null; if (visit?.id) return router.push(`/consults/${visit.id}`); } } finally { setOpeningConsultId(null); } }
  async function openDayProcedure(appointment) { if (openingConsultId) return; setOpeningConsultId(appointment.id); try { if (appointment.status === 'booked') { const res = await fetch('/api/hospitalizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointment_id: appointment.id, kind: 'day_procedure' }) }); const data = await res.json(); if (res.ok && data.id) return router.push(`/hospitalization/${data.id}`); } else if (appointment.status === 'checked_in' || appointment.status === 'complete') { const res = await fetch(`/api/hospitalizations?appointment_id=${appointment.id}`); const data = await res.json(); const admission = Array.isArray(data) ? data[0] : null; if (admission?.id) return router.push(`/hospitalization/${admission.id}`); } } finally { setOpeningConsultId(null); } }
  function openAppointmentRecord(appointment) { return appointment.type === 'surgery' ? openDayProcedure(appointment) : openConsult(appointment); }

  function appointmentBlock(a, extraStyle = {}, compact = false) {
    const color = colorForVetAppt(a.vet_id, a.type); const canDrag = calendarView === 'day' && a.status !== 'cancelled' && a.status !== 'complete';
    return <div key={a.id} className={['schedule-block', canDrag ? 'schedule-block-draggable' : '', openingConsultId === a.id ? 'schedule-block-opening' : ''].filter(Boolean).join(' ')} style={{ background: color.bg, borderColor: color.fg, color: color.fg, overflow: 'hidden', ...extraStyle }} title={`${formatTime(a.start_time)} · ${a.patients?.name || 'Unlinked'} · ${a.rooms?.name || 'No room'} · ${a.staff?.full_name || 'Unassigned vet'}`} onClick={(e) => { e.stopPropagation(); if (calendarView === 'week') openEditModal(a); }} onDoubleClick={(e) => { e.stopPropagation(); if (pendingClickTimeoutRef.current) clearTimeout(pendingClickTimeoutRef.current); openAppointmentRecord(a); }} onMouseDown={(e) => startMoveAppointment(e, a)} onMouseMove={(e) => e.stopPropagation()} onMouseEnter={() => setHoverSlot(null)}><strong>{a.patients?.name || 'Unlinked'}</strong>{compact ? <><br />{formatTime(a.start_time)}</> : <> {formatTime(a.start_time)} · {a.type} · {a.status}</>}{a.type === 'surgery' && canDrag && <div className="schedule-resize-handle" onMouseDown={(e) => startResizeAppointment(e, a)} />}</div>;
  }
  function renderTimeColumn() { return <div className="schedule-time-col" style={{ flex: `0 0 ${TIME_COL_WIDTH}px` }}><div className="schedule-header schedule-time-header" /><div className="schedule-time-track" style={{ height: scheduleHeight }}>{HOUR_MARKS.map((h) => <div key={h} className="schedule-hour-label" style={{ top: (h - OPEN_HOUR) * 60 * pixelsPerMinute }}>{pad(h)}:00</div>)}</div></div>; }
  function gridLines() { return <>{HOUR_MARKS.map((h) => <div key={`h-${h}`} className="schedule-hour-line" style={{ top: (h - OPEN_HOUR) * 60 * pixelsPerMinute }} />)}{QUARTER_MARKS.map((m) => <div key={`q-${m}`} className="schedule-quarter-line" style={{ top: m * pixelsPerMinute }} />)}</>; }

  function renderDayView() {
    return <div className="schedule-wrap" ref={scheduleWrapRef} style={{ maxWidth: TIME_COL_WIDTH + rooms.length * ROOM_COL_WIDTH + 2 }}>{renderTimeColumn()}{rooms.map((room) => {
      const roomAppointments = liveDayAppointments.filter((a) => a.room_id === room.id);
      const overlapLayout = layoutOverlaps(roomAppointments.map((a) => ({ id: a.id, start: minutesSinceOpen(a.start_time), end: minutesSinceOpen(a.start_time) + a.duration_minutes })));
      return <div key={room.id} className="schedule-room-col"><div className="schedule-header">{room.name}</div><div className="schedule-room-track" data-room-id={room.id} style={{ height: scheduleHeight }} onMouseDown={(e) => startDragSelect(e, room.id)} onMouseMove={(e) => hoverGrid(e, room.id)} onMouseLeave={() => setHoverSlot(null)}>{gridLines()}{hoverSlot?.roomId === room.id && hoverSlot.dateISO === selectedDate && <div className="schedule-hover-slot" style={{ top: hoverSlot.top, height: SNAP_MINUTES * pixelsPerMinute }}><span className="schedule-hover-label">{hoverSlot.label}</span></div>}{dragSelect?.roomId === room.id && <div className="schedule-drag-select" style={{ top: Math.min(dragSelect.startMinutes, dragSelect.endMinutes) * pixelsPerMinute, height: (Math.abs(dragSelect.endMinutes - dragSelect.startMinutes) + SNAP_MINUTES) * pixelsPerMinute }} />}{selectedSlotPreview?.roomId === room.id && !dragSelect && <div className="schedule-drag-select" style={{ top: selectedSlotPreview.startMinutes * pixelsPerMinute, height: Math.max(selectedSlotPreview.duration * pixelsPerMinute, 22), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, color: 'var(--pink-dark)' }}>Selected {formatSlotLabel(form.time)}</div>}{roomAppointments.map((a) => { const { col, count, maxMinutes } = overlapLayout.get(a.id) || { col: 0, count: 1, maxMinutes: Infinity }; const colWidth = 100 / count; const naturalHeight = Math.max(a.duration_minutes * pixelsPerMinute, 22); const height = maxMinutes === Infinity ? naturalHeight : Math.min(naturalHeight, maxMinutes * pixelsPerMinute); return appointmentBlock(a, { top: minutesSinceOpen(a.start_time) * pixelsPerMinute, height, left: `calc(${col * colWidth}% + 1px)`, width: `calc(${colWidth}% - 2px)`, right: 'auto', fontSize: count > 1 ? '0.68rem' : undefined, padding: count > 1 ? '2px 3px' : undefined }, count > 1); })}</div></div>;
    })}</div>;
  }

  function renderWeekView() {
    return <div className="schedule-wrap" ref={scheduleWrapRef} style={{ maxWidth: TIME_COL_WIDTH + 7 * WEEK_DAY_MIN_WIDTH + 2 }}><div style={{ display: 'flex', minWidth: TIME_COL_WIDTH + 7 * WEEK_DAY_MIN_WIDTH }}>{renderTimeColumn()}{currentWeek.map((day) => { const iso = toISODate(day); const dayApps = weekAppointmentsByDate[iso] || []; const overlapLayout = layoutOverlaps(dayApps.map((a) => ({ id: a.id, start: minutesSinceOpen(a.start_time), end: minutesSinceOpen(a.start_time) + a.duration_minutes }))); const isToday = iso === todayISODate(); const isSelected = iso === selectedDate; return <div key={iso} style={{ flex: `1 1 ${WEEK_DAY_MIN_WIDTH}px`, minWidth: WEEK_DAY_MIN_WIDTH, borderLeft: '1px solid #eee' }}><button type="button" onClick={() => selectDay(day, true)} style={{ width: '100%', height: SCHEDULE_HEADER_HEIGHT, borderRadius: 0, background: isSelected ? 'var(--pink)' : isToday ? 'var(--pink-tint)' : 'white', color: isSelected ? 'white' : 'var(--ink)', borderBottom: '1px solid #ddd', padding: '0.25rem' }}><div style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>{day.toLocaleDateString([], { weekday: 'short' })}</div><strong>{day.getDate()}</strong></button><div className="schedule-room-track" data-date={iso} style={{ height: scheduleHeight, position: 'relative' }} onClick={(e) => { if (e.target.closest('.schedule-block')) return; const { minutesFromOpen } = computeSlot(e); applySlotSelection('', minutesFromOpen, SNAP_MINUTES, iso); }} onMouseMove={(e) => hoverGrid(e, '', iso)} onMouseLeave={() => setHoverSlot(null)}>{gridLines()}{hoverSlot?.dateISO === iso && hoverSlot.roomId === '' && <div className="schedule-hover-slot" style={{ top: hoverSlot.top, height: SNAP_MINUTES * pixelsPerMinute }}><span className="schedule-hover-label">{hoverSlot.label}</span></div>}{selectedSlotPreview?.date === iso && <div className="schedule-drag-select" style={{ top: selectedSlotPreview.startMinutes * pixelsPerMinute, height: Math.max(selectedSlotPreview.duration * pixelsPerMinute, 22), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: 'var(--pink-dark)', zIndex: 2 }}>Selected {formatSlotLabel(form.time)}</div>}{dayApps.map((a) => { const { col, count, maxMinutes } = overlapLayout.get(a.id) || { col: 0, count: 1, maxMinutes: Infinity }; const width = 100 / count; const naturalHeight = Math.max(a.duration_minutes * pixelsPerMinute, 22); const height = maxMinutes === Infinity ? naturalHeight : Math.min(naturalHeight, maxMinutes * pixelsPerMinute); return appointmentBlock(a, { top: minutesSinceOpen(a.start_time) * pixelsPerMinute, height, left: `calc(${col * width}% + 1px)`, width: `calc(${width}% - 2px)`, right: 'auto', fontSize: count > 1 ? '0.68rem' : '0.74rem', padding: count > 1 ? '2px 3px' : '3px 5px', zIndex: 3 }, true); })}</div></div>; })}</div></div>;
  }

  return <div className="appointments-page">
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}><h1 style={{ margin: 0 }}>Appointments</h1><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button type="button" className="secondary" onClick={() => navigate(-1)}>‹</button><button type="button" className="secondary" onClick={goToday}>Today</button><button type="button" className="secondary" onClick={() => navigate(1)}>›</button><strong style={{ minWidth: 180, textAlign: 'center' }}>{calendarView === 'week' ? weekLabel : selectedDateLabel}</strong></div><div style={{ display: 'flex', gap: 8 }}><button type="button" className="secondary" onClick={() => scrollToShift(OPEN_HOUR)}>Morning</button><button type="button" className="secondary" onClick={() => scrollToShift(13)}>Afternoon</button></div><div style={{ display: 'flex', gap: 4, background: 'white', border: '1px solid #ddd', borderRadius: 999, padding: 3 }}><button type="button" onClick={() => setMonthOpen(true)} style={{ background: monthOpen ? 'var(--pink)' : 'transparent', color: monthOpen ? 'white' : 'var(--ink)', padding: '0.4rem 0.9rem' }}>Month</button><button type="button" onClick={() => setCalendarView('week')} style={{ background: calendarView === 'week' ? 'var(--pink)' : 'transparent', color: calendarView === 'week' ? 'white' : 'var(--ink)', padding: '0.4rem 0.9rem' }}>Week</button><button type="button" onClick={() => setCalendarView('day')} style={{ background: calendarView === 'day' ? 'var(--pink)' : 'transparent', color: calendarView === 'day' ? 'white' : 'var(--ink)', padding: '0.4rem 0.9rem' }}>Day</button></div></div>
    <div className={`schedule-layout ${calendarView === 'day' ? 'day-view' : ''}`}><div className="schedule-left-col"><AppointmentRequestsPanel rooms={rooms} vets={vets} onApproved={() => setRefreshTick((n) => n + 1)} /></div><div className="schedule-main">{scheduleError && <p className="error">{scheduleError}</p>}{vets.length > 0 && <div className="vet-legend">{vets.map((v) => <span key={v.id} className="vet-legend-item"><span className="vet-legend-swatch" style={{ background: colorForVetAppt(v.id, 'consult').bg, borderColor: colorForVetAppt(v.id, 'consult').fg }} title="Consult" /><span className="vet-legend-swatch" style={{ background: colorForVetAppt(v.id, 'surgery').bg, borderColor: colorForVetAppt(v.id, 'surgery').fg }} title="Surgery / Day Procedure" />{v.full_name}</span>)}<span className="vet-legend-item"><span className="vet-legend-swatch" style={{ background: UNASSIGNED_STAFF_COLOR.bg, borderColor: UNASSIGNED_STAFF_COLOR.fg }} />Unassigned</span><span className="vet-legend-hint">light = Consult · dark = Surgery/Day Procedure</span></div>}{loading ? <p>Loading...</p> : rooms.length === 0 ? <p>No rooms set up yet — add one on the <a href="/rooms">Rooms</a> page first.</p> : calendarView === 'week' ? renderWeekView() : renderDayView()}</div><div className="booking-panel"><form className="card" ref={bookingFormRef} onSubmit={handleSubmit}><h2>Book Appointment</h2>{error && <p className="error">{error}</p>}<p>{form.time ? `Booking ${selectedDateLabel} at ${form.time}${form.room_id ? ` in ${rooms.find((r) => r.id === form.room_id)?.name || ''}` : ' — select a room below'}` : 'Click a time on the schedule to start a booking'}</p>{selectedOwner ? <p className="booking-owner-picked">Owner: <strong>{selectedOwner.full_name}</strong>{' '}<button type="button" onClick={() => { setSelectedOwner(null); setForm((f) => ({ ...f, client_id: '', patient_id: '' })); }}>Change</button></p> : <ClientOrPatientSearch placeholder="Search clients or patients..." onPickClient={(c) => { setSelectedOwner({ id: c.id, full_name: c.full_name }); setForm((f) => ({ ...f, client_id: c.id, patient_id: '' })); }} onPickPatient={(p) => { setSelectedOwner({ id: p.client_id, full_name: p.clients?.full_name || '' }); setForm((f) => ({ ...f, client_id: p.client_id, patient_id: p.id })); }} />}<SearchSelect items={clientPatients} value={form.patient_id} onChange={(patient_id) => setForm((f) => ({ ...f, patient_id }))} getLabel={(p) => p.name} getSubLabel={(p) => p.species} placeholder="Select patient..." disabled={!form.client_id} /><select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value, duration_minutes: '10' }))}><option value="consult">Consult (15 min)</option><option value="surgery">Surgery (10-min increments)</option></select>{form.type === 'surgery' && <input type="number" min="10" step="10" value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} placeholder="Duration (minutes)" />}<select required value={form.room_id} onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}><option value="">Select room...</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select><select value={form.vet_id} onChange={(e) => { setForm((f) => ({ ...f, vet_id: e.target.value })); setRosterBlock(null); }}><option value="">Select vet (optional)...</option>{vets.map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}</select><input placeholder="Reason for visit" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} /><button type="submit" disabled={submitting || !form.time || !form.room_id}>{submitting ? 'Booking...' : 'Book'}</button></form></div></div>
    <h2>{selectedDateLabel} — list</h2><div className="appointments-day-list-wrap"><table><thead><tr><th>Time</th><th>Type</th><th>Patient</th><th>Reason</th><th>Room</th><th>Vet</th><th>Status</th><th></th></tr></thead><tbody>{dayAppointments.length === 0 && <tr><td colSpan={8}>No appointments booked for this day.</td></tr>}{dayAppointments.map((a) => <tr key={a.id}><td>{formatTime(a.start_time)} ({a.duration_minutes}m)</td><td>{a.type}</td><td>{a.patients?.name || (a.patient_id ? '' : '(unlinked)')}</td><td>{a.reason}</td><td>{a.rooms?.name}</td><td>{a.staff?.full_name || '—'}</td><td>{a.status}</td><td>{a.status === 'booked' && a.patient_id && <button type="button" onClick={() => checkIn(a)}>Checkin</button>}{(a.status === 'checked_in' || a.status === 'complete') && <button type="button" disabled={openingConsultId === a.id} onClick={() => openAppointmentRecord(a)}>{openingConsultId === a.id ? 'Opening…' : a.type === 'surgery' ? 'View Day Procedure' : 'View Consult'}</button>}{a.status === 'booked' && a.clients?.phone && <button type="button" onClick={() => sendReminder(a)}>💬 Remind</button>}{a.status !== 'cancelled' && a.status !== 'complete' && <button type="button" onClick={() => cancelAppointment(a.id)}>Cancel</button>}{a.reminder_sent_at && <span className="visit-meta"> Reminded {formatTime(a.reminder_sent_at)}</span>}</td></tr>)}</tbody></table></div>
    {monthOpen && <div onMouseDown={() => setMonthOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.28)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh' }}><div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(560px, 92vw)', background: 'white', borderRadius: 14, boxShadow: '0 18px 60px rgba(0,0,0,.22)', padding: 18 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}><button type="button" className="secondary" onClick={() => goToMonth(-1)}>‹</button><strong style={{ fontSize: '1.15rem' }}>{monthLabel}</strong><button type="button" className="secondary" onClick={() => goToMonth(1)}>›</button></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>{WEEKDAY_LETTERS.map((w, i) => <div key={`${w}-${i}`} style={{ textAlign: 'center', fontSize: '.72rem', fontWeight: 700, color: '#777', padding: 4 }}>{w}</div>)}{monthGrid.map((d) => { const iso = toISODate(d); const inMonth = d.getMonth() === viewMonthIndex; const isSelected = iso === selectedDate; const count = countsByDate[iso] || 0; return <button key={iso} type="button" onClick={() => { selectDay(d, true); setMonthOpen(false); }} style={{ minHeight: 52, borderRadius: 9, background: isSelected ? 'var(--pink)' : inMonth ? 'var(--pink-tint)' : '#f6f6f6', color: isSelected ? 'white' : inMonth ? 'var(--ink)' : '#aaa', border: '1px solid transparent', position: 'relative' }}><span>{d.getDate()}</span>{count > 0 && <span style={{ position: 'absolute', right: 5, bottom: 4, fontSize: '.65rem', background: isSelected ? 'white' : 'var(--pink)', color: isSelected ? 'var(--pink-dark)' : 'white', borderRadius: 999, minWidth: 17, padding: '1px 4px' }}>{count}</span>}</button>; })}</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}><button type="button" className="secondary" onClick={() => { const d = new Date(); syncMonthToDate(d); }}>This month</button><button type="button" onClick={() => setMonthOpen(false)}>Close</button></div></div></div>}
    {rosterBlock && <div className="roster-block-backdrop"><div className="roster-block-modal" role="alertdialog" aria-live="assertive"><div className="roster-block-icon">⚠️</div><p className="roster-block-message">{rosterBlock.message}</p>{error && <p className="error">{error}</p>}<div className="roster-block-actions"><button type="button" onClick={addToRosterAndBook} disabled={resolvingRosterBlock}>{resolvingRosterBlock ? 'Adding...' : `✅ Add ${rosterBlock.vetName} & ${rosterBlock.payload?.__reschedule ? 'Move' : 'Book'}`}</button>{rosterBlock.payload?.__reschedule ? <button type="button" className="secondary" onClick={() => setRosterBlock(null)} disabled={resolvingRosterBlock}>✖️ Cancel</button> : <button type="button" className="secondary" onClick={rebookWithOtherVet} disabled={resolvingRosterBlock}>🔄 Rebook with Other Vet</button>}</div></div></div>}
    {editingAppointment && <EditAppointmentModal appointment={editingAppointment} rooms={rooms} vets={vets} onClose={() => setEditingAppointment(null)} onSave={handleEditSave} />}
  </div>;
}
