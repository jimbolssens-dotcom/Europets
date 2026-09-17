// lib/temperatureZones.js
// The clinic's fixed temperature zones, shared by TemperatureHistoryChart
// and TempDial so a reading is colored the same way everywhere it shows up:
//   purple    > 40°C     — critical high
//   red       39.5–40°C  — high
//   yellow    39–39.5°C  — elevated
//   green     37.5–39°C  — normal
//   lightblue 36–37.5°C  — low
//   darkblue  < 36°C     — critical low

export const TEMPERATURE_ZONE_MIN = 34;
export const TEMPERATURE_ZONE_MAX = 42;
export const TEMPERATURE_ZONE_BOUNDARIES = [36, 37.5, 39, 39.5, 40];
export const TEMPERATURE_ZONE_BAND_COLORS = ['#1e3a8a', '#38bdf8', '#22c55e', '#eab308', '#ef4444', '#8b5cf6'];

export function temperatureZoneColor(temp) {
  if (temp > 40) return '#8b5cf6';
  if (temp >= 39.5) return '#ef4444';
  if (temp >= 39) return '#eab308';
  if (temp >= 37.5) return '#22c55e';
  if (temp >= 36) return '#38bdf8';
  return '#1e3a8a';
}
