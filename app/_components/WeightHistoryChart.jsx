// app/_components/WeightHistoryChart.jsx
// A minimalist bright-pink line-and-dot chart of a patient's weight over
// time. Two sizes from the same component: the full version on the
// patient page (a couple of axis labels, a hover crosshair+tooltip) and a
// `mini` sparkline that sits right next to a patient's name on the
// hospitalization page, scoped to just that stay's own weigh-ins.
//
// `data` is [{ date, weight_kg }, ...] in any order — sorted and filtered
// here so callers can just pass through whatever their API returned.

'use client';

import { useMemo, useRef, useState } from 'react';

export default function WeightHistoryChart({ data, mini = false, unit = 'kg' }) {
  const points = useMemo(
    () =>
      (data || [])
        .filter((d) => d.weight_kg != null)
        .map((d) => ({ date: new Date(d.date), weight: Number(d.weight_kg) }))
        .sort((a, b) => a.date - b.date),
    [data]
  );

  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);

  if (points.length === 0) {
    return mini ? null : <p className="note-empty">No weight recorded yet.</p>;
  }

  const width = mini ? 120 : 640;
  const height = mini ? 32 : 220;
  const padX = mini ? 3 : 36;
  const padY = mini ? 3 : 28;

  const minWeight = Math.min(...points.map((p) => p.weight));
  const maxWeight = Math.max(...points.map((p) => p.weight));
  // A flat (or single-point) series has no real range — fall back to a
  // fixed span so the line doesn't collapse onto one pixel.
  const weightRange = maxWeight - minWeight || 1;
  const minTime = points[0].date.getTime();
  const maxTime = points[points.length - 1].date.getTime();
  const timeRange = maxTime - minTime || 1;

  const xOf = (i) =>
    points.length === 1 ? width / 2 : padX + ((points[i].date.getTime() - minTime) / timeRange) * (width - 2 * padX);
  const yOf = (w) => height - padY - ((w - minWeight) / weightRange) * (height - 2 * padY);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(p.weight)}`).join(' ');
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
    <div className={mini ? 'weight-chart weight-chart-mini' : 'weight-chart'}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {!mini && (
          <>
            <line x1={padX} y1={yOf(minWeight)} x2={width - padX} y2={yOf(minWeight)} className="weight-chart-gridline" />
            <line x1={padX} y1={yOf(maxWeight)} x2={width - padX} y2={yOf(maxWeight)} className="weight-chart-gridline" />
            <text x={padX} y={yOf(maxWeight) - 8} className="weight-chart-axis-label">
              {maxWeight} {unit}
            </text>
            <text x={padX} y={yOf(minWeight) + 16} className="weight-chart-axis-label">
              {minWeight} {unit}
            </text>
          </>
        )}
        {hovered && (
          <line
            x1={xOf(hoverIndex)}
            y1={mini ? 0 : padY / 2}
            x2={xOf(hoverIndex)}
            y2={mini ? height : height - padY / 2}
            className="weight-chart-crosshair"
          />
        )}
        <path d={linePath} className="weight-chart-line" fill="none" />
        {points.map((p, i) => (
          <circle key={i} cx={xOf(i)} cy={yOf(p.weight)} r={dotRadius} className="weight-chart-dot" />
        ))}
      </svg>
      {hovered && (
        <div
          className="weight-chart-tooltip"
          style={{ left: `${Math.min(92, Math.max(8, (xOf(hoverIndex) / width) * 100))}%` }}
        >
          <strong>
            {hovered.weight} {unit}
          </strong>
          <span>{hovered.date.toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}
