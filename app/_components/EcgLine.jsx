// app/_components/EcgLine.jsx
// The website's "pulse" divider — a heartbeat trace that sweeps across a
// faint base line. Pure CSS animation (stroke-dashoffset), no JS, and it
// backs off entirely under prefers-reduced-motion (see the CSS).

const BEAT =
  'M0,44 h62 c6,-9 16,-9 22,0 h16 l7,7 l8,-34 l9,42 l8,-15 h22 c12,-13 26,-13 38,0 h108' +
  ' c6,-9 16,-9 22,0 h16 l7,7 l8,-34 l9,42 l8,-15 h22 c12,-13 26,-13 38,0 h108' +
  ' c6,-9 16,-9 22,0 h16 l7,7 l8,-34 l9,42 l8,-15 h22 c12,-13 26,-13 38,0 h108' +
  ' c6,-9 16,-9 22,0 h16 l7,7 l8,-34 l9,42 l8,-15 h22 c12,-13 26,-13 38,0 h108';

export default function EcgLine() {
  return (
    <div className="client-app-ecg" aria-hidden="true">
      <svg viewBox="0 0 1200 80" preserveAspectRatio="none">
        <path className="client-app-ecg-base" d={BEAT} />
        <path className="client-app-ecg-live" d={BEAT} />
      </svg>
    </div>
  );
}
