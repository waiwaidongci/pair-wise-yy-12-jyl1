import { useMemo } from "react";
import { loadAllOrders } from "../utils/history";

/**
 * 指标卡片：待复查、异常步态、更换蹄铁、马匹档案。
 */
export function Metrics({ refreshKey }: { refreshKey: number }) {
  const orders = useMemo(() => loadAllOrders(), [refreshKey]);

  const metrics = useMemo(() => {
    const horseIds = new Set(orders.map((o) => o.horseId));
    const pendingReview = orders.filter(
      (o) => o.horseProfile.gaitIssues.length > 0
    ).length;
    const abnormalGait = orders.filter((o) =>
      o.hoofChecks.some((h) => h.abnormalGait)
    ).length;
    const horseshoeChanged = orders.filter(
      (o) => o.horseshoeChanges.length > 0
    ).length;
    return [
      { label: "待复查", value: pendingReview },
      { label: "异常步态", value: abnormalGait },
      { label: "更换蹄铁", value: horseshoeChanged },
      { label: "马匹档案", value: horseIds.size },
    ];
  }, [orders]);

  return (
    <section className="metrics">
      {metrics.map((m) => (
        <article key={m.label}>
          <small>{m.label}</small>
          <strong>{m.value}</strong>
        </article>
      ))}
    </section>
  );
}
