// app/catalog/page.jsx
// Goods & services catalog: list + create form, with an active/inactive
// toggle so retired items stay out of new invoices without deleting history.

'use client';

import { useEffect, useState } from 'react';

const emptyForm = { name: '', category: 'service', pricing_type: 'flat', base_price: '', unit: '' };

export default function CatalogPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const loadItems = () =>
    fetch('/api/goods-services')
      .then((res) => res.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      });

  useEffect(() => {
    loadItems();
  }, []);

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

  if (loading) return <p>Loading catalog...</p>;

  return (
    <div>
      <h1>Goods & Services</h1>
      <div className="split">
      <div className="split-main">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Pricing</th>
            <th>Price</th>
            <th>Unit</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{item.category}</td>
              <td>{item.pricing_type}</td>
              <td>{Number(item.base_price).toFixed(2)}</td>
              <td>{item.unit}</td>
              <td>{item.active ? 'active' : 'inactive'}</td>
              <td>
                <button type="button" onClick={() => toggleActive(item)}>
                  {item.active ? 'Deactivate' : 'Activate'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="split-aside">
      <form className="card" onSubmit={handleSubmit}>
        <h2>Add Item</h2>
        {error && <p className="error">{error}</p>}
        <input
          placeholder="Name"
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        >
          <option value="medication">Medication</option>
          <option value="food">Food</option>
          <option value="toy">Toy</option>
          <option value="product">Product (other)</option>
          <option value="service">Service</option>
          <option value="procedure">Procedure</option>
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
          {submitting ? 'Saving...' : 'Add Item'}
        </button>
      </form>
      </div>
      </div>
    </div>
  );
}
