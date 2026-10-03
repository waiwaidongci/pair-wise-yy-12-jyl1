/**
 * 中央档案（模拟服务端）
 *
 * 实际业务中这是后端数据库。这里用 localStorage 模拟，
 * 并提供网络延迟与入库失败开关，便于演示断网 / 重试 / 幂等。
 */
import type { CentralArchive, WorkOrder } from "../types";
import { backfillOrders } from "../utils/migration";

const CENTRAL_KEY = "farrier_central_archive_v1";

/** 模拟网络延迟（毫秒） */
const NETWORK_LATENCY_MS = 350;

/**
 * 模拟入库失败开关。
 * 读取 localStorage 标志，便于演示"入库失败后保留本地批次，恢复网络重试"。
 */
function isFailureSimulated(): boolean {
  try {
    return localStorage.getItem("farrier_simulate_failure") === "1";
  } catch {
    return false;
  }
}

/** 设置 / 清除入库失败模拟 */
export function setFailureSimulated(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem("farrier_simulate_failure", "1");
    } else {
      localStorage.removeItem("farrier_simulate_failure");
    }
  } catch {
    // ignore
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 读取中央档案（自动回填缺失修订号） */
export function loadCentralArchive(): CentralArchive {
  const raw = (() => {
    try {
      const text = localStorage.getItem(CENTRAL_KEY);
      if (!text) return { orders: {}, batches: {}, lastSyncAt: "" };
      return JSON.parse(text) as CentralArchive;
    } catch {
      return { orders: {}, batches: {}, lastSyncAt: "" };
    }
  })();

  // 回填缺失修订号
  const orderList = Object.values(raw.orders ?? {});
  const { orders } = backfillOrders(orderList);
  const ordersMap: Record<string, WorkOrder> = {};
  for (const o of orders) ordersMap[o.id] = o;

  return {
    orders: ordersMap,
    batches: raw.batches ?? {},
    lastSyncAt: raw.lastSyncAt ?? "",
  };
}

/** 写入中央档案 */
function saveCentralArchive(archive: CentralArchive): void {
  try {
    localStorage.setItem(CENTRAL_KEY, JSON.stringify(archive));
  } catch {
    // 存储失败
  }
}

/** 按订单号读取中央单子 */
export function getCentralOrder(orderId: string): WorkOrder | undefined {
  return loadCentralArchive().orders[orderId];
}

/** 判断订单号是否已入库（幂等：同一单不重复计入） */
export function isOrderAlreadyInCentral(orderId: string): boolean {
  return Boolean(loadCentralArchive().orders[orderId]);
}

/** 判断批次是否已入库（幂等：同一批次不重复计入） */
export function isBatchAlreadyInCentral(batchId: string): boolean {
  return Boolean(loadCentralArchive().batches[batchId]);
}

export interface CentralWriteResult {
  ok: boolean;
  /** 是否为重复入库（幂等命中） */
  duplicate: boolean;
  error: string;
}

/**
 * 写入一条单子到中央档案。
 *
 * 幂等：若订单号已存在，直接返回 duplicate，不重复计入。
 * 模拟网络延迟与失败。
 */
export async function writeOrderToCentral(
  order: WorkOrder
): Promise<CentralWriteResult> {
  await delay(NETWORK_LATENCY_MS);

  // 模拟入库失败
  if (isFailureSimulated()) {
    return { ok: false, duplicate: false, error: "模拟入库失败（网络抖动）" };
  }

  const archive = loadCentralArchive();
  if (archive.orders[order.id]) {
    // 幂等命中：同一单不重复计入
    return { ok: true, duplicate: true, error: "" };
  }

  archive.orders[order.id] = order;
  archive.lastSyncAt = new Date().toISOString();
  saveCentralArchive(archive);
  return { ok: true, duplicate: false, error: "" };
}

/** 标记批次已入库（幂等） */
export function markBatchInCentral(batchId: string): void {
  const archive = loadCentralArchive();
  archive.batches[batchId] = new Date().toISOString();
  archive.lastSyncAt = new Date().toISOString();
  saveCentralArchive(archive);
}

/** 清空中央档案（演示用） */
export function clearCentral(): void {
  localStorage.removeItem(CENTRAL_KEY);
}
