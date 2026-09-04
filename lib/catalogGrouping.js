// lib/catalogGrouping.js
// Shared helpers for the three-tier goods_services catalog (main category
// -> subcategory -> item) — used anywhere a catalog item gets picked from a
// <select> or shown with its subcategory label.

export const MAIN_CATEGORIES = ['product', 'test', 'service'];
export const MAIN_CATEGORY_LABELS = { product: 'Product', test: 'Test', service: 'Service' };

// A "+ Add ___" button next to a CatalogPicker (see its onCategoryChange
// prop) reads this instead of a fixed "+ Add Item"/"Add", so it always
// names whichever tab is actually selected — "product" reads as
// "Medication" specifically, since that's what's actually being added
// everywhere this picker is used (treatment plans, worksheets, invoices).
export const ADD_ITEM_LABELS = { product: 'Medication', test: 'Test', service: 'Service' };

// Buckets catalog items by subcategory, ordered product -> test -> service
// then by subcategory name, for rendering as <optgroup>s so a long item
// list stays navigable instead of one flat alphabetical dump.
export function groupCatalogBySubcategory(catalog, subcategories) {
  const subcategoryById = new Map(subcategories.map((s) => [s.id, s]));
  const groups = new Map();

  for (const item of catalog) {
    const sub = subcategoryById.get(item.subcategory_id);
    const key = item.subcategory_id || 'uncategorized';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: sub ? `${MAIN_CATEGORY_LABELS[sub.main_category] || sub.main_category} · ${sub.name}` : 'Uncategorized',
        mainCategory: sub?.main_category,
        subcategoryName: sub?.name,
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }

  return [...groups.values()].sort((a, b) => {
    const orderA = MAIN_CATEGORIES.indexOf(a.mainCategory);
    const orderB = MAIN_CATEGORIES.indexOf(b.mainCategory);
    if (orderA !== orderB) return orderA - orderB;
    return (a.subcategoryName || '').localeCompare(b.subcategoryName || '');
  });
}

export function subcategoryName(subcategories, subcategoryId) {
  return subcategories.find((s) => s.id === subcategoryId)?.name || null;
}

// Buckets invoice line items by their catalog item's main category
// (product/test/service), in that fixed order, so an invoice reads as
// distinct sections rather than one flat list. Items whose catalog entry
// is missing (deleted since, or never linked) fall into a trailing "Other"
// bucket instead of being dropped.
export function groupLineItemsByCategory(lineItems) {
  const buckets = new Map();

  for (const item of lineItems) {
    const mainCategory = item.goods_services?.main_category || null;
    if (!buckets.has(mainCategory)) buckets.set(mainCategory, []);
    buckets.get(mainCategory).push(item);
  }

  const ordered = [...MAIN_CATEGORIES, null].filter((mc) => buckets.has(mc));
  return ordered.map((mc) => ({
    mainCategory: mc,
    label: mc ? `${MAIN_CATEGORY_LABELS[mc]}s` : 'Other',
    items: buckets.get(mc),
  }));
}
