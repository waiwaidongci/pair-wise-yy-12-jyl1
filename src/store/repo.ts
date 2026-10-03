// 本机变更：断网也能记。每次变更消耗马匹共享修订号，并作为"一单"进入待入库批次

import { latestShoe } from "../lib/clearance";
import {
  HoofPosition,
  HorseProfile,
  LocalDB,
  Op,
  POSITION_LABEL,
  nowISO,
  uid,
} from "../types";

/** 取下一个共享修订号：档案/蹄位检查/蹄铁更换共用同一序列 */
function nextRev(db: LocalDB, horseId: string): number {
  const rev = (db.revCounter[horseId] ?? 0) + 1;
  db.revCounter[horseId] = rev;
  return rev;
}

/** 追加到待入库批次：从未尝试过的末尾批次可继续装单，失败过的批次原样保留等待重试 */
function enqueue(db: LocalDB, op: Op): void {
  const last = db.outbox[db.outbox.length - 1];
  if (last && last.attempts === 0 && !last.lastError) {
    last.ops.push(op);
  } else {
    db.outbox.push({
      batchId: uid("batch"),
      ops: [op],
      attempts: 0,
      lastError: null,
      createdAt: nowISO(),
    });
  }
}

export function updateProfile(
  prev: LocalDB,
  horseId: string,
  patch: Partial<Omit<HorseProfile, "horseId" | "rev" | "updatedAt">>
): LocalDB {
  const db = structuredClone(prev);
  const old = db.horses[horseId];
  if (!old) return prev;
  const rev = nextRev(db, horseId);
  const profile: HorseProfile = { ...old, ...patch, horseId, rev, updatedAt: nowISO() };
  db.horses[horseId] = profile;
  enqueue(db, {
    opId: uid("op"),
    kind: "profile.update",
    horseId,
    rev,
    payload: profile,
    createdAt: nowISO(),
  });
  return db;
}

export function addHorse(
  prev: LocalDB,
  input: { name: string; status: "运动马" | "休养马" }
): { db: LocalDB; horseId: string } {
  const db = structuredClone(prev);
  const n = Object.keys(db.horses).length + 1;
  const horseId = `HORSE-${String(31 + n).padStart(2, "0")}-${uid("h").slice(2, 6)}`;
  const rev = nextRev(db, horseId);
  const profile: HorseProfile = {
    horseId,
    name: input.name || horseId,
    status: input.status,
    gaitIssue: "",
    hoofShape: "",
    updatedAt: nowISO(),
    rev,
  };
  db.horses[horseId] = profile;
  enqueue(db, {
    opId: uid("op"),
    kind: "profile.update",
    horseId,
    rev,
    payload: profile,
    createdAt: nowISO(),
  });
  return { db, horseId };
}

export function addHoofCheck(
  prev: LocalDB,
  input: {
    horseId: string;
    position: HoofPosition;
    gaitAbnormal: boolean;
    assessment: string;
    photoNote: string;
    checkedAt: string;
  }
): LocalDB {
  const db = structuredClone(prev);
  const rev = nextRev(db, input.horseId);
  const check = {
    id: uid("check"),
    horseId: input.horseId,
    position: input.position,
    gaitAbnormal: input.gaitAbnormal,
    assessment: input.assessment,
    photoNote: input.photoNote,
    checkedAt: input.checkedAt,
    rev,
  };
  db.checks[check.id] = check;
  enqueue(db, {
    opId: uid("op"),
    kind: "check.add",
    horseId: input.horseId,
    rev,
    payload: check,
    createdAt: nowISO(),
  });
  return db;
}

export function addShoeChange(
  prev: LocalDB,
  input: {
    horseId: string;
    position: HoofPosition;
    shoeType: string;
    nailPattern: string;
    changedAt: string;
    nextDue: string;
    photoNote: string;
  }
): LocalDB {
  const db = structuredClone(prev);
  const rev = nextRev(db, input.horseId);
  const prevShoe = latestShoe(db, input.horseId, input.position);
  const typeChanged = prevShoe ? prevShoe.shoeType !== input.shoeType : false;
  const shoe = {
    id: uid("shoe"),
    horseId: input.horseId,
    position: input.position,
    shoeType: input.shoeType,
    typeChanged,
    nailPattern: input.nailPattern,
    changedAt: input.changedAt,
    nextDue: input.nextDue,
    photoNote: input.photoNote,
    rev,
  };
  db.shoes[shoe.id] = shoe;
  // 蹄铁类型变化 → 旧训练放行失效，记录事件等待重算
  if (typeChanged && prevShoe) {
    db.clearanceLog.push({
      id: uid("ce"),
      horseId: input.horseId,
      position: input.position,
      reason: `${POSITION_LABEL[input.position]}蹄铁类型变更：${prevShoe.shoeType} → ${input.shoeType}，旧训练放行失效，需重新检查后重算`,
      at: nowISO(),
      rev,
    });
  }
  enqueue(db, {
    opId: uid("op"),
    kind: "shoe.add",
    horseId: input.horseId,
    rev,
    payload: shoe,
    createdAt: nowISO(),
  });
  return db;
}
