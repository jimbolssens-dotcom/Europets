// app/_components/useVaccinations.js
// Shared state/logic behind recording and reviewing one patient's
// vaccinations — used by both the patient detail page and the consult
// page, which lay the form and history out differently.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { classifySpecies } from '@/lib/species';

export function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dateStr}T00:00:00`);
  return Math.round((due - today) / 86400000);
}

export function dueStatus(dateStr) {
  if (!dateStr) return null;
  const d = daysUntil(dateStr);
  if (d < 0) return { label: `Overdue by ${Math.abs(d)}d`, className: 'error' };
  if (d <= 30) return { label: `Due in ${d}d`, className: '' };
  return { label: `Due ${formatDate(dateStr)}`, className: 'visit-meta' };
}

function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function makeEmptyForm() {
  return {
    vaccine_protocol_ids: [],
    date_given: todayISODate(),
    batch_number: '',
    administered_by: '',
    notes: '',
  };
}

export function useVaccinations(patientId, species) {
  const [vaccinations, setVaccinations] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [protocolsError, setProtocolsError] = useState(null);
  const [form, setForm] = useState(makeEmptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadVaccinations = () =>
    fetch(`/api/vaccinations?patient_id=${patientId}`)
      .then((res) => res.json())
      .then((data) => setVaccinations(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadVaccinations();
    fetch('/api/vaccine-protocols?active=true')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProtocols(data);
        } else {
          setProtocols([]);
          setProtocolsError(data?.error || 'Failed to load vaccine protocols');
        }
      });

    const channel = supabase
      .channel(`vaccinations-${patientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'vaccinations', filter: `patient_id=eq.${patientId}` },
        () => loadVaccinations()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const speciesClass = classifySpecies(species);
  const relevantProtocols = useMemo(() => {
    if (!speciesClass) return protocols; // can't tell cat vs dog — offer everything rather than block entry
    return protocols.filter((p) => p.species === speciesClass);
  }, [protocols, speciesClass]);

  function toggleProtocol(protocolId) {
    setForm((prev) => ({
      ...prev,
      vaccine_protocol_ids: prev.vaccine_protocol_ids.includes(protocolId)
        ? prev.vaccine_protocol_ids.filter((pid) => pid !== protocolId)
        : [...prev.vaccine_protocol_ids, protocolId],
    }));
  }

  // Annual: next_due_date is left for the server to compute from each
  // protocol's own interval (normally 12 months).
  //
  // Primary booster: the species' core (non-rabies) protocol gets its
  // next_due_date set to one month out instead. If rabies wasn't among the
  // checked boxes, a rabies reminder for that same one-month date is added
  // too — a "scheduled, not yet given" row (no date_given) rather than
  // pretending rabies was administered today. If rabies WAS checked, its
  // row is left on the normal annual cycle — no extra reminder needed.
  async function addVaccination(e, isPrimary) {
    e.preventDefault();
    if (form.vaccine_protocol_ids.length === 0) {
      setError('Check at least one vaccine given');
      return;
    }
    setSubmitting(true);
    setError(null);

    const checkedProtocols = relevantProtocols.filter((p) => form.vaccine_protocol_ids.includes(p.id));
    const coreProtocol = relevantProtocols.find((p) => p.core && !p.is_rabies);
    const rabiesGiven = checkedProtocols.some((p) => p.is_rabies);
    const boosterDue = isPrimary ? addMonths(form.date_given, 1) : null;

    const payloads = checkedProtocols.map((p) => ({
      patient_id: patientId,
      vaccine_protocol_id: p.id,
      date_given: form.date_given,
      batch_number: form.batch_number,
      administered_by: form.administered_by || null,
      notes: form.notes,
      is_primary: isPrimary,
      ...(isPrimary && coreProtocol && p.id === coreProtocol.id ? { next_due_date: boosterDue } : {}),
    }));

    if (isPrimary && !rabiesGiven) {
      const rabiesProtocol = relevantProtocols.find((p) => p.is_rabies);
      if (rabiesProtocol) {
        payloads.push({
          patient_id: patientId,
          vaccine_protocol_id: rabiesProtocol.id,
          date_given: null,
          next_due_date: boosterDue,
          is_primary: true,
          notes: 'Primary course booster — rabies not given at the first visit',
        });
      }
    }

    const results = await Promise.all(
      payloads.map((payload) =>
        fetch('/api/vaccinations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(async (res) => ({ ok: res.ok, data: await res.json() }))
      )
    );

    const failed = results.find((r) => !r.ok);
    if (failed) {
      setError(failed.data.error || 'Failed to record one or more vaccinations');
    } else {
      setForm(makeEmptyForm());
    }
    loadVaccinations();
    setSubmitting(false);
  }

  async function deleteVaccination(v) {
    const when = v.date_given ? formatDate(v.date_given) : 'not yet given';
    if (!confirm(`Delete this ${v.vaccine_name} record (${when})?`)) return;
    await fetch(`/api/vaccinations/${v.id}`, { method: 'DELETE' });
    loadVaccinations();
  }

  return {
    vaccinations,
    relevantProtocols,
    protocolsError,
    speciesClass,
    form,
    setForm,
    submitting,
    error,
    toggleProtocol,
    addVaccination,
    deleteVaccination,
  };
}
