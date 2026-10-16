// app/search/page.jsx
// Search now lives under the Clients tab (app/(admin)/clients/page.jsx).
// Old links and bookmarks to /search (and /search?q=...) land there.

import { redirect } from 'next/navigation';

export default function SearchRedirect({ searchParams }) {
  const q = searchParams?.q;
  redirect(q ? `/clients?q=${encodeURIComponent(q)}` : '/clients');
}
