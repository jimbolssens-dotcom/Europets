// app/(admin)/policies/page.jsx
// Staff-only Policies & Procedures manual: categories (Client Reception,
// Vaccination Protocols, ...) each holding one or more written policies.
// Meant to be built up over time and used for onboarding new staff — the
// left column is a table of contents, the right column shows/edits
// whichever policy is selected.

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function PoliciesPage() {
  const [categories, setCategories] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: '', content: '' });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCategoryId, setRenamingCategoryId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [addingPolicyTo, setAddingPolicyTo] = useState(null);
  const [newPolicyTitle, setNewPolicyTitle] = useState('');
  const [error, setError] = useState(null);

  const load = () =>
    Promise.all([
      fetch('/api/policy-categories').then((res) => res.json()),
      fetch('/api/policies').then((res) => res.json()),
    ]).then(([cats, pols]) => {
      setCategories(Array.isArray(cats) ? cats : []);
      setPolicies(Array.isArray(pols) ? pols : []);
      setLoading(false);
    });

  useEffect(() => {
    load();
    const channel = supabase
      .channel('policies-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'policy_categories' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'policies' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const selected = policies.find((p) => p.id === selectedId) || null;

  function selectPolicy(policy) {
    setSelectedId(policy.id);
    setEditing(false);
    setError(null);
  }

  function startEdit() {
    setEditForm({ title: selected.title, content: selected.content || '' });
    setEditing(true);
    setError(null);
  }

  async function saveEdit() {
    setError(null);
    const res = await fetch(`/api/policies/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to save');
      return;
    }
    setEditing(false);
    load();
  }

  async function deletePolicy(id) {
    if (!confirm('Delete this policy? This cannot be undone.')) return;
    await fetch(`/api/policies/${id}`, { method: 'DELETE' });
    if (selectedId === id) setSelectedId(null);
    load();
  }

  async function addCategory(e) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    await fetch('/api/policy-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategoryName.trim(), sort_order: categories.length + 1 }),
    });
    setNewCategoryName('');
    load();
  }

  function startRenameCategory(cat) {
    setRenamingCategoryId(cat.id);
    setRenameValue(cat.name);
  }

  async function saveRenameCategory(id) {
    if (!renameValue.trim()) return;
    await fetch(`/api/policy-categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    setRenamingCategoryId(null);
    load();
  }

  async function deleteCategory(cat) {
    const policyCount = policies.filter((p) => p.category_id === cat.id).length;
    const warning =
      policyCount > 0
        ? `Delete "${cat.name}" and its ${policyCount} polic${policyCount === 1 ? 'y' : 'ies'}? This cannot be undone.`
        : `Delete "${cat.name}"?`;
    if (!confirm(warning)) return;
    await fetch(`/api/policy-categories/${cat.id}`, { method: 'DELETE' });
    load();
  }

  async function addPolicy(categoryId) {
    if (!newPolicyTitle.trim()) return;
    const count = policies.filter((p) => p.category_id === categoryId).length;
    const res = await fetch('/api/policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId, title: newPolicyTitle.trim(), sort_order: count + 1 }),
    });
    const data = await res.json();
    setNewPolicyTitle('');
    setAddingPolicyTo(null);
    await load();
    if (data?.id) {
      setSelectedId(data.id);
      setEditForm({ title: data.title, content: '' });
      setEditing(true);
    }
  }

  if (loading) return <p>Loading policies...</p>;

  return (
    <div>
      <h1>Policies & Procedures</h1>
      <p className="page-subtitle">
        The clinic's staff reference manual — onboarding, protocols, and standards, organized by
        topic.
      </p>

      <div className="policies-layout">
        <div className="policies-toc">
          {categories.map((cat) => (
            <div className="policies-category" key={cat.id}>
              <div className="policies-category-header">
                {renamingCategoryId === cat.id ? (
                  <>
                    <input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                    />
                    <button type="button" onClick={() => saveRenameCategory(cat.id)}>
                      Save
                    </button>
                    <button type="button" onClick={() => setRenamingCategoryId(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <strong>{cat.name}</strong>
                    <span className="policies-category-actions">
                      <button type="button" onClick={() => startRenameCategory(cat)}>
                        Rename
                      </button>
                      <button type="button" onClick={() => deleteCategory(cat)}>
                        Delete
                      </button>
                    </span>
                  </>
                )}
              </div>

              <ul className="policies-list">
                {policies
                  .filter((p) => p.category_id === cat.id)
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={`policies-list-item ${selectedId === p.id ? 'active' : ''}`}
                        onClick={() => selectPolicy(p)}
                      >
                        {p.title}
                      </button>
                    </li>
                  ))}
              </ul>

              {addingPolicyTo === cat.id ? (
                <div className="policies-add-form">
                  <input
                    placeholder="New policy title"
                    value={newPolicyTitle}
                    onChange={(e) => setNewPolicyTitle(e.target.value)}
                    autoFocus
                  />
                  <button type="button" onClick={() => addPolicy(cat.id)}>
                    Add
                  </button>
                  <button type="button" onClick={() => setAddingPolicyTo(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="policies-add-link"
                  onClick={() => {
                    setAddingPolicyTo(cat.id);
                    setNewPolicyTitle('');
                  }}
                >
                  + Add policy
                </button>
              )}
            </div>
          ))}

          <form className="policies-add-form" onSubmit={addCategory}>
            <input
              placeholder="New category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
            />
            <button type="submit">Add category</button>
          </form>
        </div>

        <div className="policies-detail">
          {!selected ? (
            <p className="policies-empty">Select a policy from the left, or add one to a category.</p>
          ) : editing ? (
            <div>
              <input
                className="policies-title-input"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
              <textarea
                className="policies-content-input"
                rows={20}
                value={editForm.content}
                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
              />
              {error && <p className="error">{error}</p>}
              <div className="policies-detail-actions">
                <button type="button" onClick={saveEdit}>
                  Save
                </button>
                <button type="button" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="policies-detail-header">
                <h2>{selected.title}</h2>
                <div className="policies-detail-actions">
                  <button type="button" onClick={startEdit}>
                    Edit
                  </button>
                  <button type="button" onClick={() => deletePolicy(selected.id)}>
                    Delete
                  </button>
                </div>
              </div>
              <p className="policies-updated">
                Last updated {new Date(selected.updated_at).toLocaleString()}
              </p>
              <div className="policies-content-box">{selected.content || '(No content yet.)'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
