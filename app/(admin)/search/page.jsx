// app/search/page.jsx
// Full search results for a query from the nav SearchBox — clients and
// patients matched on name, phone, breed, or microchip number.

'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function SearchResults() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const [results, setResults] = useState({ clients: [], patients: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults({ clients: [], patients: [] });
      return;
    }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        setResults({ clients: data.clients || [], patients: data.patients || [] });
        setLoading(false);
      });
  }, [q]);

  return (
    <div>
      <h1>Search Results</h1>
      <p className="visit-meta">
        {q ? (
          <>
            Showing results for &quot;{q}&quot;
          </>
        ) : (
          'Enter a search term in the box above.'
        )}
      </p>
      {loading && <p>Searching...</p>}

      {!loading && q && (
        <>
          <h2>Clients ({results.clients.length})</h2>
          {results.clients.length === 0 ? (
            <p>No matching clients.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client #</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {results.clients.map((c) => (
                  <tr key={c.id}>
                    <td>{c.client_number}</td>
                    <td>
                      <a href={`/clients/${c.id}`}>{c.full_name}</a>
                    </td>
                    <td>{c.phone}</td>
                    <td>{c.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Patients ({results.patients.length})</h2>
          {results.patients.length === 0 ? (
            <p>No matching patients.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Patient #</th>
                  <th>Name</th>
                  <th>Species</th>
                  <th>Breed</th>
                  <th>Microchip</th>
                  <th>Owner</th>
                </tr>
              </thead>
              <tbody>
                {results.patients.map((p) => (
                  <tr key={p.id}>
                    <td>{p.patient_number}</td>
                    <td>
                      <a
                        href={`/patients/${p.id}`}
                        style={p.deceased ? { textDecoration: 'line-through' } : undefined}
                      >
                        {p.name}
                      </a>
                    </td>
                    <td>{p.species}</td>
                    <td>{p.breed}</td>
                    <td>{p.microchip_number}</td>
                    <td>
                      <a href={`/clients/${p.clients?.id}`}>{p.clients?.full_name}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <SearchResults />
    </Suspense>
  );
}
