'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DayProcedureWallCard from './DayProcedureWallCard';
import { supabase } from '@/lib/supabaseClient';
import styles from './page.module.css';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

// See app/(admin)/hospitalization/wall/page.jsx — same Fullscreen API
// gesture requirement and vendor-prefix fallbacks.
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

export default function DayProcedureWallPage() {
  const [dayProcedures, setDayProcedures] = useState([]);
  const [detailsById, setDetailsById] = useState({});
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
      const res = await fetch('/api/hospitalizations?kind=day_procedure&status=admitted');
      const data = await res.json();
      if (!res.ok) throw new Error('Failed to load day procedure wall display');
      const list = Array.isArray(data) ? data : [];
      const today = todayISODate();

      const detailEntries = await Promise.all(
        list.map(async (dp) => {
          const [planRes, notesRes] = await Promise.all([
            fetch(`/api/hospitalizations/${dp.id}/plan-items`),
            fetch(`/api/hospitalizations/${dp.id}/notes`),
          ]);
          const [planItems, notes] = await Promise.all([planRes.json(), notesRes.json()]);
          if (!planRes.ok || !notesRes.ok || !Array.isArray(planItems) || !Array.isArray(notes)) {
            return [dp.id, { error: true }];
          }
          const todayNotes = notes.filter((n) => n.note_date === today && n.plan_item_ids?.length > 0);
          return [dp.id, { planItems, todayNotes }];
        })
      );

      setDayProcedures(list);
      setDetailsById(Object.fromEntries(detailEntries));
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to refresh day procedure wall display');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWall();
    const timer = window.setInterval(loadWall, 30 * 1000);
    const channel = supabase
      .channel('day-procedure-wall-display')
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

  // Bias columns wider than tall — the wall screen this renders on is
  // landscape, and each card (patient + checklist) reads better wide
  // than square, unlike the Hospital Wall's fixed cage grid.
  const columns = Math.max(1, Math.ceil(Math.sqrt(dayProcedures.length * 1.6)));
  const rows = Math.max(1, Math.ceil(dayProcedures.length / columns));

  return (
    <div className={styles.wall}>
      <Link className={styles.back} href="/day-procedures" aria-label="Back to day procedures">Back</Link>
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

      {!loading && dayProcedures.length === 0 ? (
        <p className={styles.noPlan}>No day procedures in progress right now.</p>
      ) : (
        <div className={styles.grid} style={{ '--cols': columns, '--rows': rows }}>
          {dayProcedures.map((dp) => (
            <DayProcedureWallCard key={dp.id} dayProcedure={dp} details={detailsById[dp.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
