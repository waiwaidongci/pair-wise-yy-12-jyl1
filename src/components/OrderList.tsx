import { useMemo, useState } from "react";
import type { WorkOrder } from "../types";
import { loadAllOrders } from "../utils/history";

/**
 * 修蹄单列表。
 *
 * 展示马匹列表、复查提醒、蹄铁更换历史、训练放行状态。
 * 冲突单可展开查看两份来源。
 */
export function OrderList({ refreshKey }: { refreshKey: number }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState("全部");

  const orders = useMemo(() => loadAllOrders(), [refreshKey]);

  const filtered = useMemo(() => {
    if (filter === "全部") return orders;
    if (filter === "运动马" || filter === "休养马") {
      return orders.filter((o) => o.horseProfile.type === filter);
    }
    if (filter === "待复查") {
      // 简单演示：有步态问题的视为待复查
      return orders.filter((o) => o.horseProfile.gaitIssues.length > 0);
    }
    if (filter === "异常步态") {
      return orders.filter((o) =>
        o.hoofChecks.some((h) => h.abnormalGait)
      );
    }
    if (filter === "更换蹄铁") {
      return orders.filter((o) => o.horseshoeChanges.length > 0);
    }
    return orders;
  }, [orders, filter]);

  const filters = ["全部", "待复查", "异常步态", "更换蹄铁", "运动马", "休养马"];

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>马匹档案</p>
          <h2>修蹄单列表</h2>
        </div>
        <div className="chips">
          {filters.map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="records">
        {filtered.length === 0 && (
          <p className="empty">暂无修蹄单，新增一条开始记录。</p>
        )}
        {filtered.map((order) => (
          <article key={order.id} className={order.source === "merged" ? "merged" : ""}>
            <b>{order.horseId.slice(-2)}</b>
            <div className="record-body">
              <h3>
                {order.horseId} · {order.horseProfile.name || "未命名"}
                <span className={`source-badge ${order.source}`}>
                  {order.source === "local" && "本机"}
                  {order.source === "central" && "中央"}
                  {order.source === "merged" && "冲突·两份来源"}
                </span>
                <span className="rev-badge">rev.{order.rev}</span>
              </h3>
              <p>
                {order.horseProfile.breed} · {order.horseProfile.type} ·{" "}
                {order.horseProfile.hoofShape || "蹄形未评估"}
              </p>
              <p>
                蹄铁：
                {order.horseshoeChanges.length > 0
                  ? order.horseshoeChanges.map((c) => c.horseshoeType).join("、")
                  : "未装蹄铁"}
                {" · "}
                训练放行：
                <span className={order.trainingRelease.released ? "ok" : "warn"}>
                  {order.trainingRelease.released ? "放行" : "未放行"}
                </span>
                （{order.trainingRelease.reason}）
              </p>
              {order.horseProfile.gaitIssues.length > 0 && (
                <p className="gait-issues">
                  步态问题：{order.horseProfile.gaitIssues.join("、")}
                </p>
              )}
              <div className="hoof-mini">
                {order.hoofChecks.map((h) => (
                  <span
                    key={h.position}
                    className={`hoof-chip ${h.abnormalGait ? "abnormal" : ""}`}
                  >
                    {h.position}
                    {h.abnormalGait ? " ⚠" : ""}
                    {h.nailPosition ? ` · ${h.nailPosition}` : ""}
                  </span>
                ))}
              </div>

              {order.source === "merged" && order.sources && (
                <div className="conflict-block">
                  <button
                    className="conflict-toggle"
                    onClick={() =>
                      setExpanded(expanded === order.id ? null : order.id)
                    }
                  >
                    {expanded === order.id ? "收起两份来源" : "查看两份来源"}
                  </button>
                  {expanded === order.id && (
                    <div className="sources-grid">
                      <div className="source-col">
                        <h4>本机来源（rev.{order.sources.local.rev}）</h4>
                        <pre>{JSON.stringify(order.sources.local, null, 2)}</pre>
                      </div>
                      <div className="source-col">
                        <h4>中央来源（rev.{order.sources.central.rev}）</h4>
                        <pre>{JSON.stringify(order.sources.central, null, 2)}</pre>
                      </div>
                      {order.conflicts.length > 0 && (
                        <div className="conflicts-list">
                          <h4>冲突字段（{order.conflicts.length}）</h4>
                          <ul>
                            {order.conflicts.map((c) => (
                              <li key={c.id}>
                                <code>{c.field}</code>
                                <span className="conflict-vals">
                                  本机 <b>{String(c.localValue)}</b>
                                  {" · "}
                                  中央 <b>{String(c.centralValue)}</b>
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
