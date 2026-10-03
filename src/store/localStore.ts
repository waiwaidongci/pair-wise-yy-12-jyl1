/**
 * 本机存储（断网时存本机）
 *
 * 使用 localStorage 持久化本机批次与单子。
 * 断网期间所有单子先写入本机，恢复网络后再合并到中央档案。
 */
import type { LocalBatch, WorkOrder } from "../types";
import { backfillOrders } from "../utils/migration";

const LOCAL_ORDERS_KEY = "farrier_local_orders_v1";
const LOCAL_BATCHES_KEY = "farrier_local_batches_v1";

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储失败（如配额超限）时静默，由上层重试
  }
}

/** 读取本机全部单子（自动回填缺失修订号） */
export function loadLocalOrders(): WorkOrder[] {
  const raw = safeRead<Array<Partial<WorkOrder>>>(LOCAL_ORDERS_KEY, []);
  const { orders } = backfillOrders(raw);
  return orders;
}

/** 写入本机全部单子 */
export function saveLocalOrders(orders: WorkOrder[]): void {
  safeWrite(LOCAL_ORDERS_KEY, orders);
}

/** 读取本机全部批次 */
export function loadLocalBatches(): LocalBatch[] {
  return safeRead<LocalBatch[]>(LOCAL_BATCHES_KEY, []);
}

/** 写入本机全部批次 */
export function saveLocalBatches(batches: LocalBatch[]): void {
  safeWrite(LOCAL_BATCHES_KEY, batches);
}

/** 追加一条单子到本机（断网暂存） */
export function appendLocalOrder(order: WorkOrder): void {
  const orders = loadLocalOrders();
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx >= 0) {
    orders[idx] = order;
  } else {
    orders.push(order);
  }
  saveLocalOrders(orders);
}

/** 按订单号读取本机单子 */
export function getLocalOrder(orderId: string): WorkOrder | undefined {
  return loadLocalOrders().find((o) => o.id === orderId);
}

/** 更新本机单子状态 */
export function updateLocalOrder(
  orderId: string,
  patch: Partial<WorkOrder>
): WorkOrder | undefined {
  const orders = loadLocalOrders();
  const idx = orders.findIndex((o) => o.id === orderId);
  if (idx < 0) return undefined;
  orders[idx] = { ...orders[idx], ...patch };
  saveLocalOrders(orders);
  return orders[idx];
}

/** 移除本机单子（入库成功后清理） */
export function removeLocalOrder(orderId: string): void {
  const orders = loadLocalOrders().filter((o) => o.id !== orderId);
  saveLocalOrders(orders);
}

/** 读取待同步（pending / failed）的单子 */
export function loadPendingOrders(): WorkOrder[] {
  return loadLocalOrders().filter(
    (o) => o.status === "pending" || o.status === "failed"
  );
}

/** 读取失败批次（入库失败后保留本地批次，恢复网络重试） */
export function loadFailedBatches(): LocalBatch[] {
  return loadLocalBatches().filter(
    (b) => b.status === "partial" || b.status === "open"
  );
}

/** 清空本机（演示用） */
export function clearLocal(): void {
  localStorage.removeItem(LOCAL_ORDERS_KEY);
  localStorage.removeItem(LOCAL_BATCHES_KEY);
}
