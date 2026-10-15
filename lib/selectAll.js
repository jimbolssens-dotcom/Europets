// lib/selectAll.js
// A Supabase/PostgREST request returns at most 1000 rows, silently: a
// list that grows past that just loses whatever sorts last (the Messages
// inbox lost 14 threads this way, the catalog its last 5 items). Pass a
// function that builds the query (fresh each page, with a stable order)
// and this reads it page by page until a short page comes back.

export async function selectAll(makeQuery, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}
