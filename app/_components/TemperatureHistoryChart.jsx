// app/_components/TemperatureHistoryChart.jsx
// A line-and-dot chart of a patient's temperature over time, structured
// exactly like WeightHistoryChart (full + mini sizes, hover crosshair and
// tooltip) but color-coded by medical zone instead of a single brand
// color, so a fever or a hypothermic reading reads at a glance:
//   purple   > 40°C
//   red      39.5–40°C
//   yellow   39–39.5°C
//   green    37.5–39°C   (normal)
//   lightblue 36–37.5°C
//   darkblue < 36°C
//
// Unlike weight, the axis is a FIXED 34–42°C span rather than scaled to
// the data's own min/max — the zone colors only mean the same thing chart
// to chart if the scale itself is stable. It still widens past that span
// if a reading falls outside it, so nothing gets clipped off-chart.
//
// `data` is [{ date, temperature_c }, ...] in any order — sorted and
// filtered here so callers can just pass through whatever their API
// returned.

'use client';

import { useMemo, useRef, useState } from 'react';

const ZONE_MIN = 34;
const ZONE_MAX = 42;
const ZONE_BOUNDARIES = [36, 37.5, 39, 39.5, 40];
const ZONE_BAND_COLORS = ['#1e3a8a', '#38bdf8', '#22c55e', '#eab308', '#ef4444', '#8b5cf6'];

function zoneColor(temp) {
  if (temp > 40) return '#8b5cf6';
  if (temp >= 39.5) return '#ef4444';
  if (temp >= 39) return '#eab308';
  if (temp >= 37.5) return '#22c55e';
  if (temp >= 36) return '#38bdf8';
  return '#1e3a8a';
}

export default function TemperatureHistoryChart({ data, mini = false, unit = '°C' }) {
  const points = useMemo(
    () =>
      (data || [])
        .filter((d) => d.temperature_c != null)
        .map((d) => ({ date: new Date(d.date), temp: Number(d.temperature_c) }))
        .sort((a, b) => a.date - b.date),
    [data]
  );

  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  if (points.length === 0) {
    return mini ? null : <p className="note-empty">No temperature recorded yet.</p>;
  }

  const width = mini ? 120 : 640;
  const height = mini ? 32 : 220;
  const padX = mini ? 3 : 36;
  const padY = mini ? 3 : 28;

  const minTemp = Math.min(ZONE_MIN, ...points.map((p) => p.temp));
  const maxTemp = Math.max(ZONE_MAX, ...points.map((p) => p.temp));
  const tempRange = maxTemp - minTemp || 1;
  const minTime = points[0].date.getTime();
  const maxTime = points[points.length - 1].date.getTime();
  const timeRange = maxTime - minTime || 1;

  const xOf = (i) =>
    points.length === 1 ? width / 2 : padX + ((points[i].date.getTime() - minTime) / timeRange) * (width - 2 * padX);
  const yOf = (t) => height - padY - ((t - minTemp) / tempRange) * (height - 2 * padY);

  const bandStops = [minTemp, ...ZONE_BOUNDARIES.filter((b) => b > minTemp && b < maxTemp), maxTemp];
  const dotRadius = mini ? 2.5 : 4;

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(xOf(i) - px);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setHoverIndex(closest);
  }

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div className={mini ? 'temp-chart temp-chart-mini' : 'temp-chart'}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {!mini &&
          bandStops.slice(0, -1).map((stop, i) => (
            <rect
              key={i}
              x={padX}
              y={yOf(bandStops[i + 1])}
              width={width - 2 * padX}
              height={yOf(stop) - yOf(bandStops[i + 1])}
              fill={ZONE_BAND_COLORS[i]}
              opacity={0.12}
            />
          ))}
        {!mini && (
          <>
            <text x={padX} y={yOf(maxTemp) - 8} className="temp-chart-axis-label">
              {maxTemp} {unit}
            </text>
            <text x={padX} y={yOf(minTemp) + 16} className="temp-chart-axis-label">
              {minTemp} {unit}
            </text>
          </>
        )}
        {hovered && (
          <line
            x1={xOf(hoverIndex)}
            y1={mini ? 0 : padY / 2}
            x2={xOf(hoverIndex)}
            y2={mini ? height : height - padY / 2}
            className="temp-chart-crosshair"
          />
        )}
        {points.slice(1).map((p, i) => (
          <line
            key={i}
            x1={xOf(i)}
            y1={yOf(points[i].temp)}
            x2={xOf(i + 1)}
            y2={yOf(p.temp)}
            className="temp-chart-line-segment"
            stroke={zoneColor(p.temp)}
          />
        ))}
        {points.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(p.temp)} r={dotRadius} className="temp-chart-dot" fill={zoneColor(p.temp)} />
        ))}
      </svg>
      {hovered && (
        <div
          className="temp-chart-tooltip"
          style={{ left: `${Math.min(92, Math.max(8, (xOf(hoverIndex) / width) * 100))}%` }}
        >
          <strong style={{ color: zoneColor(hovered.temp) }}>
            {hovered.temp} {unit}
          </strong>
          <span>{hovered.date.toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}
