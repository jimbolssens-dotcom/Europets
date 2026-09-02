// app/_components/CatalogPicker.jsx
// A catalog item <select>, grouped by subcategory, with the Product/Test/
// Service tab filter (or none, if fixedMainCategory pins it to one) and an
// inline "+ Add New" mini-form for when the item staff want isn't in the
// catalog yet — used everywhere a catalog item gets picked (consult
// treatment plan, consult diagnostics, hospitalization worksheet entries,
// invoice line items) so a missing item is a few seconds away, not a trip
// to the Catalog page and back.

'use client';

import { useState } from 'react';
import { MAIN_CATEGORIES, MAIN_CATEGORY_LABELS, groupCatalogBySubcategory } from '@/lib/catalogGrouping';

const emptyNewItem = { name: '', subcategory_id: '', pricing_type: 'flat', base_price: '', unit: '' };

export default function CatalogPicker({
  catalog,
  subcategories,
  value,
  onChange,
  onItemCreated,
  fixedMainCategory = null,
}) {
  const [activeCategory, setActiveCategory] = useState(fixedMainCategory || 'product');
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState(emptyNewItem);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const activeSubcategories = subcategories.filter((s) => s.main_category === activeCategory && s.active);
  const groups = groupCatalogBySubcategory(
    catalog.filter((c) => c.main_category === activeCategory),
    subcategories
  );

  function selectCategory(mc) {
    setActiveCategory(mc);
    onChange('');
    setAdding(false);
    setCreateError(null);
  }

  function startAdding() {
    setAdding(true);
    setCreateError(null);
    setNewItem({ ...emptyNewItem, subcategory_id: activeSubcategories[0]?.id || '' });
  }

  async function createItem() {
    if (!newItem.name.trim() || !newItem.subcategory_id || newItem.base_price === '') {
      setCreateError('Name, subcategory, and price are required');
      return;
    }
    setCreating(true);
    setCreateError(null);

    const res = await fetch('/api/goods-services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newItem, base_price: Number(newItem.base_price) }),
    });
    const data = await res.json();
    setCreating(false);

    if (!res.ok) {
      setCreateError(data.error || 'Failed to add catalog item');
      return;
    }
    onItemCreated?.(data);
    onChange(data.id);
    setAdding(false);
    setNewItem(emptyNewItem);
  }

  return (
    <div className="catalog-picker">
      {!fixedMainCategory && (
        <div className="catalog-tabs catalog-tabs-compact">
          {MAIN_CATEGORIES.map((mc) => (
            <button
              key={mc}
              type="button"
              className={mc === activeCategory ? 'catalog-tab active' : 'catalog-tab'}
              onClick={() => selectCategory(mc)}
            >
              {MAIN_CATEGORY_LABELS[mc]}s
            </button>
          ))}
        </div>
      )}

      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select from catalog...</option>
        {groups.map((group) => (
          <optgroup key={group.key} label={group.subcategoryName || group.label}>
            {group.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      {!adding ? (
        <button type="button" className="secondary catalog-picker-add-toggle" onClick={startAdding}>
          + Add New {MAIN_CATEGORY_LABELS[activeCategory]}
        </button>
      ) : (
        <div className="catalog-picker-inline-add">
          {createError && <p className="error">{createError}</p>}
          <input
            placeholder="Name"
            value={newItem.name}
            onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
          />
          <select
            value={newItem.subcategory_id}
            onChange={(e) => setNewItem({ ...newItem, subcategory_id: e.target.value })}
          >
            <option value="">Subcategory...</option>
            {activeSubcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={newItem.pricing_type}
            onChange={(e) => setNewItem({ ...newItem, pricing_type: e.target.value })}
          >
            <option value="flat">Flat</option>
            <option value="per_kg">Per kg</option>
            <option value="per_unit">Per unit</option>
          </select>
          <input
            type="number"
            step="0.01"
            placeholder="Price"
            value={newItem.base_price}
            onChange={(e) => setNewItem({ ...newItem, base_price: e.target.value })}
          />
          <input
            placeholder="Unit (optional)"
            value={newItem.unit}
            onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
          />
          <button type="button" onClick={createItem} disabled={creating}>
            {creating ? 'Adding...' : 'Save & Select'}
          </button>
          <button type="button" className="secondary" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
