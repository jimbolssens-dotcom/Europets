// lib/patientPhotos.js
// Every photo taken for one patient, gathered from wherever it was filed
// on a consult or hospital stay — the consult's own Photos, its tests and
// X-rays, dental/surgical/imaging reports, the stay's Case Photos and its
// daily worksheet notes — each tagged with the record it belongs to and a
// short "where it came from" label. Feeds the photo thumbnails on the
// patient's Full History page and the History panel (GET
// /api/patients/:id/photos).

const REPORT_TABLES = [
  { table: 'dental_reports', entityType: 'dental_report', label: 'Dental' },
  { table: 'surgical_reports', entityType: 'surgical_report', label: 'Surgery' },
  { table: 'ultrasound_reports', entityType: 'ultrasound_report', label: 'Ultrasound' },
  { table: 'xray_reports', entityType: 'xray_report', label: 'X-ray' },
  { table: 'gastroscopy_reports', entityType: 'gastroscopy_report', label: 'Gastroscopy' },
];

// Keeps each .in() list well under PostgREST's URL length limit, even for
// a long stay with hundreds of worksheet notes.
const CHUNK = 150;

export function isImageAttachment(a) {
  return a.content_type?.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(a.file_name || '');
}

function dubaiDate(value) {
  return value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Dubai' }) : null;
}

function dayNumber(noteDate, admittedAt) {
  const admitted = dubaiDate(admittedAt);
  if (!noteDate || !admitted) return null;
  const days = Math.round((Date.parse(noteDate) - Date.parse(admitted)) / 86400000);
  return days >= 0 ? days + 1 : null;
}

async function byRecord(supabase, table, columns, visitIds, hospIds) {
  if (!visitIds.length && !hospIds.length) return [];
  let query = supabase.from(table).select(columns);
  query = visitIds.length && hospIds.length
    ? query.or(`visit_id.in.(${visitIds.join(',')}),hospitalization_id.in.(${hospIds.join(',')})`)
    : visitIds.length
      ? query.in('visit_id', visitIds)
      : query.in('hospitalization_id', hospIds);
  const { data } = await query;
  return data || [];
}

async function attachmentsFor(supabase, entityIds) {
  const rows = [];
  for (let i = 0; i < entityIds.length; i += CHUNK) {
    const { data } = await supabase
      .from('attachments')
      .select('id, entity_type, entity_id, file_path, file_name, content_type, created_at')
      .in('entity_id', entityIds.slice(i, i + CHUNK));
    rows.push(...(data || []));
  }
  return rows;
}

// Returns photos newest first: { id, file_path, file_name, created_at,
// source, record_type: 'visit' | 'hospitalization', record_id }.
export async function loadPatientPhotos(supabase, patientId) {
  const [{ data: visits }, { data: stays }] = await Promise.all([
    supabase.from('visits').select('id').eq('patient_id', patientId),
    supabase.from('hospitalizations').select('id, admitted_at').eq('patient_id', patientId),
  ]);
  const visitIds = (visits || []).map((v) => v.id);
  const hospIds = (stays || []).map((h) => h.id);
  if (!visitIds.length && !hospIds.length) return [];
  const admittedAt = Object.fromEntries((stays || []).map((h) => [h.id, h.admitted_at]));

  const [reportRows, diagnostics, notes] = await Promise.all([
    Promise.all(REPORT_TABLES.map((t) => byRecord(supabase, t.table, 'id, visit_id, hospitalization_id', visitIds, hospIds))),
    byRecord(supabase, 'diagnostics', 'id, visit_id, hospitalization_id, type, goods_services(name)', visitIds, hospIds),
    hospIds.length
      ? supabase.from('hospitalization_notes').select('id, hospitalization_id, note_date, created_at').in('hospitalization_id', hospIds).then((r) => r.data || [])
      : [],
  ]);

  // entity_type + entity_id -> which record it belongs to and its label.
  const owners = new Map();
  const own = (entityType, entityId, recordType, recordId, source) =>
    owners.set(`${entityType}:${entityId}`, { recordType, recordId, source });
  for (const id of visitIds) own('visit', id, 'visit', id, 'Consult');
  for (const id of hospIds) own('hospitalization', id, 'hospitalization', id, 'Stay');
  const fromRow = (r) => (r.visit_id ? ['visit', r.visit_id] : ['hospitalization', r.hospitalization_id]);
  REPORT_TABLES.forEach((t, i) => {
    for (const r of reportRows[i]) own(t.entityType, r.id, ...fromRow(r), t.label);
  });
  for (const d of diagnostics) {
    own('diagnostic', d.id, ...fromRow(d), d.goods_services?.name || d.type?.replaceAll('_', ' ') || 'Test');
  }
  for (const n of notes) {
    const day = dayNumber(n.note_date || dubaiDate(n.created_at), admittedAt[n.hospitalization_id]);
    own('hospitalization_note', n.id, 'hospitalization', n.hospitalization_id, day ? `Day ${day} note` : 'Worksheet note');
  }

  const entityIds = [...new Set([...owners.keys()].map((k) => k.split(':')[1]))];
  const attachments = await attachmentsFor(supabase, entityIds);
  return attachments
    .filter(isImageAttachment)
    .map((a) => {
      const owner = owners.get(`${a.entity_type}:${a.entity_id}`);
      if (!owner) return null;
      return {
        id: a.id,
        file_path: a.file_path,
        file_name: a.file_name,
        created_at: a.created_at,
        source: owner.source,
        record_type: owner.recordType,
        record_id: owner.recordId,
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
