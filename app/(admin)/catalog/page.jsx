// app/catalog/page.jsx
// Goods & services catalog, split into the clinic's three fixed main
// categories — Products, Tests, Services — each with its own editable list
// of subcategories (e.g. Tests: X-Ray, Ultrasound, PCR, Blood Test - CBC,
// ...) that staff can keep extending as the clinic starts offering new
// ones. Click a row (or its Edit button) to edit an item's name/
// subcategory/pricing/price/unit in place.

'use client';

import { useEffect, useState } from 'react';
import { MAIN_CATEGORIES, MAIN_CATEGORY_LABELS } from '@/lib/catalogGrouping';

const emptyForm = { name: '', subcategory_id: '', pricing_type: 'flat', base_price: '', unit: '' };

export default function CatalogPage() {
  const [items, setItems] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('product');

  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  const [newSubcategoryName, setNewSubcategoryName] = useState('');
  const [subcategorySubmitting, setSubcategorySubmitting] = useState(false);
  const [subcategoryError, setSubcategoryError] = useState(null);
  const [editingSubcategoryId, setEditingSubcategoryId] = useState(null);
  const [editSubcategoryName, setEditSubcategoryName] = useState('');

  const loadItems = () =>
    fetch('/api/goods-services')
      .then((res) => res.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  const loadSubcategories = () =>
    fetch('/api/catalog-subcategories')
      .then((res) => res.json())
      .then((data) => setSubcategories(Array.isArray(data) ? data : []));

  useEffect(() => {
    loadItems();
    loadSubcategories();
  }, []);

  const tabItems = items.filter((item) => item.main_category === activeTab);
  const tabSubcategories = subcategories.filter((s) => s.main_category === activeTab);
  const tabActiveSubcategories = tabSubcategories.filter((s) => s.active);

  function subcategoryNameFor(item) {
    return subcategories.find((s) => s.id === item.subcategory_id)?.name || '—';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch('/api/goods-services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, base_price: Number(form.base_price) }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to create item');
    } else {
      setForm(emptyForm);
      loadItems();
    }
    setSubmitting(false);
  }

  async function toggleActive(item) {
    await fetch(`/api/goods-services/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !item.active }),
    });
    loadItems();
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      subcategory_id: item.subcategory_id || '',
      pricing_type: item.pricing_type,
      base_price: item.base_price,
      unit: item.unit || '',
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id) {
    setSavingEdit(true);
    setEditError(null);

    const res = await fetch(`/api/goods-services/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...editForm, base_price: Number(editForm.base_price) }),
    });
    const data = await res.json();

    if (!res.ok) {
      setEditError(data.error || 'Failed to save changes');
    } else {
      setEditingId(null);
      loadItems();
    }
    setSavingEdit(false);
  }

  async function addSubcategory(e) {
    e.preventDefault();
    if (!newSubcategoryName.trim()) return;
    setSubcategorySubmitting(true);
    setSubcategoryError(null);

    const res = await fetch('/api/catalog-subcategories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ main_category: activeTab, name: newSubcategoryName.trim() }),
    });
    const data = await res.json();

    if (!res.ok) {
      setSubcategoryError(data.error || 'Failed to add subcategory');
    } else {
      setNewSubcategoryName('');
      loadSubcategories();
    }
    setSubcategorySubmitting(false);
  }

  function startEditSubcategory(s) {
    setEditingSubcategoryId(s.id);
    setEditSubcategoryName(s.name);
    setSubcategoryError(null);
  }

  function cancelEditSubcategory() {
    setEditingSubcategoryId(null);
    setSubcategoryError(null);
  }

  async function saveSubcategoryEdit(id) {
    setSubcategoryError(null);
    const res = await fetch(`/api/catalog-subcategories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editSubcategoryName }),
    });
    const data = await res.json();

    if (!res.ok) {
      setSubcategoryError(data.error || 'Failed to rename subcategory');
    } else {
      setEditingSubcategoryId(null);
      loadSubcategories();
    }
  }

  async function toggleSubcategoryActive(s) {
    await fetch(`/api/catalog-subcategories/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !s.active }),
    });
    loadSubcategories();
  }

  async function deleteSubcategory(s) {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    setSubcategoryError(null);

    const res = await fetch(`/api/catalog-subcategories/${s.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setSubcategoryError(data.error || 'Failed to delete subcategory');
    } else {
      loadSubcategories();
    }
  }

  if (loading) return <p>Loading catalog...</p>;

  return (
    <div>
      <h1>Goods & Services</h1>

      <div className="catalog-tabs">
        {MAIN_CATEGORIES.map((mc) => (
          <button
            key={mc}
            type="button"
            className={mc === activeTab ? 'catalog-tab active' : 'catalog-tab'}
            onClick={() => setActiveTab(mc)}
          >
            {MAIN_CATEGORY_LABELS[mc]}s
          </button>
        ))}
      </div>

      <div className="split">
      <div className="split-main">
      <div className="catalog-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Subcategory</th>
            <th>Pricing</th>
            <th>Price</th>
            <th>Unit</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {tabItems.length === 0 && (
            <tr>
              <td colSpan={7}>No {MAIN_CATEGORY_LABELS[activeTab].toLowerCase()} items yet.</td>
            </tr>
          )}
          {tabItems.map((item) =>
            editingId === item.id ? (
              <tr key={item.id} className="catalog-row-editing">
                <td>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={editForm.subcategory_id}
                    onChange={(e) => setEditForm({ ...editForm, subcategory_id: e.target.value })}
                  >
                    <option value="">Select subcategory...</option>
                    {MAIN_CATEGORIES.map((mc) => (
                      <optgroup key={mc} label={MAIN_CATEGORY_LABELS[mc]}>
                        {subcategories
                          .filter((s) => s.main_category === mc && (s.active || s.id === editForm.subcategory_id))
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={editForm.pricing_type}
                    onChange={(e) => setEditForm({ ...editForm, pricing_type: e.target.value })}
                  >
                    <option value="flat">Flat</option>
                    <option value="per_kg">Per kg</option>
                    <option value="per_unit">Per unit</option>
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.base_price}
                    onChange={(e) => setEditForm({ ...editForm, base_price: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    placeholder="unit"
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                  />
                </td>
                <td>{item.active ? 'active' : 'inactive'}</td>
                <td>
                  <button type="button" onClick={() => saveEdit(item.id)} disabled={savingEdit}>
                    {savingEdit ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={cancelEdit} disabled={savingEdit}>
                    Cancel
                  </button>
                  {editError && <p className="error">{editError}</p>}
                </td>
              </tr>
            ) : (
              <tr key={item.id} className="catalog-row" onClick={() => startEdit(item)}>
                <td>{item.name}</td>
                <td>{subcategoryNameFor(item)}</td>
                <td>{item.pricing_type}</td>
                <td>{Number(item.base_price).toFixed(2)}</td>
                <td>{item.unit}</td>
                <td>{item.active ? 'active' : 'inactive'}</td>
                <td>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEdit(item);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleActive(item);
                    }}
                  >
                    {item.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      </div>
      </div>

      <div className="split-aside">
      <form className="card" onSubmit={handleSubmit}>
        <h2>Add {MAIN_CATEGORY_LABELS[activeTab]}</h2>
        {error && <p className="error">{error}</p>}
        <input
          placeholder="Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          required
          value={form.subcategory_id}
          onChange={(e) => setForm({ ...form, subcategory_id: e.target.value })}
        >
          <option value="">Select subcategory...</option>
          {tabActiveSubcategories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={form.pricing_type}
          onChange={(e) => setForm({ ...form, pricing_type: e.target.value })}
        >
          <option value="flat">Flat</option>
          <option value="per_kg">Per kg (bodyweight)</option>
          <option value="per_unit">Per unit</option>
        </select>
        <input
          placeholder="Base price"
          type="number"
          step="0.01"
          required
          value={form.base_price}
          onChange={(e) => setForm({ ...form, base_price: e.target.value })}
        />
        <input
          placeholder="Unit (e.g. mg, ml, kg) — optional"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : `Add ${MAIN_CATEGORY_LABELS[activeTab]}`}
        </button>
      </form>

      <div className="card">
        <h2>{MAIN_CATEGORY_LABELS[activeTab]} Subcategories</h2>
        <p className="visit-meta">
          Keep adding to this list as the clinic offers new {MAIN_CATEGORY_LABELS[activeTab].toLowerCase()}{' '}
          subdivisions — new ones show up immediately in Add {MAIN_CATEGORY_LABELS[activeTab]} above.
        </p>
        {subcategoryError && <p className="error">{subcategoryError}</p>}
        {tabSubcategories.length === 0 && <p>No subcategories yet.</p>}
        <ul className="subcategory-list">
          {tabSubcategories.map((s) =>
            editingSubcategoryId === s.id ? (
              <li key={s.id}>
                <input
                  value={editSubcategoryName}
                  onChange={(e) => setEditSubcategoryName(e.target.value)}
                />
                <button type="button" onClick={() => saveSubcategoryEdit(s.id)}>
                  Save
                </button>
                <button type="button" onClick={cancelEditSubcategory}>
                  Cancel
                </button>
              </li>
            ) : (
              <li key={s.id}>
                <span>
                  {s.name}
                  {!s.active && ' (inactive)'}
                </span>
                <button type="button" onClick={() => startEditSubcategory(s)}>
                  Edit
                </button>
                <button type="button" onClick={() => toggleSubcategoryActive(s)}>
                  {s.active ? 'Deactivate' : 'Activate'}
                </button>
                <button type="button" onClick={() => deleteSubcategory(s)}>
                  Delete
                </button>
              </li>
            )
          )}
        </ul>
        <form className="subcategory-add-form" onSubmit={addSubcategory}>
          <input
            placeholder={`New ${MAIN_CATEGORY_LABELS[activeTab].toLowerCase()} subcategory`}
            value={newSubcategoryName}
            onChange={(e) => setNewSubcategoryName(e.target.value)}
          />
          <button type="submit" className="secondary" disabled={subcategorySubmitting}>
            {subcategorySubmitting ? 'Adding...' : '+ Add'}
          </button>
        </form>
      </div>
      </div>
      </div>
    </div>
  );
}
