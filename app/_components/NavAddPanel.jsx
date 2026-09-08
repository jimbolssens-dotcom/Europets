// app/_components/NavAddPanel.jsx
// Nav "Add" dropdown — Add Client and Add Patient side by side, reachable
// from any page. Same fields and behavior as the full forms on the
// Clients/Patients pages (multi-phone editor, Emirates ID scan, duplicate
// detection for the client; owner/species/breed/color/... for the
// patient) — those pages are unchanged and still have their own copies
// for when a vet is already there. The one deliberate difference: adding
// a client here doesn't navigate away (the Clients page does, to
// /patients?client_id=X, since a client is almost always added alongside
// their first pet) — instead it pre-fills the Add Patient column's owner
// with the client just created, so that first pet can still be added in
// one flow without leaving whatever page the panel was opened from.

'use client';

import { useState } from 'react';
import { uploadAttachment } from '@/lib/attachments';
import { phoneSearchDigits } from '@/lib/phoneMatch';
import ScanIdButton from '@/app/_components/ScanIdButton';
import ClientPhonesEditor, { emptyPhoneRow } from '@/app/_components/ClientPhonesEditor';
import InfoHint from '@/app/_components/InfoHint';
import SpeciesField from '@/app/_components/SpeciesField';
import PetAttributeField from '@/app/_components/PetAttributeField';
import SingleTypeSearch from '@/app/_components/SingleTypeSearch';
import { EMIRATES } from '@/lib/emirates';
import { CAT_BREEDS, DOG_BREEDS, CAT_COLORS, DOG_COLORS } from '@/lib/petAttributes';

const emptyClientForm = {
  full_name: '',
  phones: [emptyPhoneRow(true)],
  emirates_id: '',
  trn: '',
  email: '',
  address: '',
  emirate: '',
};

const emptyPatientForm = {
  name: '',
  species: '',
  breed: '',
  color: '',
  date_of_birth: '',
  sex: '',
  current_weight_kg: '',
  microchip_number: '',
  microchip_implanted_at: '',
  last_vaccination_date: '',
};

export default function NavAddPanel() {
  // --- Add Client ---
  const [clientForm, setClientForm] = useState(emptyClientForm);
  const [idScanFile, setIdScanFile] = useState(null);
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientCheckingDuplicates, setClientCheckingDuplicates] = useState(false);
  const [clientPossibleDuplicates, setClientPossibleDuplicates] = useState(null);
  const [clientError, setClientError] = useState(null);
  const [clientCreated, setClientCreated] = useState(null);

  // --- Add Patient ---
  const [owner, setOwner] = useState(null);
  const [patientForm, setPatientForm] = useState(emptyPatientForm);
  const [patientSubmitting, setPatientSubmitting] = useState(false);
  const [patientError, setPatientError] = useState(null);
  const [patientCreated, setPatientCreated] = useState(null);

  function updateClientForm(patch) {
    setClientForm((prev) => ({ ...prev, ...patch }));
    setClientPossibleDuplicates(null);
  }

  // Same cross-reference as the Clients page: phone (any number on the
  // form, not just the WhatsApp one), Emirates ID, and name — a match on
  // any of these is a strong sign this "new" client already exists.
  async function findPossibleDuplicates() {
    const allDigits = [...new Set(clientForm.phones.map((p) => phoneSearchDigits(p.phone)).filter(Boolean))];
    const emiratesId = clientForm.emirates_id.trim();
    const name = clientForm.full_name.trim();

    const requests = [];
    for (const digits of allDigits) {
      requests.push(fetch(`/api/clients?phone=${digits}`).then((res) => res.json()));
    }
    if (emiratesId) requests.push(fetch(`/api/clients?emirates_id=${encodeURIComponent(emiratesId)}`).then((res) => res.json()));
    if (name) requests.push(fetch(`/api/clients?name=${encodeURIComponent(name)}`).then((res) => res.json()));
    if (requests.length === 0) return [];

    const results = await Promise.all(requests);
    const byId = new Map();
    for (const list of results) {
      for (const c of Array.isArray(list) ? list : []) byId.set(c.id, c);
    }
    return [...byId.values()];
  }

  async function handleClientSubmit(e) {
    e.preventDefault();
    setClientError(null);

    if (!clientPossibleDuplicates) {
      setClientCheckingDuplicates(true);
      const matches = await findPossibleDuplicates();
      setClientCheckingDuplicates(false);
      if (matches.length > 0) {
        setClientPossibleDuplicates(matches);
        return;
      }
    }

    await createClient();
  }

  async function createClient() {
    setClientSubmitting(true);
    setClientError(null);

    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientForm),
    });
    const data = await res.json();
    setClientSubmitting(false);

    if (!res.ok) {
      setClientError(data.error || 'Failed to add client');
      return;
    }

    if (idScanFile) {
      uploadAttachment({ entityType: 'client', entityId: data.id, file: idScanFile }).catch(() => {});
    }

    setClientCreated(data);
    setClientForm(emptyClientForm);
    setIdScanFile(null);
    setClientPossibleDuplicates(null);
    // A client is almost always added alongside their first pet — pick
    // them as the Add Patient owner so that pet can go straight in too,
    // without leaving this panel or retyping the owner search.
    setOwner(data);
  }

  function handleClientScanned({ full_name, emirates_id, file }) {
    setClientForm((prev) => ({
      ...prev,
      full_name: full_name || prev.full_name,
      emirates_id: emirates_id || prev.emirates_id,
    }));
    setIdScanFile(file);
  }

  async function handlePatientSubmit(e) {
    e.preventDefault();
    if (!owner) {
      setPatientError('Search for and pick the owner first');
      return;
    }
    setPatientSubmitting(true);
    setPatientError(null);

    const payload = {
      client_id: owner.id,
      ...patientForm,
      current_weight_kg: patientForm.current_weight_kg ? Number(patientForm.current_weight_kg) : null,
      date_of_birth: patientForm.date_of_birth || null,
      microchip_number: patientForm.microchip_number || null,
      microchip_implanted_at: patientForm.microchip_implanted_at || null,
      last_vaccination_date: patientForm.last_vaccination_date || null,
    };

    const res = await fetch('/api/patients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setPatientSubmitting(false);

    if (!res.ok) {
      setPatientError(data.error || 'Failed to add patient');
      return;
    }

    setPatientCreated(data);
    // Keeps the owner selected — the same client often has more than one
    // pet to add in a row.
    setPatientForm(emptyPatientForm);
  }

  return (
    <div className="nav-panel">
      <div className="nav-panel-cols">
        <div className="nav-panel-col">
          <h3>Add Client</h3>
          <form className="nav-add-form" onSubmit={handleClientSubmit}>
            {clientError && <p className="error">{clientError}</p>}
            {clientCreated && (
              <p className="nav-add-success">
                Added <a href={`/clients/${clientCreated.id}`}>{clientCreated.full_name}</a>.
              </p>
            )}
            <ScanIdButton onScanned={handleClientScanned} label="Scan Emirates ID" />
            <InfoHint>Scans the card and fills in name + Emirates ID below.</InfoHint>
            {idScanFile && <p className="visit-meta">Photo ready — will attach once the client is saved.</p>}
            <input
              placeholder="Full name"
              required
              value={clientForm.full_name}
              onChange={(e) => updateClientForm({ full_name: e.target.value })}
            />
            <input
              placeholder="Emirates ID"
              value={clientForm.emirates_id}
              onChange={(e) => updateClientForm({ emirates_id: e.target.value })}
            />
            <input
              placeholder="TRN (only if a VAT-registered business)"
              value={clientForm.trn}
              onChange={(e) => updateClientForm({ trn: e.target.value })}
            />
            <ClientPhonesEditor
              phones={clientForm.phones}
              onChange={(phones) => updateClientForm({ phones })}
              groupName="nav-add-new"
            />
            <input
              placeholder="Email"
              type="email"
              value={clientForm.email}
              onChange={(e) => updateClientForm({ email: e.target.value })}
            />
            <input
              placeholder="Address"
              value={clientForm.address}
              onChange={(e) => updateClientForm({ address: e.target.value })}
            />
            <select value={clientForm.emirate} onChange={(e) => updateClientForm({ emirate: e.target.value })}>
              <option value="">Emirate...</option>
              {EMIRATES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>

            {clientPossibleDuplicates?.length > 0 && (
              <div className="possible-duplicate-warning">
                <p>⚠️ This might already be a client — matched by phone, Emirates ID, or name:</p>
                <ul>
                  {clientPossibleDuplicates.map((c) => (
                    <li key={c.id}>
                      <a href={`/clients/${c.id}`} target="_blank" rel="noreferrer">
                        {c.full_name}
                      </a>{' '}
                      · {c.phone || 'no phone'}
                      {c.emirates_id && ` · ID ${c.emirates_id}`}
                      {c.email && ` · ${c.email}`}
                      <button type="button" onClick={() => setOwner(c)}>
                        Use this client instead
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button type="submit" disabled={clientSubmitting || clientCheckingDuplicates}>
              {clientCheckingDuplicates
                ? 'Checking for duplicates...'
                : clientSubmitting
                  ? 'Saving...'
                  : clientPossibleDuplicates?.length > 0
                    ? 'Create as New Client Anyway'
                    : 'Add Client'}
            </button>
          </form>
        </div>

        <div className="nav-panel-col">
          <h3>Add Patient</h3>
          <form className="nav-add-form" onSubmit={handlePatientSubmit}>
            {patientError && <p className="error">{patientError}</p>}
            {patientCreated && (
              <p className="nav-add-success">
                Added <a href={`/patients/${patientCreated.id}`}>{patientCreated.name}</a>.
              </p>
            )}
            {owner ? (
              <p className="nav-owner-picked">
                Owner: <strong>{owner.full_name}</strong>{' '}
                <button type="button" onClick={() => setOwner(null)}>
                  Change
                </button>
              </p>
            ) : (
              <SingleTypeSearch type="client" placeholder="Search for the owner..." onPick={setOwner} />
            )}
            <input
              placeholder="Patient name"
              required
              value={patientForm.name}
              onChange={(e) => setPatientForm({ ...patientForm, name: e.target.value })}
            />
            <SpeciesField value={patientForm.species} onChange={(species) => setPatientForm({ ...patientForm, species })} />
            <PetAttributeField
              species={patientForm.species}
              value={patientForm.breed}
              onChange={(breed) => setPatientForm({ ...patientForm, breed })}
              catOptions={CAT_BREEDS}
              dogOptions={DOG_BREEDS}
              placeholder="Breed"
            />
            <PetAttributeField
              species={patientForm.species}
              value={patientForm.color}
              onChange={(color) => setPatientForm({ ...patientForm, color })}
              catOptions={CAT_COLORS}
              dogOptions={DOG_COLORS}
              placeholder="Color"
            />
            <input
              type="date"
              value={patientForm.date_of_birth}
              onChange={(e) => setPatientForm({ ...patientForm, date_of_birth: e.target.value })}
            />
            <select
              value={patientForm.sex}
              onChange={(e) => setPatientForm({ ...patientForm, sex: e.target.value })}
              required
            >
              <option value="" disabled>
                Sex...
              </option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="male_castrated">Male (Castrated)</option>
              <option value="female_spayed">Female (Spayed)</option>
              <option value="unknown">Unknown</option>
            </select>
            <input
              placeholder="Weight (kg)"
              type="number"
              step="0.01"
              value={patientForm.current_weight_kg}
              onChange={(e) => setPatientForm({ ...patientForm, current_weight_kg: e.target.value })}
            />
            <input
              placeholder="Microchip number (optional)"
              value={patientForm.microchip_number}
              onChange={(e) => setPatientForm({ ...patientForm, microchip_number: e.target.value })}
            />
            <label className="nav-add-date-field">
              Microchip implanted
              <input
                type="date"
                value={patientForm.microchip_implanted_at}
                onChange={(e) => setPatientForm({ ...patientForm, microchip_implanted_at: e.target.value })}
              />
            </label>
            <label className="nav-add-date-field">
              Last vaccination given
              <input
                type="date"
                value={patientForm.last_vaccination_date}
                onChange={(e) => setPatientForm({ ...patientForm, last_vaccination_date: e.target.value })}
              />
            </label>
            <button type="submit" disabled={patientSubmitting}>
              {patientSubmitting ? 'Saving...' : 'Add Patient'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
