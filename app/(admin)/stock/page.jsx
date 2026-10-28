'use client';

// app/(admin)/stock/page.jsx
// Stock keeping, phase 1 (migration 229): the vaccines, snap and PCR tests,
// fluorescein and urine strips. Each item counts down by itself when it's
// charged or a dose is given; here staff log a delivery (+ In), count the
// shelf (Count), set the reorder level and see what moved. A low item goes
// to the Stock team group (app/api/stock/low-sweep). + Add starts tracking
// any catalog item; Remove stops tracking one (its history is kept).

import { useEffect, useState } from 'react';
import CatalogPicker from '@/app/_components/CatalogPicker';
import { loadReferenceList } from '@/lib/viewCache';

const STAFF_KEYS = ['stock_staff_id', 'team_staff_id', 'europets_mobile_staff_id', 'pay_link_staff_id', 'social_staff_id'];

function savedStaffId() {
  try {
    for (const k of STAFF_KEYS) {
      const v = localStorage.getItem(k);
      if (v) return v;
    }
  } catch {}
  return '';
}

const fmt = (n) => String(Math.round(Number(n) * 100) / 100);
const day = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const KIND_LABEL = { received: 'In', used: 'Used', count: 'Count', adjust: 'Adjusted' };

function History({ itemId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    fetch(`/api/stock/${itemId}/movements`)
      .then((res) => res.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]));
  }, [itemId]);
  if (!rows) return <p className="visit-meta">Loading...</p>;
  if (!rows.length) return <p className="visit-meta">Nothing yet.</p>;
  return (
    <ul className="stock-history">
      {rows.map((m) => (
        <li key={m.id}>
          <span className={m.change < 0 ? 'stock-out' : 'stock-in'}>{m.change > 0 ? `+${fmt(m.change)}` : fmt(m.change)}</span>{' '}
          {KIND_LABEL[m.kind] || m.kind} · {day(m.created_at)}
          {m.pet ? ` · ${m.pet}` : ''}
          {m.supplier ? ` · ${m.supplier}` : ''}
          {m.batch_number ? ` · batch ${m.batch_number}` : ''}
          {m.expiry_date ? ` · exp ${day(m.expiry_date)}` : ''}
          {m.staff?.full_name ? ` · ${m.staff.full_name}` : ''}
          {m.note ? ` · ${m.note}` : ''}
        </li>
      ))}
    </ul>
  );
}

function Item({ item, staffId, onChanged }) {
  const [open, setOpen] = useState(null); // 'in' | 'count' | 'history' | 'level'
  const [qty, setQty] = useState('');
  const [supplier, setSupplier] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [level, setLevel] = useState(String(item.reorder_level));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const toggle = (what) => {
    setError(null);
    setOpen(open === what ? null : what);
  };

  async function save(body) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/stock/${item.id}/movements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, staff_id: staffId || null }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not save');
    setQty('');
    setSupplier('');
    setBatch('');
    setExpiry('');
    setOpen(null);
    onChanged();
  }

  async function saveLevel() {
    setBusy(true);
    const res = await fetch(`/api/stock/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reorder_level: level }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not save');
    setOpen(null);
    onChanged();
  }

  async function remove() {
    if (!confirm(`Stop tracking ${item.name}? It leaves this list and stops counting down. Its history is kept if you add it again.`)) return;
    setBusy(true);
    const res = await fetch(`/api/stock/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not remove it');
    onChanged();
  }

  const status = !item.started ? (
    <span className="stock-chip stock-chip-new">To count</span>
  ) : item.low ? (
    <span className="stock-chip stock-chip-low">{item.on_hand <= 0 ? 'Out' : 'Low'}</span>
  ) : null;

  return (
    <div className={`stock-item${item.low ? ' stock-item-low' : ''}`}>
      <div className="stock-item-row">
        <strong className="stock-name" title={item.name}>
          {item.name}
        </strong>
        {item.started && <span className="stock-on-hand">{fmt(item.on_hand)}</span>}
        {status}
        <span className="stock-actions">
          <button type="button" className="secondary" onClick={() => toggle('in')}>
            + In
          </button>
          <button type="button" className="secondary" onClick={() => toggle('count')}>
            Count
          </button>
        </span>
      </div>
      <div className="stock-meta">
        <button type="button" className="social-link-button" onClick={() => toggle('level')}>
          reorder at {fmt(item.reorder_level)} ✎
        </button>
        {item.last_counted_at && <span> · counted {day(item.last_counted_at)}</span>}
        {/* Only when it says more than the item's own name. */}
        {!(item.used_by.length === 1 && item.used_by[0] === item.name) && <span> · used by {item.used_by.join(', ') || 'nothing linked'}</span>}
        {' · '}
        <button type="button" className="social-link-button" onClick={() => toggle('history')}>
          {open === 'history' ? 'Hide history' : 'History'}
        </button>
        {' · '}
        <button type="button" className="social-link-button stock-remove" onClick={remove} disabled={busy}>
          Remove
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {open === 'in' && (
        <form
          className="stock-form"
          onSubmit={(e) => {
            e.preventDefault();
            save({ kind: 'received', quantity: qty, supplier, batch_number: batch, expiry_date: expiry });
          }}
        >
          <input type="number" min="1" step="1" inputMode="numeric" placeholder="How many" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <input placeholder="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <input placeholder="Batch" value={batch} onChange={(e) => setBatch(e.target.value)} />
          <label className="stock-expiry">
            Exp <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </form>
      )}
      {open === 'count' && (
        <form
          className="stock-form"
          onSubmit={(e) => {
            e.preventDefault();
            save({ kind: 'count', counted: qty });
          }}
        >
          <input type="number" min="0" step="1" inputMode="numeric" placeholder="On the shelf now" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <button type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Save count'}
          </button>
        </form>
      )}
      {open === 'level' && (
        <form
          className="stock-form"
          onSubmit={(e) => {
            e.preventDefault();
            saveLevel();
          }}
        >
          <input type="number" min="0" step="1" inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} required aria-label="Reorder level" />
          <button type="submit" disabled={busy}>
            {busy ? 'Saving...' : 'Save level'}
          </button>
        </form>
      )}
      {open === 'history' && <History itemId={item.id} />}
    </div>
  );
}

function AddItem({ onAdded, onClose }) {
  const [catalog, setCatalog] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [goodsServiceId, setGoodsServiceId] = useState('');
  const [level, setLevel] = useState('2');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadReferenceList('/api/goods-services?active=true', setCatalog);
    loadReferenceList('/api/catalog-subcategories', setSubcategories);
  }, []);

  async function add(e) {
    e.preventDefault();
    if (!goodsServiceId) return setError('Pick a catalog item');
    setBusy(true);
    setError(null);
    const res = await fetch('/api/stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goods_service_id: goodsServiceId, reorder_level: level }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error || 'Could not add it');
    onAdded();
  }

  return (
    <form className="card stock-add" onSubmit={add}>
      <div className="page-header">
        <h3>Add to stock</h3>
        <div className="page-header-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <CatalogPicker
        catalog={catalog}
        subcategories={subcategories}
        value={goodsServiceId}
        onChange={setGoodsServiceId}
        onItemCreated={(item) => setCatalog((prev) => [...prev, item])}
      />
      <div className="stock-form">
        <label className="stock-expiry">
          Reorder at <input type="number" min="0" step="1" inputMode="numeric" value={level} onChange={(e) => setLevel(e.target.value)} />
        </label>
        <button type="submit" disabled={busy || !goodsServiceId}>
          {busy ? 'Adding...' : '+ Add'}
        </button>
      </div>
      <p className="visit-meta">It counts down by one each time it's charged. Press Count on it once to set what's on the shelf.</p>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export default function StockPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [staff, setStaff] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [adding, setAdding] = useState(false);

  const load = () =>
    fetch('/api/stock')
      .then((res) => res.json())
      .then((d) => (Array.isArray(d) ? setItems(d) : setError(d.error || 'Could not load the stock')))
      .catch(() => setError('Could not load the stock'));

  useEffect(() => {
    load();
    setStaffId(savedStaffId());
    fetch('/api/staff')
      .then((res) => res.json())
      .then((d) => setStaff(Array.isArray(d) ? d.filter((s) => s.active !== false) : []))
      .catch(() => {});
  }, []);

  function pickStaff(id) {
    setStaffId(id);
    try {
      localStorage.setItem('stock_staff_id', id);
    } catch {}
  }

  const low = (items || []).filter((i) => i.low).length;
  const notCounted = (items || []).filter((i) => !i.started).length;

  return (
    <div>
      <div className="page-header">
        <h1>📦 Stock</h1>
        <div className="page-header-actions">
          {low > 0 && <span className="stock-chip stock-chip-low">{low} low</span>}
          <button type="button" onClick={() => setAdding((v) => !v)}>
            + Add
          </button>
          <select value={staffId} onChange={(e) => pickStaff(e.target.value)} aria-label="Who is logging">
            <option value="">Who are you?</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {notCounted > 0 && (
        <p className="visit-meta">
          {notCounted} to count: press Count and type what&apos;s on the shelf. After that each one counts down by itself.
        </p>
      )}
      {adding && (
        <AddItem
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {error && <p className="error">{error}</p>}
      {!items && !error && <p className="visit-meta">Loading...</p>}
      <div className="stock-list">
        {(items || []).map((item) => (
          <Item key={item.id} item={item} staffId={staffId} onChanged={load} />
        ))}
      </div>
    </div>
  );
}
