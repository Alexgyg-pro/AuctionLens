import db from './db/index.js'

export function storageUsedBytes(cabinetId) {
  const refs = db
    .prepare(
      `SELECT COALESCE(SUM(ir.file_size), 0) AS n
       FROM image_references ir
       JOIN lots l ON l.id = ir.lot_id
       JOIN sales s ON s.id = l.sale_id
       WHERE s.cabinet_id = ?`
    )
    .get(cabinetId).n
  const resources = db
    .prepare(
      `SELECT COALESCE(SUM(r.file_size), 0) AS n
       FROM resources r
       JOIN lots l ON l.id = r.lot_id
       JOIN sales s ON s.id = l.sale_id
       WHERE s.cabinet_id = ?`
    )
    .get(cabinetId).n
  return refs + resources
}

export function cabinetUsage(cabinetId) {
  return {
    active_sales: db
      .prepare("SELECT COUNT(*) AS n FROM sales WHERE cabinet_id = ? AND status = 'published'")
      .get(cabinetId).n,
    total_lots: db
      .prepare(
        'SELECT COUNT(*) AS n FROM lots l JOIN sales s ON s.id = l.sale_id WHERE s.cabinet_id = ?'
      )
      .get(cabinetId).n,
    storage_bytes: storageUsedBytes(cabinetId),
  }
}
