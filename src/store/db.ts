// 持久化：本机库 + 模拟中央档案；升级时旧数据无修订号 → 按时间序回填

import {
  Batch,
  CentralDB,
  CURRENT_SCHEMA,
  ClearanceEvent,
  Conflict,
  HoofCheck,
  HorseProfile,
  LocalDB,
  MigrationEntry,
  ShoeChange,
  nowISO,
} from "../types";

const LOCAL_KEY = "farrier.local";
const CENTRAL_KEY = "farrier.central";

function emptyLocal(): LocalDB {
  return {
    schemaVersion: CURRENT_SCHEMA,
    horses: {},
    checks: {},
    shoes: {},
    revCounter: {},
    syncedRev: {},
    outbox: [],
    conflicts: [],
    clearanceLog: [],
    migrations: [],
    lastSyncAt: null,
  };
}

function emptyCentral(): CentralDB {
  return {
    schemaVersion: CURRENT_SCHEMA,
    horses: {},
    checks: {},
    shoes: {},
    revCounter: {},
    appliedOps: [],
  };
}

/* ---------------- 旧版（v1）种子数据：没有修订号，模拟升级前的历史档案 ---------------- */

interface LegacyHorse {
  horseId: string;
  name: string;
  status: "运动马" | "休养马";
  gaitIssue: string;
  hoofShape: string;
  updatedAt: string;
}
interface LegacyCheck {
  id: string;
  horseId: string;
  position: HoofCheck["position"];
  gaitAbnormal: boolean;
  assessment: string;
  photoNote: string;
  checkedAt: string;
}
interface LegacyShoe {
  id: string;
  horseId: string;
  position: ShoeChange["position"];
  shoeType: string;
  nailPattern: string;
  changedAt: string;
  nextDue: string;
  photoNote: string;
}

function legacySeed() {
  const horses: LegacyHorse[] = [
    {
      horseId: "HORSE-18",
      name: "追风",
      status: "运动马",
      gaitIssue: "右前蹄外侧磨耗",
      hoofShape: "蹄壁薄、外侧偏低",
      updatedAt: "2026-09-10T08:30:00.000Z",
    },
    {
      horseId: "HORSE-27",
      name: "乌云",
      status: "休养马",
      gaitIssue: "左后蹄蹄壁裂纹",
      hoofShape: "蹄踵窄、蹄壁干燥",
      updatedAt: "2026-09-15T09:00:00.000Z",
    },
    {
      horseId: "HORSE-31",
      name: "小满",
      status: "运动马",
      gaitIssue: "步态轻微不稳",
      hoofShape: "四蹄形态正常",
      updatedAt: "2026-09-20T10:00:00.000Z",
    },
  ];
  const shoes: LegacyShoe[] = [
    {
      id: "shoe-legacy-1",
      horseId: "HORSE-18",
      position: "RF",
      shoeType: "钢蹄铁",
      nailPattern: "外侧4钉·内侧3钉",
      changedAt: "2026-08-20",
      nextDue: "2026-09-20",
      photoNote: "换前拍照：外侧磨耗明显",
    },
    {
      id: "shoe-legacy-2",
      horseId: "HORSE-18",
      position: "RF",
      shoeType: "铝蹄铁",
      nailPattern: "外侧4钉·内侧4钉",
      changedAt: "2026-09-10",
      nextDue: "2026-10-08",
      photoNote: "改铝蹄铁减重，钉位照片已归档",
    },
    {
      id: "shoe-legacy-3",
      horseId: "HORSE-27",
      position: "LH",
      shoeType: "加护蹄垫钢蹄铁",
      nailPattern: "裂纹两侧各2钉·避开裂线",
      changedAt: "2026-09-15",
      nextDue: "2026-10-13",
      photoNote: "裂纹处特写照片归档",
    },
    {
      id: "shoe-legacy-4",
      horseId: "HORSE-31",
      position: "LF",
      shoeType: "铝蹄铁",
      nailPattern: "标准每侧4钉",
      changedAt: "2026-09-20",
      nextDue: "2026-10-18",
      photoNote: "装蹄后正面/侧面照",
    },
  ];
  const checks: LegacyCheck[] = [
    {
      id: "check-legacy-1",
      horseId: "HORSE-18",
      position: "RF",
      gaitAbnormal: false,
      assessment: "换铝蹄铁后步幅正常，磨耗改善",
      photoNote: "慢步视频截图3张",
      checkedAt: "2026-09-11",
    },
    {
      id: "check-legacy-2",
      horseId: "HORSE-27",
      position: "LH",
      gaitAbnormal: true,
      assessment: "裂纹未见扩展，但负重步态谨慎",
      photoNote: "裂纹复查照片已拍",
      checkedAt: "2026-09-16",
    },
    {
      id: "check-legacy-3",
      horseId: "HORSE-31",
      position: "LF",
      gaitAbnormal: true,
      assessment: "左前蹄落地外旋，建议教练复核",
      photoNote: "侧面视频截图已标记",
      checkedAt: "2026-09-28",
    },
  ];
  return { schemaVersion: 1, horses, shoes, checks };
}

/* ---------------- 迁移：v1 → v2，回填共享修订号与 typeChanged ---------------- */

function migrateLocal(raw: unknown): { db: LocalDB; notes: string[] } {
  const notes: string[] = [];
  if (
    raw &&
    typeof raw === "object" &&
    (raw as LocalDB).schemaVersion === CURRENT_SCHEMA
  ) {
    return { db: raw as LocalDB, notes };
  }
  const legacy = (raw ?? legacySeed()) as ReturnType<typeof legacySeed>;
  const db = emptyLocal();
  let recordCount = 0;

  for (const h of legacy.horses) {
    // 每匹马一个共享修订号序列：档案、检查、换蹄按时间先后消耗同一序列
    const events: { at: string; apply: (rev: number) => void }[] = [];
    events.push({
      at: h.updatedAt,
      apply: (rev) => {
        db.horses[h.horseId] = { ...h, rev };
      },
    });
    for (const s of legacy.shoes.filter((x) => x.horseId === h.horseId)) {
      events.push({
        at: s.changedAt,
        apply: (rev) => {
          const prev = Object.values(db.shoes)
            .filter(
              (x) => x.horseId === s.horseId && x.position === s.position
            )
            .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
            .pop();
          db.shoes[s.id] = {
            ...s,
            typeChanged: prev ? prev.shoeType !== s.shoeType : false,
            rev,
          };
        },
      });
    }
    for (const c of legacy.checks.filter((x) => x.horseId === h.horseId)) {
      events.push({
        at: c.checkedAt,
        apply: (rev) => {
          db.checks[c.id] = { ...c, rev };
        },
      });
    }
    events.sort((a, b) => a.at.localeCompare(b.at));
    let rev = 0;
    for (const e of events) {
      rev += 1;
      e.apply(rev);
      recordCount += 1;
    }
    db.revCounter[h.horseId] = rev;
    db.syncedRev[h.horseId] = rev; // 迁移时点视为本机与中央一致
  }

  const note = `v1→v2 升级：旧数据无修订号，已按时间序回填共享修订号（马匹 ${legacy.horses.length} 匹 / 记录 ${recordCount} 条），并补算蹄铁类型变更标记`;
  notes.push(note);
  db.migrations.push({ at: nowISO(), note });
  return { db, notes };
}

/* ---------------- 读写 ---------------- */

export function loadLocal(): LocalDB {
  let raw: unknown = null;
  try {
    const text = localStorage.getItem(LOCAL_KEY);
    if (text) raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  const { db } = migrateLocal(raw);
  saveLocal(db);
  return db;
}

export function saveLocal(db: LocalDB): void {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(db));
}

export function loadCentral(): CentralDB {
  try {
    const text = localStorage.getItem(CENTRAL_KEY);
    if (text) {
      const parsed = JSON.parse(text) as CentralDB;
      if (parsed.schemaVersion === CURRENT_SCHEMA) return parsed;
    }
  } catch {
    /* 重新初始化 */
  }
  // 中央档案初始为迁移后本机库的一致副本
  const local = loadLocal();
  const central: CentralDB = {
    ...emptyCentral(),
    horses: structuredClone(local.horses),
    checks: structuredClone(local.checks),
    shoes: structuredClone(local.shoes),
    revCounter: { ...local.revCounter },
  };
  saveCentral(central);
  return central;
}

export function saveCentral(db: CentralDB): void {
  localStorage.setItem(CENTRAL_KEY, JSON.stringify(db));
}

export function resetAll(): void {
  localStorage.removeItem(LOCAL_KEY);
  localStorage.removeItem(CENTRAL_KEY);
}

export type {
  Batch,
  CentralDB,
  ClearanceEvent,
  Conflict,
  HoofCheck,
  HorseProfile,
  LocalDB,
  MigrationEntry,
  ShoeChange,
};
