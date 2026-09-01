// app/_components/VaccinationPanel.jsx
// History + Add Vaccination form side by side for one patient — the
// generic layout, used wherever there isn't other content (like the
// patient page's own info panel) to arrange around it. Used on the
// consult page so a vaccination can be recorded without leaving the
// consult.

'use client';

import { useVaccinations } from './useVaccinations';
import VaccinationForm from './VaccinationForm';
import VaccinationHistory from './VaccinationHistory';

export default function VaccinationPanel({ patientId, species, staff }) {
  const vac = useVaccinations(patientId, species);

  return (
    <div className="split">
      <div className="split-main">
        <h2>Vaccination History</h2>
        <VaccinationHistory vaccinations={vac.vaccinations} onDelete={vac.deleteVaccination} />
      </div>
      <div className="split-aside">
        <VaccinationForm {...vac} species={species} staff={staff} />
      </div>
    </div>
  );
}
