// 回场合并：出站批次幂等入库 → 中央变更并回本机 → 双方都改过的档案留两份来源

import {
  Batch,
  CentralDB,
  Conflict,
  HorseProfile,
  LocalDB,
  Op,
  nowISO,
  uid,
} from "../types";

export interface SyncReport {
  ok: boolean;
  online: boolean;
  notes: string[];
  pushedOps: number;
  skippedOps: number; // 幂等跳过：同一单不重复计入
  pulledRecords: number;
  conflictsFound: number;
  failedBatchId: string | null;
}

function profileSame(a: HorseProfile, b: HorseProfile): boolean {
  return (
    a.name === b.name &&
    a.status === b.status &&
    a.gaitIssue === b.gaitIssue &&
    a.hoofShape === b.hoofShape
  );
}

function openConflict(db: LocalDB, horseId: string): Conflict | undefined {
  return db.conflicts.find((c) => c.horseId === horseId && !c.resolution);
}

/** 该马匹在两侧所有记录里出现过的最大修订号 */
function maxRevOf(local: LocalDB, central: CentralDB, horseId: string): number {
  let max = 0;
  const consider = (rev?: number) => {
    if (rev && rev > max) max = rev;
  };
  consider(local.revCounter[horseId]);
  consider(central.revCounter[horseId]);
  for (const db of [local, central]) {
    consider(db.horses[horseId]?.rev);
    for (const c of Object.values(db.checks)) if (c.horseId === horseId) consider(c.rev);
    for (const s of Object.values(db.shoes)) if (s.horseId === horseId) consider(s.rev);
  }
  return max;
}

/** 单条操作入库：opId 幂等，同一单不重复计入；返回 "applied" | "skipped" */
function applyOp(central: CentralDB, op: Op): "applied" | "skipped" {
  if (central.appliedOps.includes(op.opId)) return "skipped";
  if (op.kind === "profile.update") {
    const p = op.payload as HorseProfile;
    central.horses[p.horseId] = structuredClone(p);
  } else if (op.kind === "check.add") {
    const c = op.payload as LocalDB["checks"][string];
    central.checks[c.id] = structuredClone(c);
  } else {
    const s = op.payload as LocalDB["shoes"][string];
    central.shoes[s.id] = structuredClone(s);
  }
  const rev = op.rev;
  if ((central.revCounter[op.horseId] ?? 0) < rev) central.revCounter[op.horseId] = rev;
  central.appliedOps.push(op.opId);
  return "applied";
}

export interface SyncOptions {
  failMode: boolean; // 模拟"入库后响应丢失"：中央已记账，本机视为失败，批次保留待重试
}

export function syncNow(
  prevLocal: LocalDB,
  prevCentral: CentralDB,
  opts: SyncOptions
): { local: LocalDB; central: CentralDB; report: SyncReport } {
  const local = structuredClone(prevLocal);
  const central = structuredClone(prevCentral);
  const report: SyncReport = {
    ok: true,
    online: true,
    notes: [],
    pushedOps: 0,
    skippedOps: 0,
    pulledRecords: 0,
    conflictsFound: 0,
    failedBatchId: null,
  };

  /* 1) 中央新增的检查/换蹄并回本机（追加式记录按 id 求并集，天然幂等） */
  for (const [id, c] of Object.entries(central.checks)) {
    if (!local.checks[id]) {
      local.checks[id] = structuredClone(c);
      report.pulledRecords += 1;
    }
  }
  for (const [id, s] of Object.entries(central.shoes)) {
    if (!local.shoes[id]) {
      local.shoes[id] = structuredClone(s);
      report.pulledRecords += 1;
    }
  }

  /* 2) 档案三方合并：syncedRev 为共同祖先，两边都改过 → 留两份来源 */
  const horseIds = new Set([...Object.keys(local.horses), ...Object.keys(central.horses)]);
  for (const horseId of horseIds) {
    const base = local.syncedRev[horseId] ?? 0;
    const lp = local.horses[horseId];
    const cp = central.horses[horseId];
    if (!lp && cp) {
      local.horses[horseId] = structuredClone(cp);
      report.pulledRecords += 1;
      continue;
    }
    if (!cp || !lp) continue; // 仅本机有 → 等出站批次推过去
    const localDirty = lp.rev > base;
    const centralDirty = cp.rev > base;
    if (localDirty && centralDirty) {
      if (profileSame(lp, cp)) continue; // 同一笔变更的幂等重放，自动收敛
      if (!openConflict(local, horseId)) {
        local.conflicts.push({
          id: uid("conflict"),
          horseId,
          entity: "profile",
          localRev: lp.rev,
          centralRev: cp.rev,
          localSnapshot: structuredClone(lp), // 来源一：本机
          centralSnapshot: structuredClone(cp), // 来源二：中央
          detectedAt: nowISO(),
          resolution: null,
        });
        report.conflictsFound += 1;
        report.notes.push(
          `冲突：${horseId} 档案本机与中央都改过（本机 rev${lp.rev} / 中央 rev${cp.rev}），两份来源均已保留，互不覆盖`
        );
      }
    } else if (centralDirty) {
      local.horses[horseId] = structuredClone(cp); // 只有中央改 → 并回本机
      report.pulledRecords += 1;
    }
    // 只有本机改 → 由下方出站批次推入中央
  }

  /* 3) 出站批次按序入库；失败则整批保留，停止后续批次，恢复网络后重试 */
  const remaining: Batch[] = [];
  for (const batch of local.outbox) {
    if (report.failedBatchId) {
      remaining.push(batch); // 前批失败，后续批次原样保留
      continue;
    }
    const keptOps: Op[] = [];
    for (const op of batch.ops) {
      // 未解决的冲突档案暂不推送，等人工裁决，避免覆盖中央来源
      if (op.kind === "profile.update" && openConflict(local, op.horseId)) {
        keptOps.push(op);
        continue;
      }
      const result = applyOp(central, op);
      if (result === "applied") report.pushedOps += 1;
      else report.skippedOps += 1;
    }
    if (keptOps.length > 0) {
      remaining.push({ ...batch, ops: keptOps });
      continue;
    }
    if (opts.failMode) {
      // 入库已记账但响应丢失：批次保留，重试时靠 opId 幂等跳过
      report.failedBatchId = batch.batchId;
      report.ok = false;
      report.notes.push(
        `批次 ${batch.batchId} 入库响应丢失（模拟）：${batch.ops.length} 单已保留在本机，恢复网络后重试，同一单不会重复计入`
      );
      remaining.push({
        ...batch,
        attempts: batch.attempts + 1,
        lastError: "入库响应丢失（模拟失败），待重试",
      });
    }
  }
  local.outbox = remaining;

  /* 4) 对齐修订号基准：无未决冲突的马匹，共同祖先推进到两侧最大修订号 */
  for (const horseId of horseIds) {
    if (openConflict(local, horseId)) continue;
    const max = maxRevOf(local, central, horseId);
    local.syncedRev[horseId] = max;
    local.revCounter[horseId] = Math.max(local.revCounter[horseId] ?? 0, max);
    central.revCounter[horseId] = Math.max(central.revCounter[horseId] ?? 0, max);
  }

  local.lastSyncAt = nowISO();
  if (report.ok) {
    report.notes.push(
      `合并完成：入库 ${report.pushedOps} 单` +
        (report.skippedOps ? `，幂等跳过 ${report.skippedOps} 单` : "") +
        (report.pulledRecords ? `，并回中央记录 ${report.pulledRecords} 条` : "") +
        (report.conflictsFound ? `，新冲突 ${report.conflictsFound} 起` : "")
    );
  }
  return { local, central, report };
}

/** 冲突裁决：三种策略都不丢来源，快照永久留在冲突记录里 */
export function resolveConflict(
  prevLocal: LocalDB,
  prevCentral: CentralDB,
  conflictId: string,
  strategy: "keep-local" | "keep-central" | "keep-both"
): { local: LocalDB; central: CentralDB } {
  const local = structuredClone(prevLocal);
  const central = structuredClone(prevCentral);
  const conflict = local.conflicts.find((c) => c.id === conflictId);
  if (!conflict || conflict.resolution) return { local: prevLocal, central: prevCentral };
  const horseId = conflict.horseId;

  if (strategy === "keep-local") {
    central.horses[horseId] = structuredClone(local.horses[horseId]);
  } else if (strategy === "keep-central") {
    local.horses[horseId] = structuredClone(central.horses[horseId]);
  }
  // keep-both：两侧各自保留，互不覆盖；两份来源留在冲突记录中
  if (strategy !== "keep-local") {
    // 丢弃本机待推的档案单，避免下次同步把另一来源冲掉
    for (const batch of local.outbox) {
      batch.ops = batch.ops.filter(
        (op) => !(op.kind === "profile.update" && op.horseId === horseId)
      );
    }
    local.outbox = local.outbox.filter((b) => b.ops.length > 0);
  }
  conflict.resolution = { strategy, at: nowISO() };
  const max = maxRevOf(local, central, horseId);
  local.syncedRev[horseId] = max;
  local.revCounter[horseId] = Math.max(local.revCounter[horseId] ?? 0, max);
  central.revCounter[horseId] = Math.max(central.revCounter[horseId] ?? 0, max);
  return { local, central };
}

/* -------- 演示工具：模拟场部（中央端）独立改动，用于制造"两边都改过" -------- */

export function simulateCentralProfileEdit(
  prevCentral: CentralDB,
  horseId: string
): CentralDB {
  const central = structuredClone(prevCentral);
  const p = central.horses[horseId];
  if (!p) return prevCentral;
  const rev = (central.revCounter[horseId] ?? 0) + 1;
  central.revCounter[horseId] = rev;
  central.horses[horseId] = {
    ...p,
    gaitIssue: p.gaitIssue ? `${p.gaitIssue}（场部复核）` : "场部补录步态观察",
    status: p.status === "运动马" ? "休养马" : "运动马",
    updatedAt: nowISO(),
    rev,
  };
  return central;
}

export function simulateCentralCheck(prevCentral: CentralDB, horseId: string): CentralDB {
  const central = structuredClone(prevCentral);
  if (!central.horses[horseId]) return prevCentral;
  const rev = (central.revCounter[horseId] ?? 0) + 1;
  central.revCounter[horseId] = rev;
  const id = uid("check");
  central.checks[id] = {
    id,
    horseId,
    position: "RF",
    gaitAbnormal: false,
    assessment: "场部复查：步态正常（中央端录入）",
    photoNote: "场部拍照归档",
    checkedAt: nowISO().slice(0, 10),
    rev,
  };
  return central;
}
