'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import WallFloorPlan from './WallFloorPlan';
import WallCageTile from './WallCageTile';
import { supabase } from '@/lib/supabaseClient';
import styles from './page.module.css';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

// The Fullscreen API requires calling requestFullscreen() from inside a
// real user gesture (a click) — it can't be triggered automatically on
// page load — so this is wired to a button tap, not an effect. Vendor
// prefixes cover older Safari/iPadOS wall-mounted displays.
function requestFullscreen() {
  const el = document.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  request?.call(el);
}

function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
  exit?.call(document);
}

function isFullscreenActive() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
}

export default function HospitalizationWallPage() {
  const [cages, setCages] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [detailsByHospitalization, setDetailsByHospitalization] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    function onFullscreenChange() {
      setFullscreen(isFullscreenActive());
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
    };
  }, []);

  function toggleFullscreen() {
    if (isFullscreenActive()) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }
  }

  async function loadWall() {
    try {
      const [cagesRes, admissionsRes] = await Promise.all([fetch('/api/cages'), fetch('/api/hospitalizations')]);
      const cagesData = await cagesRes.json();
      const admissionsData = await admissionsRes.json();
      if (!cagesRes.ok || !admissionsRes.ok) throw new Error('Failed to load hospitalization wall display');

      const admitted = (Array.isArray(admissionsData) ? admissionsData : []).filter((a) => a.status === 'admitted');
      const occupied = admitted.filter((a) => a.cage_id);
      const today = todayISODate();

      const detailEntries = await Promise.all(
        occupied.map(async (hosp) => {
          const [planRes, notesRes] = await Promise.all([
            fetch(`/api/hospitalizations/${hosp.id}/plan-items`),
            fetch(`/api/hospitalizations/${hosp.id}/notes`),
          ]);
          const [planItems, notes] = await Promise.all([planRes.json(), notesRes.json()]);
          if (!planRes.ok || !notesRes.ok || !Array.isArray(planItems) || !Array.isArray(notes)) {
            return [hosp.id, { error: true }];
          }
          const todayNotes = (Array.isArray(notes) ? notes : []).filter(
            (n) => n.note_date === today && n.plan_item_ids?.length > 0
          );
          return [hosp.id, { planItems: Array.isArray(planItems) ? planItems : [], todayNotes }];
        })
      );

      setCages(Array.isArray(cagesData) ? cagesData : []);
      setAdmissions(admitted);
      setDetailsByHospitalization(Object.fromEntries(detailEntries));
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to refresh wall display');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWall();
    const timer = window.setInterval(loadWall, 30 * 1000);
    const channel = supabase
      .channel('hospitalization-wall-display')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalizations' }, loadWall)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalization_plan_items' }, loadWall)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hospitalization_notes' }, loadWall)
      .subscribe();

    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const occupancy = useMemo(
    () => Object.fromEntries(admissions.filter((a) => a.cage_id).map((a) => [a.cage_id, a])),
    [admissions]
  );

  return (
    <div className={styles.wall}>
      <Link className={styles.back} href="/hospitalization" aria-label="Back to hospitalization">Back</Link>
      <button
        type="button"
        className={styles.fullscreenToggle}
        onClick={toggleFullscreen}
        aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'}
      >
        {fullscreen ? '⤦ Exit Full Screen' : '⛶ Full Screen'}
      </button>
      {loading && <div className={styles.loading} role="status">Loading…</div>}
      {error && <div className={styles.error}>{error}</div>}

      <WallFloorPlan
        cages={cages}
        renderTile={(cage) => {
          const hospitalization = occupancy[cage.id];
          return (
            <WallCageTile
              key={cage.id}
              cage={cage}
              hospitalization={hospitalization}
              details={hospitalization ? detailsByHospitalization[hospitalization.id] : null}
            />
          );
        }}
      />
    </div>
  );
}
