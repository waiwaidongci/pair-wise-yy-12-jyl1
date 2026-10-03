import type { SyncResult, WorkOrder } from "../types";

interface SyncPanelProps {
  pendingOrders: WorkOrder[];
  syncing: boolean;
  lastResults: SyncResult[];
  onRetry: () => void;
}

/**
 * 同步面板。
 *
 * 展示待同步批次、入库失败重试结果、冲突单数。
 * 入库失败后保留本地批次，恢复网络重试，同一单不重复计入。
 */
export function SyncPanel({
  pendingOrders,
  syncing,
  lastResults,
  onRetry,
}: SyncPanelProps) {

  const failedCount = pendingOrders.filter((o) => o.status === "failed").length;
  const pendingCount = pendingOrders.filter((o) => o.status === "pending").length;
  const conflictCount = pendingOrders.filter((o) => o.status === "conflict").length;

  return (
    <section className="panel sync-panel">
      <div className="heading">
        <div>
          <p>回场合并</p>
          <h2>同步批次</h2>
        </div>
        <button className="primary" onClick={onRetry} disabled={syncing}>
          {syncing ? "同步中…" : "立即重试"}
        </button>
      </div>

      <div className="sync-stats">
        <div className="sync-stat">
          <small>待同步</small>
          <strong>{pendingCount}</strong>
        </div>
        <div className="sync-stat">
          <small>入库失败</small>
          <strong className={failedCount ? "warn" : ""}>{failedCount}</strong>
        </div>
        <div className="sync-stat">
          <small>冲突留两份</small>
          <strong className={conflictCount ? "conflict" : ""}>{conflictCount}</strong>
        </div>
      </div>

      {lastResults.length > 0 && (
        <div className="sync-results">
          <h3>最近同步结果</h3>
          <ul>
            {lastResults.map((r, i) => (
              <li key={i} className={`sync-result ${r.outcome}`}>
                <span className={`outcome-badge ${r.outcome}`}>
                  {r.outcome === "synced" && "已入库"}
                  {r.outcome === "conflict" && "冲突·留两份"}
                  {r.outcome === "duplicate" && "重复·跳过"}
                  {r.outcome === "failed" && "失败·待重试"}
                </span>
                <span className="order-id">{r.orderId}</span>
                <span className="message">{r.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pendingOrders.length > 0 && (
        <div className="pending-list">
          <h3>本地批次（断网暂存）</h3>
          {pendingOrders.map((o) => (
            <article key={o.id} className={`pending-item ${o.status}`}>
              <div>
                <b>{o.horseId}</b>
                <p>
                  批次 {o.batchId} · 修订号 rev.{o.rev} · {o.status}
                  {o.failCount > 0 && ` · 失败 ${o.failCount} 次`}
                </p>
                {o.lastError && <p className="error-msg">{o.lastError}</p>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
