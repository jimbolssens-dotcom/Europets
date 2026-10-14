// lib/patientHistoryFiles.js
// Shared bits for a patient's outside history and results (migration 189):
// notes from another clinic, old blood tests, imaging, photos, PDFs and
// Word files. Files live in the public consult-files bucket under
// patient-history/<patient_id>/.

export const HISTORY_BUCKET = 'consult-files';

export const HISTORY_CATEGORIES = [
  { value: 'outside_history', label: 'Previous clinic history', icon: '🏥' },
  { value: 'lab_results', label: 'Lab results', icon: '🧪' },
  { value: 'imaging', label: 'X-ray / imaging', icon: '🩻' },
  { value: 'other', label: 'Other', icon: '📄' },
];

export function historyCategory(value) {
  return HISTORY_CATEGORIES.find((c) => c.value === value) || HISTORY_CATEGORIES[HISTORY_CATEGORIES.length - 1];
}

// What the file opens as, for the icon next to it.
export function historyFileKind(row) {
  const type = row.content_type || '';
  const name = (row.file_name || '').toLowerCase();
  if (type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/.test(name)) return 'image';
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (/word|officedocument\.wordprocessing/.test(type) || /\.docx?$/.test(name)) return 'word';
  return 'file';
}

export function historyFileUrl(supabaseUrl, filePath) {
  return `${supabaseUrl}/storage/v1/object/public/${HISTORY_BUCKET}/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

const CONTENT_TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export function contentTypeFromName(name) {
  const ext = ((name || '').match(/\.([A-Za-z0-9]{1,8})$/) || [])[1];
  return (ext && CONTENT_TYPES[ext.toLowerCase()]) || null;
}
