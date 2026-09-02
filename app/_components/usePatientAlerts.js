// app/_components/usePatientAlerts.js
// Shared state/logic behind a patient's long-term alerts ("aggressive with
// handling", "allergic to penicillin", ...) — used by both the consult
// page (where a vet would first notice something worth flagging) and the
// patient detail page (where it's shown prominently). Deliberately
// separate from consult_notes (per-visit) and the patient's own free-text
// notes field.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function usePatientAlerts(patientId) {
  const [alerts, setAlerts] = useState([]);
  const [text, setText] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadAlerts = () =>
    fetch(`/api/patient-alerts?patient_id=${patientId}`)
      .then((res) => res.json())
      .then((data) => setAlerts(Array.isArray(data) ? data : []));

  useEffect(() => {
    if (!patientId) return;
    loadAlerts();

    const channel = supabase
      .channel(`patient-alerts-${patientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_alerts', filter: `patient_id=eq.${patientId}` },
        () => loadAlerts()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function addAlert(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    await fetch('/api/patient-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: patientId, author_id: authorId || null, note_text: text }),
    });
    setText('');
    setSubmitting(false);
    loadAlerts();
  }

  async function deleteAlert(alertId) {
    if (!confirm('Remove this note?')) return;
    await fetch(`/api/patient-alerts/${alertId}`, { method: 'DELETE' });
    loadAlerts();
  }

  return { alerts, text, setText, authorId, setAuthorId, submitting, addAlert, deleteAlert };
}
