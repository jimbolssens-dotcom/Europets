// lib/stockCatalogGuard.js
// The Stock list follows the catalog (Jim, 28 Oct): a catalog item that
// still has stock on the shelf can't be deactivated, and once it is
// deactivated its stock item leaves the Stock list (unless another active
// catalog item, or the vaccination record, still counts it down, as both
// urine tests share the strips). A renamed catalog item renames its own
// stock item too. Used by PATCH /api/goods-services/:id.

const fmt = (n) => String(Math.round(Number(n) * 100) / 100);

// The stock items a catalog item feeds: linked to it, or a vaccine stock
// item under the same name (vaccines count from the vaccination record).
async function stockFor(db, goodsServiceId) {
  const [{ data: item }, { data: links }] = await Promise.all([
    db.from('goods_services').select('id, name').eq('id', goodsServiceId).single(),
    db.from('stock_links').select('stock_item_id').eq('goods_service_id', goodsServiceId),
  ]);
  const ids = new Set((links || []).map((l) => l.stock_item_id));
  if (item?.name) {
    const { data: sameName } = await db.from('stock_items').select('id').eq('name', item.name);
    for (const s of sameName || []) ids.add(s.id);
  }
  if (!ids.size) return { item, levels: [], others: new Map() };
  const [{ data: levels }, { data: allLinks }, { data: vaccineLinks }] = await Promise.all([
    db.from('stock_levels').select('id, name, on_hand, active').in('id', [...ids]).eq('active', true),
    db.from('stock_links').select('stock_item_id, goods_service_id, goods_services(active)').in('stock_item_id', [...ids]),
    db.from('stock_vaccine_links').select('stock_item_id').in('stock_item_id', [...ids]),
  ]);
  // How many other things still count each stock item down.
  const others = new Map();
  for (const l of allLinks || []) {
    if (l.goods_service_id !== goodsServiceId && l.goods_services?.active) others.set(l.stock_item_id, (others.get(l.stock_item_id) || 0) + 1);
  }
  for (const v of vaccineLinks || []) others.set(v.stock_item_id, (others.get(v.stock_item_id) || 0) + 1);
  return { item, levels: levels || [], others };
}

// Before deactivating: an error message if it still has stock, else null.
export async function deactivationBlocked(db, goodsServiceId) {
  const { item, levels, others } = await stockFor(db, goodsServiceId);
  const stocked = levels.find((l) => Number(l.on_hand) > 0 && !others.get(l.id));
  if (!stocked) return null;
  return `${item?.name || 'This item'} still has ${fmt(stocked.on_hand)} in stock. Use it up, or count the shelf to 0 on the Stock page, before deactivating it.`;
}

// After deactivating: its stock items nothing else counts down leave the list.
export async function retireStockFor(db, goodsServiceId) {
  const { levels, others } = await stockFor(db, goodsServiceId);
  const retire = levels.filter((l) => !others.get(l.id)).map((l) => l.id);
  if (retire.length) await db.from('stock_items').update({ active: false }).in('id', retire);
  return retire.length;
}

// After a rename: a stock item counted down by this catalog item alone (not
// a shared one like the urine strips, not a vaccine) takes its new name.
export async function renameStockFor(db, goodsServiceId, newName) {
  const { data: links } = await db.from('stock_links').select('stock_item_id').eq('goods_service_id', goodsServiceId);
  let renamed = 0;
  for (const { stock_item_id: id } of links || []) {
    const [{ count: linkCount }, { count: vaccineCount }] = await Promise.all([
      db.from('stock_links').select('goods_service_id', { count: 'exact', head: true }).eq('stock_item_id', id),
      db.from('stock_vaccine_links').select('stock_item_id', { count: 'exact', head: true }).eq('stock_item_id', id),
    ]);
    if (linkCount !== 1 || vaccineCount) continue;
    const { error } = await db.from('stock_items').update({ name: newName }).eq('id', id);
    if (!error) renamed++;
  }
  return renamed;
}
