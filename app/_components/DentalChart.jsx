// app/_components/DentalChart.jsx
// Interactive, per-patient dental chart (lifetime record — see migration
// 040/patients.dental_chart, not tied to any one dental report). Pick a
// mode (Extracted/Missing), then click teeth to paint them; click a
// tooth already in that mode again to clear it back to normal. Species-
// specific layout comes from lib/dentalChartLayout.js, shared with the
// PDF export so both always agree on tooth positions/ids.

'use client';

import { useState } from 'react';
import { getToothLayout, BOX_WIDTH, BOX_HEIGHT, TOOTH_COLORS } from '@/lib/dentalChartLayout';

export default function DentalChart({ species, value, onChange, saving }) {
  const [mode, setMode] = useState('extracted');
  const layout = getToothLayout(species);

  if (!layout) {
    return (
      <p className="visit-meta">
        No dental chart layout available for species &quot;{species || 'unspecified'}&quot; yet (only
        dog and cat are supported).
      </p>
    );
  }

  function toothClick(toothId) {
    const current = value?.[toothId];
    const next = { ...(value || {}) };
    if (current === mode) {
      delete next[toothId];
    } else {
      next[toothId] = mode;
    }
    onChange(next);
  }

  return (
    <div className="dental-chart">
      <div className="dental-chart-modes">
        <button
          type="button"
          className={mode === 'extracted' ? 'dental-mode-btn active' : 'dental-mode-btn'}
          onClick={() => setMode('extracted')}
        >
          🔴 Mark Extracted
        </button>
        <button
          type="button"
          className={mode === 'missing' ? 'dental-mode-btn active' : 'dental-mode-btn'}
          onClick={() => setMode('missing')}
        >
          🟢 Mark Missing
        </button>
        {saving && <span className="visit-meta">Saving...</span>}
      </div>
      <svg viewBox={`0 0 ${BOX_WIDTH} ${BOX_HEIGHT}`} className="dental-chart-svg" role="img" aria-label="Dental chart">
        {layout.map((tooth) => {
          const state = value?.[tooth.id];
          const colors = TOOTH_COLORS[state] || TOOTH_COLORS.normal;
          return (
            <g key={tooth.id} onClick={() => toothClick(tooth.id)} className="dental-tooth">
              <ellipse
                cx={tooth.cx}
                cy={tooth.cy}
                rx={tooth.rx}
                ry={tooth.ry}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={1.5}
              />
              <text x={tooth.cx} y={tooth.cy + 3} textAnchor="middle" fontSize={9} fill="#333">
                {tooth.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="visit-meta dental-chart-legend">
        <span className="dental-legend-swatch dental-legend-extracted" /> Extracted &nbsp;
        <span className="dental-legend-swatch dental-legend-missing" /> Missing &nbsp;
        <span className="dental-legend-swatch dental-legend-normal" /> Present
      </p>
    </div>
  );
}
