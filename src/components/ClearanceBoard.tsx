import type { Store } from "../App";
import { horseClearance, type DueItem } from "../lib/clearance";
import { POSITIONS, POSITION_LABEL } from "../types";

/** 训练放行名单：回场后训练名单与寝位检查在此对账 */
export default function ClearanceBoard({
  store,
  dues,
}: {
  store: Store;
  dues: DueItem[];
}) {
  const horses = Object.values(store.local.horses).sort((a, b) =>
    a.horseId.localeCompare(b.horseId)
  );
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>训练名单 × 蹄位检查对账</p>
          <h2>训练放行名单</h2>
        </div>
      </div>
      <table className="board">
        <thead>
          <tr>
            <th>马匹</th>
            <th>状态</th>
            {POSITIONS.map((p) => (
              <th key={p}>{POSITION_LABEL[p]}</th>
            ))}
            <th>结论</th>
          </tr>
        </thead>
        <tbody>
          {horses.map((h) => {
            const clearance = horseClearance(store.local, h.horseId);
            const cleared = clearance.every((c) => c.state === "放行");
            const blocked = clearance.some((c) => c.state === "异常停训");
            return (
              <tr key={h.horseId}>
                <td>
                  <b>{h.horseId}</b> {h.name}
                </td>
                <td>{h.status}</td>
                {clearance.map((c) => (
                  <td key={c.position}>
                    <span
                      className={
                        c.state === "放行"
                          ? "state-ok"
                          : c.state === "异常停训"
                            ? "state-bad"
                            : "state-warn"
                      }
                      title={c.reason}
                    >
                      {c.state}
                    </span>
                  </td>
                ))}
                <td>
                  {cleared ? (
                    <span className="state-ok">可进训练名单</span>
                  ) : blocked ? (
                    <span className="state-bad">停训</span>
                  ) : (
                    <span className="state-warn">待复查后定</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>复查提醒（按下次复查日期排序）</h3>
      {dues.length === 0 ? (
        <p className="hint">暂无复查计划</p>
      ) : (
        <div className="records">
          {dues.map((d) => (
            <article key={`${d.horseId}-${d.position}`}>
              <b className={d.overdue ? "due-bad" : "due-ok"}>{d.nextDue.slice(5)}</b>
              <div>
                <h3>
                  {d.horseId} · {POSITION_LABEL[d.position]}
                  {d.overdue && <span className="tag warn-tag">已逾期</span>}
                </h3>
                <p>下次复查 {d.nextDue}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
