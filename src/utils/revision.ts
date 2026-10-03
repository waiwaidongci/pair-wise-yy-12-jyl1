/**
 * 修订号工具
 *
 * 马匹档案、蹄位检查、蹄铁更换共用同一个修订号（rev）。
 * 任意子记录变更，整张单子 rev 递增。
 */
import type { WorkOrder } from "../types";

/** 初始修订号 */
export const INITIAL_REV = 1;

/**
 * 推进修订号。
 * 任意子记录（马匹档案 / 蹄位检查 / 蹄铁更换）变更后调用。
 */
export function bumpRev(order: WorkOrder): number {
  return order.rev + 1;
}

/**
 * 判断两份单子是否基于同一修订号（用于合并判据）。
 */
export function sameRev(a: WorkOrder, b: WorkOrder): boolean {
  return a.rev === b.rev;
}

/**
 * 取较高修订号（合并时以高修订号为准）。
 */
export function higherRev(a: WorkOrder, b: WorkOrder): number {
  return Math.max(a.rev, b.rev);
}

/**
 * 生成订单号（幂等键）。
 * 格式：WO-YYYYMMDD-HHMMSS-xxxx
 */
export function generateOrderId(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart =
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "-" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WO-${datePart}-${rand}`;
}

/**
 * 生成批次号。
 * 格式：BATCH-YYYYMMDD-HHMMSS-xxxx
 */
export function generateBatchId(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart =
    now.getFullYear() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    "-" +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BATCH-${datePart}-${rand}`;
}

/**
 * 生成通用 ID（蹄位检查 / 蹄铁更换 / 照片备注）。
 */
export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
