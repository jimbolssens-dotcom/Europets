// app/_components/useVaccinations.js
// Shared state/logic behind recording and reviewing one patient's
// vaccinations — used by both the patient detail page and the consult
// page, which lay the form and history out differently.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { classifySpecies } from '@/lib/species';
import { formatDate, dueStatus } from '@/lib/vaccinationDueStatus';

export { formatDate, dueStatus };

export function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function makeEmptyForm(defaultVetId = '') {
  return {
    vaccine_protocol_ids: [],
    date_given: todayISODate(),
    batch_number: '',
    administered_by: defaultVetId,
    notes: '',
  };
}

// Vaccine auto-invoicing — the catalog items this clinic bills a
// vaccination visit against. Kept as plain name lookups (rather than
// stored ids) since the catalog is searched by name at billing time
// anyway; see migration 094 for where these three rows come from.
// administration_method is intentionally left NULL on all three in the
// catalog (not 'sc') because their price already includes the
// subcutaneous injection fee — fixing them to 'sc' would add that
// fee a second time (see lib/invoicing.js#applyAdministrationFee).
const CORE_VACCINE_NAME = { dog: 'Biocan DHPPiL', cat: 'Biofel PCH' };
const RABIES_VACCINE_NAME = 'Biocan R';
const CONSULT_PRIMARY_NAME = 'Consult primo vacc';
const CONSULT_ANNUAL_NAME = 'Consult vacc';

function findByName(list, name) {
  return Array.isArray(list) ? list.find((item) => item.name === name) : null;
}

// Finds (or opens) whichever invoice this vaccination belongs on: the
// consult's, the hospitalization/day procedure's, or — logged straight
// from the patient page with neither open — a fresh standalone invoice
// for the client, same as that page's own "Invoice" button. Returns null
// if there's nowhere to bill it (no visit/hospitalization/client at all).
async function resolveInvoiceId({ hospitalizationId, visitId, clientId } = {}) {
  const endpoint = hospitalizationId
    ? `/api/hospitalizations/${hospitalizationId}/invoice`
    : visitId
      ? `/api/visits/${visitId}/invoice`
      : null;
  if (endpoint) {
    const res = await fetch(endpoint, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to open the invoice');
    return data.id;
  }
  if (clientId) {
    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to open the invoice');
    return data.id;
  }
  return null;
}

// A catalog item not found by name (renamed, retyped, or never added —
// see CORE_VACCINE_NAME/RABIES_VACCINE_NAME above) used to just silently
// skip that one line rather than fail the whole visit's billing — which
// meant a missing item vanished a real charge with zero indication
// anywhere, exactly what happened to a rabies dose when its catalog entry
// didn't match. Still doesn't abort the other lines, but now collects the
// miss into `missing` (itemName, the human label to report by) so the
// caller can warn staff once everything else has gone through. The POST
// itself used to go unchecked too — a failed request (a duplicate catalog
// name resolving to a row the API rejects, a validation error, anything)
// was exactly as invisible as a missing item, just one layer deeper; now
// its error lands in `missing` the same way.
async function addInvoiceLine(invoiceId, item, itemName, quantity, description, missing) {
  if (!item) {
    missing.push(itemName);
    return;
  }
  const res = await fetch(`/api/invoices/${invoiceId}/line-items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goods_service_id: item.id, quantity, description }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    missing.push(`${itemName} (${data.error || 'failed to add'})`);
  }
}

// Same billing, but through the consult's own treatment plan (POST
// /api/treatment-items) instead of a raw invoice line — so the vaccine
// bundle actually shows up on the Treatment Plan tab (and its notes
// narrative), not just the invoice, exactly like anything else added
// from there. The invoice line itself still gets created, a moment
// later, by the treatment-plan -> invoice sync that resolveInvoiceId's
// POST /api/visits/:id/invoice already runs (see lib/invoicing.js
// #syncInvoiceTreatmentItems) — this just needs to run first, so that
// sync has something new to pick up.
async function addTreatmentItem(visitId, item, itemName, quantity, instructions, missing) {
  if (!item) {
    missing.push(itemName);
    return;
  }
  const res = await fetch('/api/treatment-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visit_id: visitId, goods_service_id: item.id, quantity, instructions: instructions || undefined }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    missing.push(`${itemName} (${data.error || 'failed to add'})`);
  }
}

export function useVaccinations(patientId, species, invoiceContext = {}, defaultVetId = '') {
  const [vaccinations, setVaccinations] = useState([]);
  const [protocols, setProtocols] = useState([]);
  const [protocolsError, setProtocolsError] = useState(null);
  const [form, setForm] = useState(() => makeEmptyForm(defaultVetId));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // The attending vet (e.g. the consult's) usually loads a moment after
  // this hook's first render — pre-fill "Administered by" once it's known,
  // but only while the field is still blank so it never overrides a
  // deliberate different choice.
  useEffect(() => {
    if (defaultVetId) {
      setForm((prev) => (prev.administered_by ? prev : { ...prev, administered_by: defaultVetId }));
    }
  }, [defaultVetId]);

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

  // Auto-invoicing for the vaccine visit just recorded above.
  //
  // Primary always bills the SAME fixed bundle — Consult primo vacc, the
  // species' core vaccine ×2 (today's dose plus the booster dose a month
  // out, prepaid now), and Biocan R ×1 — regardless of which protocol
  // checkboxes were actually ticked: whether or not rabies is given today
  // or held for the booster visit (see the reminder-row logic above), the
  // client has paid for both today's visit and next month's already, so
  // the bundle and its price never change. The core vaccine line spells
  // that out so it doesn't read as a billing mistake.
  //
  // Annual only bills for what was actually checked: the core vaccine if
  // the core protocol was ticked, Biocan R if rabies was ticked, plus one
  // Consult vacc — nothing prepaid, nothing assumed.
  async function billVaccinationVisit({ isPrimary, checkedProtocols, coreProtocol, rabiesGiven, boosterDue }) {
    if (!speciesClass) return; // can't tell cat vs dog — nothing to safely bill

    const [productCatalog, serviceCatalog] = await Promise.all([
      fetch('/api/goods-services?main_category=product').then((res) => res.json()),
      fetch('/api/goods-services?main_category=service').then((res) => res.json()),
    ]);
    const coreItemName = CORE_VACCINE_NAME[speciesClass];
    const coreItem = findByName(productCatalog, coreItemName);
    const rabiesItem = findByName(productCatalog, RABIES_VACCINE_NAME);
    const primaryConsultName = CONSULT_PRIMARY_NAME;
    const annualConsultName = CONSULT_ANNUAL_NAME;

    // Collects any catalog item that couldn't be found by name — see
    // addInvoiceLine/addTreatmentItem above — so a genuinely missing
    // catalog entry surfaces as a clear warning instead of a charge that
    // just silently never happened.
    const missing = [];

    const { visitId } = invoiceContext;

    if (visitId) {
      // Logged during a consult — add it to the treatment plan first (so
      // it shows there and in the consult notes narrative, same as any
      // other treatment plan item), then open/sync the invoice, which
      // picks up these new items the same way it picks up everything
      // else on the plan (see POST /api/visits/:id/invoice).
      if (isPrimary) {
        await addTreatmentItem(visitId, findByName(serviceCatalog, primaryConsultName), primaryConsultName, 1, undefined, missing);
        await addTreatmentItem(
          visitId,
          coreItem,
          coreItemName,
          2,
          coreItem ? `today's dose plus the booster due ${formatDate(boosterDue)} (already paid)` : undefined,
          missing
        );
        await addTreatmentItem(visitId, rabiesItem, RABIES_VACCINE_NAME, 1, rabiesItem ? 'primary course' : undefined, missing);
      } else {
        const coreChecked = coreProtocol && checkedProtocols.some((p) => p.id === coreProtocol.id);
        if (coreChecked) await addTreatmentItem(visitId, coreItem, coreItemName, 1, undefined, missing);
        if (rabiesGiven) await addTreatmentItem(visitId, rabiesItem, RABIES_VACCINE_NAME, 1, undefined, missing);
        if (coreChecked || rabiesGiven)
          await addTreatmentItem(visitId, findByName(serviceCatalog, annualConsultName), annualConsultName, 1, undefined, missing);
      }
      await resolveInvoiceId(invoiceContext);
      // Realtime will eventually pick these up too, but the staff member
      // looking at the Treatment Plan/invoice right after logging the
      // vaccination shouldn't have to wait on that round-trip — refresh
      // both right away, same as every other action that adds to the plan.
      invoiceContext.onBilled?.();
      if (missing.length > 0) throw new Error(`Vaccination saved, but couldn't bill ${missing.join(', ')} — missing from the catalog (check Settings > Catalog).`);
      return;
    }

    // Logged from the hospitalization page or the patient page directly —
    // neither has a treatment plan of its own to add these to, so bill
    // straight onto the invoice, same as before.
    const invoiceId = await resolveInvoiceId(invoiceContext);
    if (!invoiceId) return; // no hospitalization/client to attach the bill to

    if (isPrimary) {
      await addInvoiceLine(invoiceId, findByName(serviceCatalog, primaryConsultName), primaryConsultName, 1, undefined, missing);
      await addInvoiceLine(
        invoiceId,
        coreItem,
        coreItemName,
        2,
        coreItem ? `${coreItem.name} — today's dose plus the booster due ${formatDate(boosterDue)} (already paid)` : undefined,
        missing
      );
      await addInvoiceLine(
        invoiceId,
        rabiesItem,
        RABIES_VACCINE_NAME,
        1,
        rabiesItem ? `${rabiesItem.name} — primary course` : undefined,
        missing
      );
    } else {
      const coreChecked = coreProtocol && checkedProtocols.some((p) => p.id === coreProtocol.id);
      if (coreChecked) await addInvoiceLine(invoiceId, coreItem, coreItemName, 1, undefined, missing);
      if (rabiesGiven) await addInvoiceLine(invoiceId, rabiesItem, RABIES_VACCINE_NAME, 1, undefined, missing);
      if (coreChecked || rabiesGiven)
        await addInvoiceLine(invoiceId, findByName(serviceCatalog, annualConsultName), annualConsultName, 1, undefined, missing);
    }
    if (missing.length > 0) throw new Error(`Vaccination saved, but couldn't bill ${missing.join(', ')} — missing from the catalog (check Settings > Catalog).`);
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
    const dateGiven = form.date_given;

    // Primary means a 1-month booster follow-up for whatever was actually
    // given today — the core vaccine and, if it was checked too, rabies
    // right alongside it. Rabies only fell through to the server's normal
    // annual-interval default (see POST /api/vaccinations) when it WAS
    // given, which is backwards: the un-given case below already
    // schedules its placeholder reminder for this same one-month date —
    // a given dose needs the same follow-up, not a longer one.
    const payloads = checkedProtocols.map((p) => ({
      patient_id: patientId,
      vaccine_protocol_id: p.id,
      date_given: form.date_given,
      batch_number: form.batch_number,
      administered_by: form.administered_by || null,
      notes: form.notes,
      is_primary: isPrimary,
      ...(isPrimary && ((coreProtocol && p.id === coreProtocol.id) || p.is_rabies) ? { next_due_date: boosterDue } : {}),
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
      setForm(makeEmptyForm(defaultVetId));
      // An annual vaccination logged for any date other than today almost
      // always means it was already given — by this clinic earlier, or by
      // another clinic entirely — and is only being recorded here for the
      // patient's history, not something to charge for. A primary-course
      // vaccination backdated the same way still bills as usual (it's
      // never a "just recording history" entry the way an annual booster
      // can be), and today's own annual visit bills normally too.
      const isBackdatedAnnual = !isPrimary && dateGiven !== todayISODate();
      if (!isBackdatedAnnual) {
        try {
          await billVaccinationVisit({ isPrimary, checkedProtocols, coreProtocol, rabiesGiven, boosterDue });
        } catch (billingError) {
          setError(billingError.message || 'Vaccination saved, but failed to add it to the invoice');
        }
      }
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
