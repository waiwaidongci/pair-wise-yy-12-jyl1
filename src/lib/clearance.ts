// 训练放行：由"最新蹄位检查 + 最新蹄铁更换"推导，蹄铁类型一变旧放行即失效重算

import {
  HoofCheck,
  HoofPosition,
  LocalDB,
  POSITIONS,
  POSITION_LABEL,
  ShoeChange,
} from "../types";

export type ClearanceState = "放行" | "待复查" | "异常停训" | "无记录";

export interface PositionClearance {
  position: HoofPosition;
  state: ClearanceState;
  reason: string;
}

function latestBy<T extends { id: string }>(
  table: Record<string, T>,
  horseId: string,
  position: HoofPosition,
  timeOf: (r: T) => string
): T | null {
  let best: T | null = null;
  for (const r of Object.values(table)) {
    const rec = r as T & { horseId: string; position: HoofPosition };
    if (rec.horseId !== horseId || rec.position !== position) continue;
    if (!best || timeOf(rec as T) > timeOf(best)) best = rec as T;
  }
  return best;
}

export function latestCheck(
  db: Pick<LocalDB, "checks">,
  horseId: string,
  position: HoofPosition
): HoofCheck | null {
  return latestBy(db.checks, horseId, position, (c) => (c as HoofCheck).checkedAt);
}

export function latestShoe(
  db: Pick<LocalDB, "shoes">,
  horseId: string,
  position: HoofPosition
): ShoeChange | null {
  return latestBy(db.shoes, horseId, position, (s) => (s as ShoeChange).changedAt);
}

/** 单蹄位放行状态 */
export function positionClearance(
  db: Pick<LocalDB, "checks" | "shoes">,
  horseId: string,
  position: HoofPosition
): PositionClearance {
  const check = latestCheck(db, horseId, position);
  const shoe = latestShoe(db, horseId, position);
  const label = POSITION_LABEL[position];

  if (!check && !shoe) {
    return { position, state: "无记录", reason: `${label}尚无检查与换蹄记录` };
  }
  // 最新事件是异常检查 → 停训
  if (
    check?.gaitAbnormal &&
    (!shoe || check.checkedAt >= shoe.changedAt)
  ) {
    return {
      position,
      state: "异常停训",
      reason: `${label}最近检查标记异常步态（${check.checkedAt.slice(0, 10)}）`,
    };
  }
  // 蹄铁类型变更后还没有新的正常检查 → 旧放行失效，待重算
  if (shoe?.typeChanged && (!check || check.checkedAt < shoe.changedAt)) {
    return {
      position,
      state: "待复查",
      reason: `${label}蹄铁类型变更为「${shoe.shoeType}」，旧训练放行失效，需重新检查`,
    };
  }
  if (check && !check.gaitAbnormal) {
    return { position, state: "放行", reason: `${label}最近检查正常` };
  }
  return { position, state: "待复查", reason: `${label}缺少换蹄后的复查记录` };
}

/** 整匹马四个蹄位 */
export function horseClearance(
  db: Pick<LocalDB, "checks" | "shoes">,
  horseId: string
): PositionClearance[] {
  return POSITIONS.map((p) => positionClearance(db, horseId, p));
}

/** 整匹马是否可进训练名单：四蹄均放行 */
export function horseCleared(
  db: Pick<LocalDB, "checks" | "shoes">,
  horseId: string
): boolean {
  return horseClearance(db, horseId).every((c) => c.state === "放行");
}

/** 复查提醒：取每蹄位最近一次换蹄的下次复查日期 */
export interface DueItem {
  horseId: string;
  position: HoofPosition;
  nextDue: string;
  overdue: boolean;
}

export function dueList(db: Pick<LocalDB, "shoes" | "horses">): DueItem[] {
  const items: DueItem[] = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const horseId of Object.keys(db.horses)) {
    for (const position of POSITIONS) {
      const shoe = latestShoe(db, horseId, position);
      if (!shoe || !shoe.nextDue) continue;
      items.push({
        horseId,
        position,
        nextDue: shoe.nextDue,
        overdue: shoe.nextDue < today,
      });
    }
  }
  return items.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
}
