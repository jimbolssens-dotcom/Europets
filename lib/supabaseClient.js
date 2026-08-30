// lib/supabaseClient.js
// Shared Supabase connection used by all API routes.
// Create a free Supabase project at supabase.com, run schema.sql
// in its SQL editor, then drop your project URL + anon key into .env.local:
//
//   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

import { createClient } from '@supabase/supabase-js';

// Fall back to placeholder values so `next build`/`next dev` don't crash
// before .env.local is set up. Any real request will simply fail against
// the placeholder host until real credentials are provided.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseKey);
