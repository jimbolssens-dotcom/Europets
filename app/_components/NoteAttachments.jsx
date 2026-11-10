// app/_components/NoteAttachments.jsx
// The photos of every worksheet entry on a stay, loaded in ONE request and
// kept live with ONE connection, shared by each entry's AttachmentSection /
// AttachmentGallery. Each of those used to fetch its own list and open its
// own live-update connection: a stay with 50 entries made 50 requests and
// 50 connections on every load, which was most of the database's disk use
// (Supabase's Disk IO warning, 10 Nov).
//
// Wrap the worksheet in <NoteAttachmentsProvider entityType="hospitalization_note"
// ids={noteIds}>; galleries inside it for that entity type use the shared
// list and refresh it after an upload, delete or move.

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase, isOwnerFacingPage } from '@/lib/supabaseClient';
import { pollWhileVisible } from '@/lib/pollWhileVisible';

const NoteAttachmentsContext = createContext(null);

export function NoteAttachmentsProvider({ entityType, ids, children }) {
  const [byId, setById] = useState({});
  const idsKey = [...(ids || [])].sort().join(',');
  const idsRef = useRef(idsKey);
  idsRef.current = idsKey;

  const reload = useCallback(() => {
    const key = idsRef.current;
    if (!key) {
      setById({});
      return Promise.resolve();
    }
    return fetch(`/api/attachments?entity_type=${entityType}&entity_ids=${key}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((rows) => {
        if (!Array.isArray(rows) || idsRef.current !== key) return;
        const next = {};
        for (const r of rows) (next[r.entity_id] ||= []).push(r);
        setById(next);
      })
      .catch(() => {});
  }, [entityType]);

  useEffect(() => {
    reload();
  }, [idsKey, reload]);

  // One connection for all of them (staff), or a slow poll on owners' pages.
  useEffect(() => {
    if (isOwnerFacingPage()) return pollWhileVisible(reload, 2 * 60 * 1000);
    let timer = null;
    const channel = supabase
      .channel(`note-attachments-${entityType}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attachments', filter: `entity_type=eq.${entityType}` }, (payload) => {
        const id = payload.new?.entity_id || payload.old?.entity_id;
        if (id && !idsRef.current.includes(id)) return;
        clearTimeout(timer);
        timer = setTimeout(reload, 500);
      })
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [entityType, reload]);

  return <NoteAttachmentsContext.Provider value={{ entityType, byId, reload }}>{children}</NoteAttachmentsContext.Provider>;
}

// The shared list for this entity, or null when there's no provider for
// its type (the gallery then loads its own as before).
export function useSharedAttachments(entityType, entityId) {
  const ctx = useContext(NoteAttachmentsContext);
  if (!ctx || ctx.entityType !== entityType) return null;
  return { list: ctx.byId[entityId] || [], reload: ctx.reload };
}
