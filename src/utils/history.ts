/**
 * 历史查询：历史钉位与照片备注可查。
 *
 * 从本机与中央档案中汇总所有修蹄单，
 * 按钉位（nail）与照片备注（photo）建立可检索的历史索引。
 */
import type { HistoryHit, WorkOrder } from "../types";
import { loadCentralArchive } from "../store/centralStore";
import { loadLocalOrders } from "../store/localStore";

/**
 * 汇总全部单子（本机 + 中央），按订单号去重。
 */
export function loadAllOrders(): WorkOrder[] {
  const local = loadLocalOrders();
  const central = Object.values(loadCentralArchive().orders);
  const map = new Map<string, WorkOrder>();
  for (const o of [...local, ...central]) {
    const existing = map.get(o.id);
    if (!existing || o.rev > existing.rev) {
      map.set(o.id, o);
    }
  }
  return Array.from(map.values());
}

/**
 * 查询历史钉位。
 *
 * 可按马匹编号、蹄位、钉位关键词过滤。
 */
export function queryNailHistory(filter: {
  horseId?: string;
  position?: string;
  keyword?: string;
}): HistoryHit[] {
  const hits: HistoryHit[] = [];
  for (const order of loadAllOrders()) {
    if (filter.horseId && order.horseId !== filter.horseId) continue;
    for (const check of order.hoofChecks) {
      if (filter.position && check.position !== filter.position) continue;
      if (
        filter.keyword &&
        !check.nailPosition.includes(filter.keyword) &&
        !check.notes.includes(filter.keyword)
      ) {
        continue;
      }
      hits.push({
        orderId: order.id,
        horseId: order.horseId,
        rev: order.rev,
        kind: "nail",
        position: check.position,
        nailPosition: check.nailPosition,
        note: check.notes,
        at: order.updatedAt,
      });
    }
    for (const change of order.horseshoeChanges) {
      if (filter.position && change.position !== filter.position) continue;
      if (
        filter.keyword &&
        !change.nailPosition.includes(filter.keyword) &&
        !change.notes.includes(filter.keyword)
      ) {
        continue;
      }
      hits.push({
        orderId: order.id,
        horseId: order.horseId,
        rev: order.rev,
        kind: "nail",
        position: change.position,
        nailPosition: change.nailPosition,
        note: change.notes,
        at: change.changedAt,
      });
    }
  }
  return hits.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

/**
 * 查询照片备注。
 *
 * 可按马匹编号、关键词过滤。
 */
export function queryPhotoHistory(filter: {
  horseId?: string;
  keyword?: string;
}): HistoryHit[] {
  const hits: HistoryHit[] = [];
  for (const order of loadAllOrders()) {
    if (filter.horseId && order.horseId !== filter.horseId) continue;
    const allNotes = [
      ...order.horseProfile.photoNotes,
      ...order.hoofChecks.flatMap((h) => h.photoNotes),
    ];
    for (const note of allNotes) {
      if (
        filter.keyword &&
        !note.note.includes(filter.keyword) &&
        !note.photoRef.includes(filter.keyword)
      ) {
        continue;
      }
      hits.push({
        orderId: order.id,
        horseId: order.horseId,
        rev: order.rev,
        kind: "photo",
        photoRef: note.photoRef,
        note: note.note,
        at: note.takenAt,
      });
    }
  }
  return hits.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
