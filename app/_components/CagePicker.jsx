// app/_components/CagePicker.jsx
// Compact, clickable cage floor plan for picking a cage on the Admit
// Patient form — same layout and color-coding as the full Cage Layout
// page, shrunk down. Click an empty cage to select it (click again to
// deselect); an occupied cage is shown pink and disabled.

'use client';

import CageFloorPlan from './CageFloorPlan';

// The cluster heading already says "LT" / "Recovery" / etc., so the tile
// itself only needs the number — "Cage 12" as a whole doesn't fit a
// square this small.
function shortLabel(name) {
  const match = name.match(/(\d+)\s*$/);
  return match ? match[1] : name;
}

export default function CagePicker({ cages, occupiedCageIds, value, onChange }) {
  return (
    <CageFloorPlan
      cages={cages}
      compact
      renderTile={(cage) => {
        const occupied = occupiedCageIds.has(cage.id);
        const selected = value === cage.id;
        return (
          <button
            key={cage.id}
            type="button"
            disabled={occupied}
            title={occupied ? `${cage.name} — occupied` : cage.name}
            className={[
              'cage-mini-tile',
              occupied ? 'cage-occupied' : `cage-empty cage-group-${cage.group_name}`,
              selected ? 'cage-mini-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onChange(selected ? '' : cage.id)}
          >
            {shortLabel(cage.name)}
          </button>
        );
      }}
    />
  );
}
