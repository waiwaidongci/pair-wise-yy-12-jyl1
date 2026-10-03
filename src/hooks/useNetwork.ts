import { useCallback, useEffect, useState } from "react";
import type { NetworkStatus } from "../types";

const NETWORK_KEY = "farrier_network_status_v1";

function readNetwork(): NetworkStatus {
  try {
    const v = localStorage.getItem(NETWORK_KEY);
    return v === "offline" ? "offline" : "online";
  } catch {
    return "online";
  }
}

function writeNetwork(status: NetworkStatus): void {
  try {
    localStorage.setItem(NETWORK_KEY, status);
  } catch {
    // ignore
  }
}

/**
 * 网络状态 hook。
 *
 * 模拟断网 / 恢复网络。断网时单子存本机，恢复网络后触发同步。
 */
export function useNetwork() {
  const [status, setStatus] = useState<NetworkStatus>(readNetwork);

  useEffect(() => {
    writeNetwork(status);
  }, [status]);

  const goOffline = useCallback(() => setStatus("offline"), []);
  const goOnline = useCallback(() => setStatus("online"), []);
  const toggle = useCallback(
    () => setStatus((s) => (s === "online" ? "offline" : "online")),
    []
  );

  return { status, isOnline: status === "online", goOffline, goOnline, toggle };
}
