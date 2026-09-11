// app/mobile/day-procedures/[id]/page.js
// A day procedure's checklist as big tap tiles — the mobile counterpart to
// the desktop Procedure Checklist (app/_components/ProcedureChecklist.jsx),
// restyled as one tap per item instead of a row list. Tapping a tile does
// whatever that item actually needs next (see lib/checklistItemAction.js
// for the shared classification, also used by the desktop checklist):
//   - Dental       -> opens/creates this patient's dental report on the
//                     existing mobile dictation screen.
//   - Vaccination  -> opens a small vaccination-logging screen; the item
//                     is marked done once a vaccination is actually saved.
//   - Spay/neuter  -> just marks it done — that alone auto-creates and
//                     fills in its post-op report from the clinic's
//                     baseline (lib/surgicalReportAuto.js), nothing to
//                     dictate.
//   - Other surgery -> auto-creates the (empty) surgical report and opens
//                     the mobile dictation screen for it.
//   - Blood test / generic diagnostic -> opens the camera directly, then
//                     uploads and AI-reads the result the same way the
//                     desktop Reports section does.
//   - X-ray / Ultrasound -> auto-creates the diagnostic + report and opens
//                     a mobile dictation screen (new — dental/surgery
//                     already had one, x-ray/ultrasound didn't).
//   - Anything else (Microchip, Ear Clean, ...) -> plain tap to mark done.

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import MobileHomeButton from '@/app/_components/MobileHomeButton';
import { useMobileStaff } from '@/app/_components/useMobileStaff';
import { checklistItemAction } from '@/lib/checklistItemAction';
import { ensureSurgicalReport } from '@/lib/surgicalReportAuto';
import { uploadAttachment } from '@/lib/attachments';

const ACTION_HINTS = {
  dental: 'Tap to open the dental report',
  vaccine: 'Tap to log the vaccination',
  spay_neuter: 'Tap to confirm — auto-fills the post-op report',
  surgery: 'Tap to dictate the surgical report',
  xray: 'Tap to dictate the X-ray report',
  ultrasound: 'Tap to dictate the ultrasound report',
  test: 'Tap to photograph and log the result',
};

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function MobileDayProcedurePage() {
  const { id } = useParams();
  const router = useRouter();
  const { staffId } = useMobileStaff();
  const [admission, setAdmission] = useState(null);
  const [planItems, setPlanItems] = useState([]);
  const [notes, setNotes] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [itemError, setItemError] = useState({});
  const fileInputRefs = useRef({});

  const loadNotes = () =>
    fetch(`/api/hospitalizations/${id}/notes`)
      .then((res) => res.json())
      .then((data) => setNotes(Array.isArray(data) ? data.filter((n) => n.plan_item_ids?.length > 0) : []));

  const loadPlanItems = () =>
    fetch(`/api/hospitalizations/${id}/plan-items`)
      .then((res) => res.json())
      .then((data) => setPlanItems(Array.isArray(data) ? data : []));

  useEffect(() => {
    fetch(`/api/hospitalizations/${id}`).then((res) => res.json()).then(setAdmission);
    loadPlanItems();
    loadNotes();
    fetch('/api/goods-services?active=true')
      .then((res) => res.json())
      .then((data) => setCatalog(Array.isArray(data) ? data : []));
    fetch('/api/catalog-subcategories')
      .then((res) => res.json())
      .then((data) => setSubcategories(Array.isArray(data) ? data : []));

    const channel = supabase
      .channel(`mobile-day-procedure-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_plan_items', filter: `hospitalization_id=eq.${id}` },
        loadPlanItems
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hospitalization_notes', filter: `hospitalization_id=eq.${id}` },
        loadNotes
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function isDone(itemId) {
    return notes.some((n) => n.plan_item_ids?.includes(itemId));
  }

  async function logDone(item) {
    const res = await fetch(`/api/hospitalizations/${id}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        author_id: staffId || null,
        note_date: todayISODate(),
        notes: item.instructions ? `${item.label} — ${item.instructions}` : item.label,
        plan_item_ids: [item.id],
        treatment_items: item.goods_service_id
          ? [{ goods_service_id: item.goods_service_id, quantity: 1, administration_method: item.administration_method }]
          : [],
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to log item');
    loadNotes();
  }

  async function findOrCreateDentalReport() {
    const list = await fetch(`/api/dental-reports?hospitalization_id=${id}`).then((res) => res.json());
    if (Array.isArray(list) && list.length > 0) return list[list.length - 1];
    const res = await fetch('/api/dental-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: id }),
    });
    return res.json();
  }

  async function findOrCreateDiagnostic(goodsServiceId) {
    const list = await fetch(`/api/diagnostics?hospitalization_id=${id}`).then((res) => res.json());
    const existing = Array.isArray(list) ? list.find((d) => d.goods_service_id === goodsServiceId) : null;
    if (existing) return existing;
    const res = await fetch('/api/diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: id, goods_service_id: goodsServiceId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start the test');
    return data;
  }

  async function findOrCreateImagingReport(reportType, diagnosticId) {
    const apiBase = reportType === 'xray' ? '/api/xray-reports' : '/api/ultrasound-reports';
    const list = await fetch(`${apiBase}?hospitalization_id=${id}`).then((res) => res.json());
    const existing = Array.isArray(list) ? list.find((r) => r.diagnostic_id === diagnosticId) : null;
    if (existing) return existing;
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalization_id: id, diagnostic_id: diagnosticId }),
    });
    return res.json();
  }

  async function handleTestPhoto(item, e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusyId(item.id);
    setItemError((prev) => ({ ...prev, [item.id]: null }));
    try {
      const diagnostic = await findOrCreateDiagnostic(item.goods_service_id);
      await uploadAttachment({ entityType: 'diagnostic', entityId: diagnostic.id, file, uploadedBy: staffId || null });

      const formData = new FormData();
      formData.append('image', file);
      formData.append('test_name', item.label);
      const res = await fetch(`/api/diagnostics/${diagnostic.id}/extract-result`, { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && !data.imaging_saved) {
        setItemError((prev) => ({ ...prev, [item.id]: `${data.error || 'Could not read the result'} — photo saved, log it manually on desktop.` }));
      }
      await logDone(item);
    } catch (err) {
      setItemError((prev) => ({ ...prev, [item.id]: err.message || 'Failed to log the test' }));
    } finally {
      setBusyId(null);
    }
  }

  async function handleTap(item) {
    const action = checklistItemAction(item, catalog, subcategories);

    if (action === 'test') {
      fileInputRefs.current[item.id]?.click();
      return;
    }

    setBusyId(item.id);
    setItemError((prev) => ({ ...prev, [item.id]: null }));
    try {
      if (action === 'dental') {
        await logDone(item);
        const report = await findOrCreateDentalReport();
        router.push(`/mobile/dental/${report.id}`);
        return;
      }
      if (action === 'vaccine') {
        router.push(`/mobile/day-procedures/${id}/vaccination?item=${item.id}`);
        return;
      }
      if (action === 'spay_neuter' || action === 'surgery') {
        const catalogItem = catalog.find((c) => c.id === item.goods_service_id);
        const report = await ensureSurgicalReport({
          hospitalizationId: id,
          procedureName: catalogItem?.name || item.label,
          isSpayNeuter: action === 'spay_neuter',
        });
        await logDone(item);
        if (action === 'surgery') router.push(`/mobile/surgery/${report.id}`);
        return;
      }
      if (action === 'xray' || action === 'ultrasound') {
        const diagnostic = await findOrCreateDiagnostic(item.goods_service_id);
        const report = await findOrCreateImagingReport(action, diagnostic.id);
        await logDone(item);
        router.push(`/mobile/${action}/${report.id}`);
        return;
      }
      await logDone(item);
    } catch (err) {
      setItemError((prev) => ({ ...prev, [item.id]: err.message || 'Something went wrong' }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mobile-page">
      <MobileHomeButton />
      {admission && (
        <>
          <h1>
            {admission.patients?.name}
            {admission.patients?.patient_number ? ` (Patient #${admission.patients.patient_number})` : ''}
          </h1>
          <p className="mobile-subtitle">
            {admission.clients?.full_name}
            {admission.clients?.client_number ? ` (Client #${admission.clients.client_number})` : ''}
          </p>

          {planItems.length === 0 && <p className="mobile-hint">Nothing on the checklist yet — dictate it from the desktop.</p>}

          <div className="day-plan-grid">
            {planItems.map((item) => {
              const action = checklistItemAction(item, catalog, subcategories);
              const done = isDone(item.id);
              return (
                <div key={item.id} className={`day-plan-task${done ? ' done' : ''}`}>
                  <button type="button" onClick={() => handleTap(item)} disabled={busyId === item.id}>
                    <span className="day-plan-task-label">{item.label}</span>
                    {action && <span className="day-plan-task-meta">{ACTION_HINTS[action]}</span>}
                    <span className="day-plan-task-status">
                      {busyId === item.id ? 'Working…' : done ? '✓ Done' : 'Not done yet'}
                    </span>
                  </button>
                  {itemError[item.id] && <p className="error">{itemError[item.id]}</p>}
                  {action === 'test' && (
                    <input
                      ref={(el) => (fileInputRefs.current[item.id] = el)}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) => handleTestPhoto(item, e)}
                      hidden
                    />
                  )}
                </div>
              );
            })}
          </div>

          <button type="button" className="mobile-secondary-action" onClick={() => router.push('/mobile/day-procedures')}>
            Done
          </button>
        </>
      )}
    </div>
  );
}
