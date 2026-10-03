/**
 * 升级迁移：旧数据没有修订号就回填。
 *
 * 升级前的历史单子可能缺少 rev / batchId / source 等字段，
 * 升级时统一回填默认值，保证合并与幂等逻辑可用。
 */
import type { WorkOrder } from "../types";
import { INITIAL_REV } from "./revision";

/**
 * 回填单条旧单子的修订号等缺失字段。
 * 返回回填后的单子（不修改原对象）。
 */
export function backfillOrder(order: Partial<WorkOrder>): WorkOrder {
  const now = new Date().toISOString();
  return {
    // 既有字段优先
    ...(order as WorkOrder),
    // 缺失字段回填
    id: order.id ?? `LEGACY-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
    batchId: order.batchId ?? "LEGACY-BATCH",
    rev: typeof order.rev === "number" && order.rev > 0 ? order.rev : INITIAL_REV,
    source: order.source ?? "central",
    status: order.status ?? "synced",
    createdAt: order.createdAt ?? now,
    updatedAt: order.updatedAt ?? now,
    horseId: order.horseId ?? "UNKNOWN",
    horseProfile: order.horseProfile ?? {
      horseId: order.horseId ?? "UNKNOWN",
      name: "未命名",
      breed: "未知",
      age: 0,
      type: "运动马",
      gaitIssues: [],
      hoofShape: "",
      notes: "",
      photoNotes: [],
    },
    hoofChecks: order.hoofChecks ?? [],
    horseshoeChanges: order.horseshoeChanges ?? [],
    trainingRelease: order.trainingRelease ?? {
      released: false,
      reason: "历史数据未记录放行状态",
      computedAt: now,
      basedOnHorseshoeType: "未知",
    },
    conflicts: order.conflicts ?? [],
    failCount: order.failCount ?? 0,
    lastError: order.lastError ?? "",
    syncedAt: order.syncedAt ?? now,
  };
}

/**
 * 批量回填。
 * 返回 { migrated, orders }：migrated 为本次回填的条数。
 */
export function backfillOrders(
  orders: Array<Partial<WorkOrder>>
): { migrated: number; orders: WorkOrder[] } {
  let migrated = 0;
  const result = orders.map((raw) => {
    const needsBackfill =
      typeof raw.rev !== "number" ||
      !raw.id ||
      !raw.batchId ||
      !raw.source ||
      !raw.status;
    if (needsBackfill) migrated += 1;
    return backfillOrder(raw);
  });
  return { migrated, orders: result };
}
