// 领域模型：马匹档案、蹄位检查、蹄铁更换共用每匹马一个修订号序列

export type HoofPosition = "LF" | "RF" | "LH" | "RH";

export const POSITIONS: HoofPosition[] = ["LF", "RF", "LH", "RH"];

export const POSITION_LABEL: Record<HoofPosition, string> = {
  LF: "左前蹄",
  RF: "右前蹄",
  LH: "左后蹄",
  RH: "右后蹄",
};

export const SHOE_TYPES = [
  "钢蹄铁",
  "铝蹄铁",
  "加护蹄垫钢蹄铁",
  "橡胶蹄铁",
  "裸蹄（去铁）",
];

/** 马匹档案（每匹马一份，可被本机/中央分别修改 → 可能冲突） */
export interface HorseProfile {
  horseId: string;
  name: string;
  status: "运动马" | "休养马";
  gaitIssue: string; // 步态问题
  hoofShape: string; // 蹄形评估
  updatedAt: string; // ISO 时间
  rev: number; // 共享修订号：本档案最近一次变更消耗的马匹修订号
}

/** 蹄位检查记录（追加式，不改写历史） */
export interface HoofCheck {
  id: string;
  horseId: string;
  position: HoofPosition;
  gaitAbnormal: boolean; // 异常步态标记
  assessment: string; // 蹄形评估/检查结论
  photoNote: string; // 照片备注
  checkedAt: string;
  rev: number;
}

/** 蹄铁更换记录（追加式，含钉位与照片备注，历史可查） */
export interface ShoeChange {
  id: string;
  horseId: string;
  position: HoofPosition;
  shoeType: string; // 蹄铁类型
  typeChanged: boolean; // 相对上一次同蹄位是否更换了蹄铁类型
  nailPattern: string; // 钉位
  changedAt: string; // 修蹄日期
  nextDue: string; // 下次复查日期
  photoNote: string; // 照片备注
  rev: number;
}

/** 出站操作：一单一个幂等键 */
export type OpKind = "profile.update" | "check.add" | "shoe.add";

export interface Op {
  opId: string; // 幂等键：同一单不重复计入
  kind: OpKind;
  horseId: string;
  rev: number; // 本操作消耗的马匹共享修订号
  payload: HorseProfile | HoofCheck | ShoeChange;
  createdAt: string;
}

/** 待入库批次：入库失败整批保留，恢复网络后重试 */
export interface Batch {
  batchId: string;
  ops: Op[];
  attempts: number;
  lastError: string | null;
  createdAt: string;
}

/** 冲突：两边都改过同一档案 → 两份来源都留，互不覆盖 */
export interface Conflict {
  id: string;
  horseId: string;
  entity: "profile";
  localRev: number;
  centralRev: number;
  localSnapshot: HorseProfile; // 来源一：本机
  centralSnapshot: HorseProfile; // 来源二：中央
  detectedAt: string;
  resolution: null | {
    strategy: "keep-local" | "keep-central" | "keep-both";
    at: string;
  };
}

/** 训练放行失效事件：蹄铁类型变更 → 旧放行失效重算 */
export interface ClearanceEvent {
  id: string;
  horseId: string;
  position: HoofPosition;
  reason: string;
  at: string;
  rev: number;
}

export interface MigrationEntry {
  at: string;
  note: string;
}

/** 本机库（断网时的工作副本 + 出站队列） */
export interface LocalDB {
  schemaVersion: number;
  horses: Record<string, HorseProfile>;
  checks: Record<string, HoofCheck>;
  shoes: Record<string, ShoeChange>;
  revCounter: Record<string, number>; // 每匹马的共享修订号计数器
  syncedRev: Record<string, number>; // 上次与中央一致时的修订号（合并共同祖先）
  outbox: Batch[]; // 待入库批次
  conflicts: Conflict[];
  clearanceLog: ClearanceEvent[];
  migrations: MigrationEntry[];
  lastSyncAt: string | null;
}

/** 中央档案（模拟场部服务器）：appliedOps 保证同一单不重复计入 */
export interface CentralDB {
  schemaVersion: number;
  horses: Record<string, HorseProfile>;
  checks: Record<string, HoofCheck>;
  shoes: Record<string, ShoeChange>;
  revCounter: Record<string, number>;
  appliedOps: string[];
}

export const CURRENT_SCHEMA = 2;

export function uid(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}
