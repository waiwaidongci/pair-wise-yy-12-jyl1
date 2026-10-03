import type { Store } from "../App";
import { Conflict } from "../types";

/** 同步中心：待入库批次、冲突双来源、迁移日志 */
export default function SyncCenter({
  store,
  selectedHorseId,
}: {
  store: Store;
  selectedHorseId: string;
}) {
  const { local, central, online, failMode, report } = store;
  const openConflicts = local.conflicts.filter((c) => !c.resolution);
  const resolvedConflicts = local.conflicts.filter((c) => c.resolution);
  const pendingOps = local.outbox.reduce((n, b) => n + b.ops.length, 0);

  return (
    <div className="sync-grid">
      <section className="panel">
        <div className="heading">
          <div>
            <p>回场合并</p>
            <h2>同步状态</h2>
          </div>
          <button className="primary" onClick={store.doSync} disabled={!online && pendingOps === 0}>
            立即同步
          </button>
        </div>
        <ul className="status-list">
          <li>
            网络：
            <b className={online ? "state-ok" : "state-bad"}>
              {online ? "在线（已回场）" : "断网（远场，变更只存本机）"}
            </b>
          </li>
          <li>
            待入库：{local.outbox.length} 批 / {pendingOps} 单
          </li>
          <li>中央档案已记账：{central.appliedOps.length} 单（opId 幂等去重）</li>
          <li>上次同步：{local.lastSyncAt ? local.lastSyncAt.slice(0, 19).replace("T", " ") : "从未"}</li>
          <li>
            <label className="check-line" style={{ display: "inline-flex" }}>
              <input
                type="checkbox"
                checked={failMode}
                onChange={(e) => store.setFailMode(e.target.checked)}
              />
              <span>模拟入库失败（响应丢失）：批次保留本机，重试时同一单不重复计入</span>
            </label>
          </li>
        </ul>
        {report && (
          <div className={`report ${report.ok ? "" : "report-bad"}`}>
            {report.notes.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        )}

        <h3>待入库批次（出站队列）</h3>
        {local.outbox.length === 0 ? (
          <p className="hint">队列已清空，本机与中央一致。</p>
        ) : (
          <div className="records">
            {local.outbox.map((b) => (
              <article key={b.batchId}>
                <b>{b.ops.length}单</b>
                <div>
                  <h3>
                    {b.batchId}
                    {b.lastError && <span className="tag warn-tag">待重试</span>}
                  </h3>
                  <p>
                    {b.ops.map((o) => `${o.kind}@${o.horseId}·rev${o.rev}`).join("；")}
                    <br />
                    创建 {b.createdAt.slice(0, 19).replace("T", " ")} · 已尝试 {b.attempts} 次
                    {b.lastError ? ` · ${b.lastError}` : ""}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>两边都改过 → 留两份来源</p>
            <h2>冲突（{openConflicts.length} 起未决）</h2>
          </div>
        </div>
        {openConflicts.length === 0 && (
          <p className="hint">
            暂无未决冲突。本机与中央同时改同一匹马的档案时，两份来源会并列保留在此，互不覆盖。
          </p>
        )}
        {openConflicts.map((c) => (
          <ConflictCard key={c.id} conflict={c} store={store} />
        ))}
        {resolvedConflicts.length > 0 && (
          <>
            <h3>已裁决（两份来源仍存档可查）</h3>
            <div className="records">
              {resolvedConflicts.map((c) => (
                <article key={c.id}>
                  <b>存档</b>
                  <div>
                    <h3>
                      {c.horseId} ·{" "}
                      {c.resolution?.strategy === "keep-local"
                        ? "采用本机"
                        : c.resolution?.strategy === "keep-central"
                          ? "采用中央"
                          : "保留两份来源"}
                    </h3>
                    <p>
                      本机 rev{c.localRev}：{c.localSnapshot.gaitIssue || "—"} / 中央 rev
                      {c.centralRev}：{c.centralSnapshot.gaitIssue || "—"} · 裁决于{" "}
                      {c.resolution?.at.slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}

        <h3 style={{ marginTop: 24 }}>演示工具</h3>
        <p className="hint">
          当前选中马匹：{selectedHorseId || "—"}。先在「档案」页改本机档案，再点下面按钮让场部（中央端）改同一匹马，回场同步即可看到双来源冲突。
        </p>
        <div className="actions">
          <button onClick={() => store.demoCentralEdit(selectedHorseId)} disabled={!selectedHorseId}>
            模拟场部改此马档案
          </button>
          <button onClick={() => store.demoCentralCheck(selectedHorseId)} disabled={!selectedHorseId}>
            模拟场部补一条蹄位检查
          </button>
          <button onClick={store.resetDemo}>重置演示数据</button>
        </div>

        <h3>升级迁移日志</h3>
        {local.migrations.length === 0 ? (
          <p className="hint">无迁移记录</p>
        ) : (
          <ul className="status-list">
            {local.migrations.map((m, i) => (
              <li key={i}>
                {m.at.slice(0, 19).replace("T", " ")} — {m.note}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ConflictCard({ conflict, store }: { conflict: Conflict; store: Store }) {
  const fields: { label: string; key: "name" | "status" | "gaitIssue" | "hoofShape" }[] = [
    { label: "马名", key: "name" },
    { label: "状态", key: "status" },
    { label: "步态问题", key: "gaitIssue" },
    { label: "蹄形评估", key: "hoofShape" },
  ];
  const differ = (key: (typeof fields)[number]["key"]) =>
    conflict.localSnapshot[key] !== conflict.centralSnapshot[key];
  return (
    <div className="conflict">
      <p className="conflict-head">
        <b>{conflict.horseId}</b> 档案冲突 · 检测于{" "}
        {conflict.detectedAt.slice(0, 16).replace("T", " ")}（两份来源均保留，未互相覆盖）
      </p>
      <div className="conflict-cols">
        <div className="source">
          <h4>来源一 · 本机（rev{conflict.localRev}）</h4>
          {fields.map((f) => (
            <p key={f.key} className={differ(f.key) ? "diff" : ""}>
              <small>{f.label}</small>
              {conflict.localSnapshot[f.key] || "—"}
            </p>
          ))}
        </div>
        <div className="source">
          <h4>来源二 · 中央（rev{conflict.centralRev}）</h4>
          {fields.map((f) => (
            <p key={f.key} className={differ(f.key) ? "diff" : ""}>
              <small>{f.label}</small>
              {conflict.centralSnapshot[f.key] || "—"}
            </p>
          ))}
        </div>
      </div>
      <div className="actions">
        <button className="primary" onClick={() => store.resolve(conflict.id, "keep-local")}>
          采用本机
        </button>
        <button onClick={() => store.resolve(conflict.id, "keep-central")}>采用中央</button>
        <button onClick={() => store.resolve(conflict.id, "keep-both")}>保留两份来源</button>
      </div>
    </div>
  );
}
