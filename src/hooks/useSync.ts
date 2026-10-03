import { useCallback, useEffect, useState } from "react";
import type { SyncResult, WorkOrder } from "../types";
import { loadLocalOrders } from "../store/localStore";
import { syncAllPending } from "../store/syncEngine";
import { useNetwork } from "./useNetwork";

/**
 * 同步 hook。
 *
 * - 断网时：单子存本机，不触发同步。
 * - 恢复网络后：自动重试所有 pending / failed 的单子。
 * - 入库失败：保留本地批次，恢复网络重试，同一单不重复计入。
 */
export function useSync() {
  const { isOnline } = useNetwork();
  const [pendingOrders, setPendingOrders] = useState<WorkOrder[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastResults, setLastResults] = useState<SyncResult[]>([]);

  const refresh = useCallback(() => {
    setPendingOrders(
      loadLocalOrders().filter(
        (o) => o.status === "pending" || o.status === "failed"
      )
    );
  }, []);

  // 恢复网络后自动同步
  useEffect(() => {
    if (isOnline) {
      refresh();
      setSyncing(true);
      syncAllPending()
        .then((results) => {
          setLastResults(results);
          refresh();
        })
        .finally(() => setSyncing(false));
    }
  }, [isOnline, refresh]);

  const retry = useCallback(async () => {
    setSyncing(true);
    const results = await syncAllPending();
    setLastResults(results);
    refresh();
    setSyncing(false);
    return results;
  }, [refresh]);

  return { pendingOrders, syncing, lastResults, retry, refresh };
}
