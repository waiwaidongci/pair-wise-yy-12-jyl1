/**
 * 训练放行失效重算
 *
 * 规则：蹄铁类型变化后，旧训练放行失效，需要按新蹄铁类型重新计算放行状态。
 * 不同蹄铁类型对应不同的放行判定（例如：铝蹄铁可直接放行，加护蹄垫需教练复核，
 * 运动马需更严格的检查）。
 */
import type { HorseProfile, HorseshoeChange, TrainingRelease } from "../types";

/** 蹄铁类型 -> 训练放行规则 */
interface ReleaseRule {
  /** 是否放行 */
  released: boolean;
  /** 放行 / 失效原因 */
  reason: string;
}

/**
 * 按蹄铁类型判定训练放行。
 *
 * 这里是一个可扩展的规则表，实际业务可替换为后端规则引擎。
 */
const RELEASE_RULES: Record<string, ReleaseRule> = {
  铝蹄铁: { released: true, reason: "铝蹄铁标准蹄型，放行训练" },
  钢蹄铁: { released: true, reason: "钢蹄铁耐磨，放行训练" },
  加护蹄垫: { released: false, reason: "加护蹄垫需教练复核后放行" },
  蹄铁脱落: { released: false, reason: "蹄铁脱落，暂停训练并重装" },
  蹄裂防护: { released: false, reason: "蹄裂防护期，暂停训练" },
};

const DEFAULT_RULE: ReleaseRule = {
  released: false,
  reason: "未知蹄铁类型，需技师复核后放行",
};

/**
 * 取当前生效的蹄铁类型（取最近一次蹄铁更换的类型）。
 */
export function currentHorseshoeType(
  changes: HorseshoeChange[]
): string {
  if (changes.length === 0) return "未装蹄铁";
  const sorted = [...changes].sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime()
  );
  return sorted[0].horseshoeType;
}

/**
 * 重算训练放行。
 *
 * 当蹄铁类型变化后调用：基于最新蹄铁类型重新判定放行状态，
 * 并记录重算时间与依据类型。
 */
export function recomputeRelease(
  horseProfile: HorseProfile,
  changes: HorseshoeChange[],
  now: Date = new Date()
): TrainingRelease {
  const horseshoeType = currentHorseshoeType(changes);
  const rule = RELEASE_RULES[horseshoeType] ?? DEFAULT_RULE;

  // 运动马额外校验：有异常步态标记则不放行
  const hasAbnormalGait = horseProfile.gaitIssues.length > 0;
  let released = rule.released;
  let reason = rule.reason;
  if (released && horseProfile.type === "运动马" && hasAbnormalGait) {
    released = false;
    reason = "运动马存在步态问题，需教练复核后放行";
  }

  return {
    released,
    reason,
    computedAt: now.toISOString(),
    basedOnHorseshoeType: horseshoeType,
  };
}

/**
 * 判断训练放行是否已失效。
 *
 * 失效条件：放行所依据的蹄铁类型 与 当前蹄铁类型不一致。
 */
export function isReleaseInvalid(
  release: TrainingRelease,
  changes: HorseshoeChange[]
): boolean {
  const currentType = currentHorseshoeType(changes);
  return release.basedOnHorseshoeType !== currentType;
}
