'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import CageFloorPlan from '@/app/_components/CageFloorPlan';
import { supabase } from '@/lib/supabaseClient';
import { ADMINISTRATION_METHOD_LABELS } from '@/lib/administrationMethods';
import styles from './page.module.css';

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function WallCageTile({ cage, hospitalization, details }) {
  if (!hospitalization) {
    return (
      <div className={`${styles.tile} ${styles.empty}`}>
        <div className={styles.tileHeader}>
          <span className={styles.cageName}>{cage.name}</span>
          {cage.is_oxygen_room && <span title="Oxygen room">🫧</span>}
        </div>
        <span>Empty</span>
      </div>
    );
  }

  const planItems = details?.planItems || [];
  const todayNotes = details?.todayNotes || [];
  const needsAttention = hospitalization.update_requested_at || hospitalization.scheduled_update_overdue;

  function completionFor(itemId) {
    return todayNotes
      .filter((note) => note.plan_item_ids?.includes(itemId))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  return (
    <div className={`${styles.tile}${needsAttention ? ` ${styles.attention}` : ''}`}>
      <div className={styles.tileHeader}>
        <span className={styles.cageName}>{cage.name}</span>
        <span>
          {needsAttention && <span title="Hospitalization needs attention">🔔</span>}
          {cage.is_oxygen_room && <span title="Oxygen room"> 🫧</span>}
        </span>
      </div>

      <div>
        <div className={styles.patient}>{hospitalization.patients?.name || 'Unnamed patient'}</div>
        <div className={styles.species}>
          {[hospitalization.patients?.species, hospitalization.reason].filter(Boolean).join(' · ')}
        </div>
      </div>

      {planItems.length === 0 ? (
        <div className={styles.noPlan}>No treatment plan entered.</div>
      ) : (
        <ul className={styles.plan}>
          {planItems.map((item) => {
            const done = completionFor(item.id);
            const last = done[done.length - 1];
            return (
              <li key={item.id} className={`${styles.task}${done.length ? ` ${styles.done}` : ''}`}>
                <span className={styles.dot} />
                <div className={styles.taskMain}>
                  <span className={styles.taskLabel}>
                    {item.label}
                    {item.administration_method &&
                      ` (${ADMINISTRATION_METHOD_LABELS[item.administration_method] || item.administration_method})`}
                  </span>
                  {item.instructions && <span className={styles.taskMeta}> — {item.instructions}</span>}
                  <span className={styles.status}>
                    {done.length
                      ? `✓ ${done.length > 1 ? `${done.length}× · ` : ''}last ${formatTime(last.created_at)}${
                          last.staff?.full_name ? ` · ${last.staff.full_name}` : ''
                        }`
                      : 'Not done yet today'}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function HospitalizationWallPage() {
  const [cages, setCages] = useState([]);
  const [admissions, setAdmissions] = useState([]);
  const [detailsByHospitalization, setDetailsByHospitalization] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

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
      setLastUpdated(new Date());
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

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen is optional; browsers may block it outside a user gesture.
    }
  }

  return (
    <div className={styles.wall}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h1>Hospitalization Wall</h1>
          <span className={styles.meta}>
            {loading && !lastUpdated
              ? 'Loading…'
              : `${admissions.filter((a) => a.cage_id).length} occupied · ${
                  lastUpdated ? `updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''
                }`}
          </span>
        </div>
        <div className={styles.actions}>
          <Link className="button-link" href="/hospitalization">
            Back
          </Link>
          <button type="button" onClick={loadWall}>Refresh</button>
          <button type="button" onClick={toggleFullscreen}>Fullscreen</button>
        </div>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <CageFloorPlan
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
