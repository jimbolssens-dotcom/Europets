-- Migration 175: create a case's invoice one request at a time
--
-- The running-invoice panel on a stay / day procedure re-syncs its invoice
-- on every treatment item change, so adding several items at once (or the
-- case being open on two screens) fired several "find or create the
-- invoice" requests in the same instant. Each found no invoice yet and
-- each created one: Yuki, Arya, STR NEW got 4 invoices each, Anna and Boo 2.
--
-- find_or_create_invoice does the lookup and the insert inside one
-- transaction holding a per-client lock, so concurrent calls queue up and
-- every one after the first finds the invoice the first one made. It looks
-- for an open (non-void) invoice on the stay OR the consult (so a consult
-- added to an already-invoiced day procedure reuses that invoice, the Boo
-- case), oldest first, and fills in whichever of visit_id /
-- hospitalization_id it was missing.
--
-- Called with the service role from lib/invoicing.js and
-- app/api/visits/[id]/invoice. Safe to run more than once.

create or replace function find_or_create_invoice(
    p_client_id uuid,
    p_hospitalization_id uuid default null,
    p_visit_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_id uuid;
begin
    if p_hospitalization_id is null and p_visit_id is null then
        raise exception 'find_or_create_invoice needs a hospitalization or a visit';
    end if;

    -- Serialise per client: a second call waits here until the first
    -- one's transaction (and its insert) has committed.
    perform pg_advisory_xact_lock(hashtextextended('invoice:' || coalesce(p_client_id::text, ''), 0));

    select id into v_id
    from invoices
    where status <> 'void'
      and ((p_hospitalization_id is not null and hospitalization_id = p_hospitalization_id)
        or (p_visit_id is not null and visit_id = p_visit_id))
    order by created_at
    limit 1;

    if v_id is not null then
        update invoices
        set hospitalization_id = coalesce(hospitalization_id, p_hospitalization_id),
            visit_id = coalesce(visit_id, p_visit_id)
        where id = v_id
          and ((hospitalization_id is null and p_hospitalization_id is not null)
            or (visit_id is null and p_visit_id is not null));
        return v_id;
    end if;

    insert into invoices (client_id, hospitalization_id, visit_id)
    values (p_client_id, p_hospitalization_id, p_visit_id)
    returning id into v_id;
    return v_id;
end;
$$;

revoke all on function find_or_create_invoice(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function find_or_create_invoice(uuid, uuid, uuid) to service_role;
