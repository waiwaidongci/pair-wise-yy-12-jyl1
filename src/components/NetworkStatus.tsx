import { useNetwork } from "../hooks/useNetwork";

/**
 * 网络状态指示器。
 * 模拟断网 / 恢复网络，便于演示断网暂存与回场合并。
 */
export function NetworkStatus() {
  const { status, isOnline, toggle } = useNetwork();

  return (
    <button
      className={`network-pill ${isOnline ? "online" : "offline"}`}
      onClick={toggle}
      title="点击切换网络状态"
    >
      <span className="dot" />
      {isOnline ? "在线 · 中央档案可同步" : "断网 · 单子暂存本机"}
    </button>
  );
}
