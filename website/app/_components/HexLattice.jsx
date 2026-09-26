// Static hex-grid line pattern used as a faint accent behind a handful of
// dark sections. Each instance needs its own <defs> id since a page can
// render more than one.
let id = 0;

export default function HexLattice() {
  id += 1;
  const patternId = `hexgrid-${id}`;

  return (
    <svg className="lattice" aria-hidden="true">
      <defs>
        <pattern id={patternId} width="41.57" height="72" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="rgba(255,120,178,0.16)" strokeWidth="1">
            <path d="M20.78 0 L41.57 12 L41.57 36 L20.78 48 L0 36 L0 12 Z" />
            <path d="M0 36 L20.78 48 L20.78 72" />
            <path d="M41.57 36 L41.57 60" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} />
    </svg>
  );
}
