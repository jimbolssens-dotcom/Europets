// app/api/vaccinations/[id]/mark-primary/route.js
// POST /api/vaccinations/:id/mark-primary
//
// Marks this vaccination — and every other vaccine given to the same
// patient on the same date (the same visit) — as part of a primary
// (puppy/kitten) course. Schedules the species' core vaccine for a 1-month
// booster instead of the normal annual interval. If rabies WASN'T part of
// this visit, also creates a rabies reminder for that same 1-month date
// (not a real dose yet — date_given is left null); if rabies WAS given,
// its own row is untouched and just stays on its normal annual cycle.

import { supabase } from '@/lib/supabaseClient';
import { classifySpecies } from '@/lib/species';
import { NextResponse } from 'next/server';

function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function POST(request, { params }) {
  const { data: source, error: sourceError } = await supabase
    .from('vaccinations')
    .select('id, patient_id, date_given, patients(species)')
    .eq('id', params.id)
    .single();

  if (sourceError || !source) {
    return NextResponse.json({ error: 'vaccination record not found' }, { status: 404 });
  }
  if (!source.date_given) {
    return NextResponse.json(
      { error: 'this record has no given date yet — nothing to mark as primary' },
      { status: 400 }
    );
  }

  const speciesClass = classifySpecies(source.patients?.species);
  if (!speciesClass) {
    return NextResponse.json(
      { error: `couldn't tell cat vs dog from "${source.patients?.species}"` },
      { status: 400 }
    );
  }

  // Every vaccine given to this patient on the same date = the same visit.
  const { data: visitRows, error: visitError } = await supabase
    .from('vaccinations')
    .select('id, vaccine_protocol_id, vaccine_protocols(is_rabies)')
    .eq('patient_id', source.patient_id)
    .eq('date_given', source.date_given);

  if (visitError) {
    return NextResponse.json({ error: visitError.message }, { status: 500 });
  }

  const rabiesGiven = visitRows.some((r) => r.vaccine_protocols?.is_rabies);

  const { data: coreProtocol, error: coreError } = await supabase
    .from('vaccine_protocols')
    .select('id, name')
    .eq('species', speciesClass)
    .eq('core', true)
    .eq('is_rabies', false)
    .maybeSingle();

  if (coreError || !coreProtocol) {
    return NextResponse.json(
      { error: `no core (non-rabies) vaccine protocol configured for ${speciesClass}s` },
      { status: 400 }
    );
  }

  const boosterDue = addMonths(source.date_given, 1);
  const visitIds = visitRows.map((r) => r.id);
  const coreRowIds = visitRows
    .filter((r) => r.vaccine_protocol_id === coreProtocol.id)
    .map((r) => r.id);

  if (visitIds.length) {
    const { error: primaryError } = await supabase
      .from('vaccinations')
      .update({ is_primary: true })
      .in('id', visitIds);
    if (primaryError) return NextResponse.json({ error: primaryError.message }, { status: 500 });
  }

  if (coreRowIds.length) {
    const { error: boosterError } = await supabase
      .from('vaccinations')
      .update({ next_due_date: boosterDue })
      .in('id', coreRowIds);
    if (boosterError) return NextResponse.json({ error: boosterError.message }, { status: 500 });
  }

  let rabiesReminderCreated = false;
  if (!rabiesGiven) {
    const { data: rabiesProtocol, error: rabiesProtocolError } = await supabase
      .from('vaccine_protocols')
      .select('id, name')
      .eq('species', speciesClass)
      .eq('is_rabies', true)
      .maybeSingle();

    if (rabiesProtocolError || !rabiesProtocol) {
      return NextResponse.json(
        { error: `no rabies protocol configured for ${speciesClass}s` },
        { status: 400 }
      );
    }

    const { error: createError } = await supabase.from('vaccinations').insert([
      {
        patient_id: source.patient_id,
        vaccine_protocol_id: rabiesProtocol.id,
        vaccine_name: rabiesProtocol.name,
        date_given: null,
        next_due_date: boosterDue,
        is_primary: true,
        notes: 'Primary course booster — rabies not given at the first visit',
      },
    ]);
    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
    rabiesReminderCreated = true;
  }

  return NextResponse.json({
    ok: true,
    booster_due: boosterDue,
    core_vaccine: coreProtocol.name,
    rabies_given: rabiesGiven,
    rabies_reminder_created: rabiesReminderCreated,
  });
}
