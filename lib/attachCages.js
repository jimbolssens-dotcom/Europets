// lib/attachCages.js
// PostgREST's schema-cache can lag behind a freshly added relationship
// (hospitalizations -> cages, added in migration 017) until the project
// reloads it — the same failure mode the vaccinations due-list hit
// earlier. Rather than depend on embedding `cages(...)` in one query,
// fetch cages separately by id and merge them onto the rows in JS.

import { supabase } from './supabaseClient';

export async function attachCages(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  const cageIds = [...new Set(list.map((r) => r.cage_id).filter(Boolean))];

  let cagesById = {};
  if (cageIds.length > 0) {
    const { data: cages, error } = await supabase
      .from('cages')
      .select('id, name, group_name, is_oxygen_room')
      .in('id', cageIds);
    if (error) throw error;
    cagesById = Object.fromEntries((cages || []).map((c) => [c.id, c]));
  }

  const merged = list.map((r) => ({ ...r, cages: r.cage_id ? cagesById[r.cage_id] || null : null }));
  return Array.isArray(rows) ? merged : merged[0];
}
