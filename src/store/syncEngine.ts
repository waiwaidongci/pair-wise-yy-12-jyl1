/**
 * 同步引擎（可续作修蹄台的核心）
 *
 * 职责：
 * 1. 断网时单子存本机，恢复网络后合并到中央档案。
 * 2. 马匹档案、蹄位检查、蹄铁更换共用一个修订号（rev）。
 * 3. 两边都改过就留两份来源（source === 'merged'），不得互相覆盖。
 * 4. 蹄铁类型变化后旧训练放行失效，重算放行状态。
 * 5. 入库失败后保留本地批次，恢复网络重试；同一单不重复计入（幂等）。
 */
import type {
  ConflictRecord,
  HoofCheck,
  HorseshoeChange,
  SyncResult,
  WorkOrder,
} from "../types";
import {
  getCentralOrder,
  isOrderAlreadyInCentral,
  writeOrderToCentral,
} from "./centralStore";
import {
  appendLocalOrder,
  loadLocalOrders,
  removeLocalOrder,
  updateLocalOrder,
} from "./localStore";
import { recomputeRelease } from "../utils/invalidation";
import { generateId } from "../utils/revision";

/** 基础修订号记录：orderId -> 上次同步时的 rev（用于判定两边是否都改过） */
const BASE_REV_KEY = "farrier_base_rev_v1";

function loadBaseRevs(): Record<string, number> {
  try {
    const raw = localStorage.getItem(BASE_REV_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveBaseRevs(map: Record<string, number>): void {
  try {
    localStorage.setItem(BASE_REV_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/** 记录某单子已同步到的基础修订号 */
export function markBaseRev(orderId: string, rev: number): void {
  const map = loadBaseRevs();
  map[orderId] = rev;
  saveBaseRevs(map);
}

/** 读取某单子的基础修订号 */
export function getBaseRev(orderId: string): number {
  return loadBaseRevs()[orderId] ?? 0;
}

/**
 * 比较两份蹄位检查，返回冲突字段列表。
 */
function diffHoofChecks(
  local: HoofCheck[],
  central: HoofCheck[],
  localRev: number,
  centralRev: number
): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];
  const positions = new Set([
    ...local.map((h) => h.position),
    ...central.map((h) => h.position),
  ]);
  for (const pos of positions) {
    const l = local.find((h) => h.position === pos);
    const c = central.find((h) => h.position === pos);
    if (!l || !c) {
      conflicts.push({
        id: generateId("conf"),
        field: `hoofChecks[${pos}]`,
        localValue: l ?? null,
        centralValue: c ?? null,
        localRev,
        centralRev,
        recordedAt: new Date().toISOString(),
      });
      continue;
    }
    const fields: Array<keyof HoofCheck> = [
      "nailPosition",
      "hoofShape",
      "gaitIssue",
      "abnormalGait",
      "notes",
    ];
    for (const f of fields) {
      if (JSON.stringify(l[f]) !== JSON.stringify(c[f])) {
        conflicts.push({
          id: generateId("conf"),
          field: `hoofChecks[${pos}].${f}`,
          localValue: l[f],
          centralValue: c[f],
          localRev,
          centralRev,
          recordedAt: new Date().toISOString(),
        });
      }
    }
  }
  return conflicts;
}

/**
 * 比较两份蹄铁更换，返回冲突字段列表。
 */
function diffHorseshoeChanges(
  local: HorseshoeChange[],
  central: HorseshoeChange[],
  localRev: number,
  centralRev: number
): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];
  const ids = new Set([...local.map((h) => h.id), ...central.map((h) => h.id)]);
  for (const id of ids) {
    const l = local.find((h) => h.id === id);
    const c = central.find((h) => h.id === id);
    if (!l || !c) {
      conflicts.push({
        id: generateId("conf"),
        field: `horseshoeChanges[${id}]`,
        localValue: l ?? null,
        centralValue: c ?? null,
        localRev,
        centralRev,
        recordedAt: new Date().toISOString(),
      });
      continue;
    }
    const fields: Array<keyof HorseshoeChange> = [
      "position",
      "horseshoeType",
      "nailPosition",
      "changedAt",
      "notes",
    ];
    for (const f of fields) {
      if (JSON.stringify(l[f]) !== JSON.stringify(c[f])) {
        conflicts.push({
          id: generateId("conf"),
          field: `horseshoeChanges[${id}].${f}`,
          localValue: l[f],
          centralValue: c[f],
          localRev,
          centralRev,
          recordedAt: new Date().toISOString(),
        });
      }
    }
  }
  return conflicts;
}

/**
 * 比较两份修蹄单，返回冲突字段列表。
 */
export function diffOrders(local: WorkOrder, central: WorkOrder): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];
  const localRev = local.rev;
  const centralRev = central.rev;

  // 马匹档案字段
  const profileFields: Array<keyof WorkOrder["horseProfile"]> = [
    "name",
    "breed",
    "age",
    "type",
    "gaitIssues",
    "hoofShape",
    "notes",
  ];
  for (const f of profileFields) {
    if (
      JSON.stringify(local.horseProfile[f]) !==
      JSON.stringify(central.horseProfile[f])
    ) {
      conflicts.push({
        id: generateId("conf"),
        field: `horseProfile.${f}`,
        localValue: local.horseProfile[f],
        centralValue: central.horseProfile[f],
        localRev,
        centralRev,
        recordedAt: new Date().toISOString(),
      });
    }
  }

  // 蹄位检查
  conflicts.push(
    ...diffHoofChecks(local.hoofChecks, central.hoofChecks, localRev, centralRev)
  );

  // 蹄铁更换
  conflicts.push(
    ...diffHorseshoeChanges(
      local.horseshoeChanges,
      central.horseshoeChanges,
      localRev,
      centralRev
    )
  );

  return conflicts;
}

/**
 * 合并两份修蹄单，保留两份来源，互不覆盖。
 *
 * 规则：
 * - source 标记为 'merged'
 * - sources 保留 local 与 central 各自完整快照
 * - conflicts 记录所有差异字段
 * - rev 取较高值 + 1（标记本次合并）
 * - 训练放行按最新蹄铁类型重算
 */
export function mergeOrders(local: WorkOrder, central: WorkOrder): WorkOrder {
  const conflicts = diffOrders(local, central);
  const mergedRev = Math.max(local.rev, central.rev) + 1;

  // 训练放行：蹄铁类型变化后失效重算
  const trainingRelease = recomputeRelease(
    local.horseProfile,
    local.horseshoeChanges
  );

  return {
    ...local,
    rev: mergedRev,
    source: "merged",
    status: "conflict",
    conflicts,
    sources: {
      local: { ...local, conflicts: [], sources: undefined },
      central: { ...central, conflicts: [], sources: undefined },
    },
    trainingRelease,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 同步单条单子到中央档案。
 *
 * 流程：
 * 1. 若中央无此单 -> 直接写入（新单）。
 * 2. 若中央有此单 -> 三方合并判定：
 *    - 仅本机改过 -> 取本机
 *    - 仅中央改过 -> 取中央
 *    - 两边都改过 -> 留两份来源（merged）
 * 3. 幂等：同一单不重复计入。
 * 4. 失败：保留本地批次，标记 failed，待重试。
 */
export async function syncOrder(local: WorkOrder): Promise<SyncResult> {
  const central = getCentralOrder(local.id);

  // 幂等：中央已存在且未改过 -> 不重复计入
  if (central && isOrderAlreadyInCentral(local.id)) {
    const baseRev = getBaseRev(local.id);
    const localChanged = local.rev > baseRev;
    const centralChanged = central.rev > baseRev;

    if (!localChanged && !centralChanged) {
      return {
        orderId: local.id,
        outcome: "duplicate",
        message: "同一单已入库，跳过重复计入",
      };
    }

    // 两边都改过 -> 留两份来源
    if (localChanged && centralChanged) {
      const merged = mergeOrders(local, central);
      const writeResult = await writeOrderToCentral(merged);
      if (!writeResult.ok) {
        updateLocalOrder(local.id, {
          status: "failed",
          failCount: local.failCount + 1,
          lastError: writeResult.error,
        });
        return {
          orderId: local.id,
          outcome: "failed",
          message: `入库失败，保留本地批次待重试：${writeResult.error}`,
        };
      }
      markBaseRev(local.id, merged.rev);
      // 本机保留合并结果
      updateLocalOrder(local.id, {
        ...merged,
        status: "conflict",
      });
      return {
        orderId: local.id,
        outcome: "conflict",
        message: "两边都改过，已留两份来源，互不覆盖",
        conflicts: merged.conflicts,
      };
    }

    // 仅本机改过 -> 取本机
    if (localChanged) {
      const writeResult = await writeOrderToCentral(local);
      if (!writeResult.ok) {
        updateLocalOrder(local.id, {
          status: "failed",
          failCount: local.failCount + 1,
          lastError: writeResult.error,
        });
        return {
          orderId: local.id,
          outcome: "failed",
          message: `入库失败，保留本地批次待重试：${writeResult.error}`,
        };
      }
      markBaseRev(local.id, local.rev);
      updateLocalOrder(local.id, { status: "synced", syncedAt: new Date().toISOString() });
      return {
        orderId: local.id,
        outcome: "synced",
        message: "本机较新，已覆盖中央",
      };
    }

    // 仅中央改过 -> 取中央
    markBaseRev(local.id, central.rev);
    updateLocalOrder(local.id, { ...central, status: "synced" });
    return {
      orderId: local.id,
      outcome: "synced",
      message: "中央较新，已同步到本机",
    };
  }

  // 中央无此单 -> 直接写入
  const writeResult = await writeOrderToCentral(local);
  if (!writeResult.ok) {
    updateLocalOrder(local.id, {
      status: "failed",
      failCount: local.failCount + 1,
      lastError: writeResult.error,
    });
    return {
      orderId: local.id,
      outcome: "failed",
      message: `入库失败，保留本地批次待重试：${writeResult.error}`,
    };
  }
  if (writeResult.duplicate) {
    return {
      orderId: local.id,
      outcome: "duplicate",
      message: "同一单已入库，跳过重复计入",
    };
  }
  markBaseRev(local.id, local.rev);
  updateLocalOrder(local.id, { status: "synced", syncedAt: new Date().toISOString() });
  return {
    orderId: local.id,
    outcome: "synced",
    message: "已入库",
  };
}

/**
 * 同步全部待处理单子（恢复网络后重试）。
 *
 * 遍历本机所有 pending / failed 的单子，逐条同步。
 * 失败的单子保留本地批次，下次重试。
 */
export async function syncAllPending(): Promise<SyncResult[]> {
  const orders = loadLocalOrders().filter(
    (o) => o.status === "pending" || o.status === "failed"
  );
  const results: SyncResult[] = [];
  for (const order of orders) {
    const result = await syncOrder(order);
    results.push(result);
  }
  return results;
}

/**
 * 新建或更新一条单子到本机（断网暂存）。
 *
 * 任意子记录变更 -> 修订号递增。
 * 蹄铁类型变化 -> 训练放行失效重算。
 * 已同步的单子被编辑后，状态重置为 pending，等待重新合并。
 */
export function saveOrderLocally(order: WorkOrder): WorkOrder {
  const now = new Date().toISOString();
  const updated: WorkOrder = {
    ...order,
    rev: order.rev + 1,
    updatedAt: now,
    // 蹄铁类型变化后，训练放行失效重算
    trainingRelease: recomputeRelease(order.horseProfile, order.horseshoeChanges),
    // 编辑后重置为待同步，等待重新合并
    status: "pending",
  };
  appendLocalOrder(updated);
  return updated;
}

/**
 * 从本机移除已入库的单子（清理）。
 */
export function removeSyncedLocal(orderId: string): void {
  removeLocalOrder(orderId);
}
