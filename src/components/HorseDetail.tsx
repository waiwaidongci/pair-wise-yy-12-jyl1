import { useMemo, useState } from "react";
import type { Store } from "../App";
import { horseClearance, type DueItem } from "../lib/clearance";
import {
  HoofPosition,
  HorseProfile,
  POSITIONS,
  POSITION_LABEL,
  SHOE_TYPES,
} from "../types";

type Tab = "profile" | "checks" | "shoes" | "clearance" | "history";

export default function HorseDetail({
  store,
  horse,
  dues,
}: {
  store: Store;
  horse: HorseProfile;
  dues: DueItem[];
}) {
  const [tab, setTab] = useState<Tab>("profile");
  const tabs: { key: Tab; label: string }[] = [
    { key: "profile", label: "档案" },
    { key: "checks", label: "蹄位检查" },
    { key: "shoes", label: "蹄铁更换" },
    { key: "clearance", label: "训练放行" },
    { key: "history", label: "历史钉位·照片备注" },
  ];
  return (
    <section className="panel detail">
      <div className="heading">
        <div>
          <p>
            {horse.horseId} · 共享修订号 rev{horse.rev} · 更新于{" "}
            {horse.updatedAt.slice(0, 16).replace("T", " ")}
          </p>
          <h2>
            {horse.name}
            <span className="tag">{horse.status}</span>
          </h2>
        </div>
      </div>
      <div className="chips tab-row">
        {tabs.map((t) => (
          <button key={t.key} className={tab === t.key ? "chip-active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "profile" && <ProfileTab store={store} horse={horse} />}
      {tab === "checks" && <ChecksTab store={store} horse={horse} />}
      {tab === "shoes" && <ShoesTab store={store} horse={horse} dues={dues} />}
      {tab === "clearance" && <ClearanceTab store={store} horse={horse} />}
      {tab === "history" && <HistoryTab store={store} horse={horse} />}
    </section>
  );
}

/* ---------------- 档案：断网可改，进待入库批次 ---------------- */

function ProfileTab({ store, horse }: { store: Store; horse: HorseProfile }) {
  const [form, setForm] = useState({
    name: horse.name,
    status: horse.status,
    gaitIssue: horse.gaitIssue,
    hoofShape: horse.hoofShape,
  });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // 切换马匹时重置表单
  const [forHorse, setForHorse] = useState(horse.horseId);
  if (forHorse !== horse.horseId) {
    setForHorse(horse.horseId);
    setForm({
      name: horse.name,
      status: horse.status,
      gaitIssue: horse.gaitIssue,
      hoofShape: horse.hoofShape,
    });
    setSavedAt(null);
  }
  return (
    <div>
      <div className="field-grid">
        <label>
          <span>马名</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          <span>状态</span>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as "运动马" | "休养马" })}
          >
            <option>运动马</option>
            <option>休养马</option>
          </select>
        </label>
        <label>
          <span>步态问题</span>
          <input
            value={form.gaitIssue}
            placeholder="如：右前蹄外侧磨耗"
            onChange={(e) => setForm({ ...form, gaitIssue: e.target.value })}
          />
        </label>
        <label>
          <span>蹄形评估</span>
          <input
            value={form.hoofShape}
            placeholder="如：蹄壁薄、外侧偏低"
            onChange={(e) => setForm({ ...form, hoofShape: e.target.value })}
          />
        </label>
      </div>
      <div className="actions">
        <button
          className="primary"
          onClick={() => {
            store.updateProfile(horse.horseId, form);
            setSavedAt(new Date().toLocaleTimeString("zh-CN"));
          }}
        >
          保存档案（断网也入本机）
        </button>
        {savedAt && <span className="hint ok-text">已存本机 {savedAt}，并入待入库批次</span>}
      </div>
      <p className="hint">
        档案、蹄位检查、蹄铁更换共用本马修订号序列；保存即生成一单进入待入库批次，回场同步时幂等入库。
      </p>
    </div>
  );
}

/* ---------------- 蹄位检查：四蹄对比 + 异常步态标记 ---------------- */

function ChecksTab({ store, horse }: { store: Store; horse: HorseProfile }) {
  const checks = useMemo(
    () =>
      Object.values(store.local.checks)
        .filter((c) => c.horseId === horse.horseId)
        .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt)),
    [store.local.checks, horse.horseId]
  );
  const [form, setForm] = useState({
    position: "LF" as HoofPosition,
    gaitAbnormal: false,
    assessment: "",
    photoNote: "",
    checkedAt: new Date().toISOString().slice(0, 10),
  });
  return (
    <div>
      <div className="hoof-grid">
        {POSITIONS.map((p) => {
          const latest = checks.find((c) => c.position === p);
          return (
            <article key={p} className={`hoof-card ${latest?.gaitAbnormal ? "abnormal" : ""}`}>
              <b>{POSITION_LABEL[p]}</b>
              {latest ? (
                <>
                  <span className={latest.gaitAbnormal ? "state-bad" : "state-ok"}>
                    {latest.gaitAbnormal ? "异常步态" : "正常"}
                  </span>
                  <small>
                    {latest.checkedAt} · rev{latest.rev}
                  </small>
                  <p>{latest.assessment}</p>
                  {latest.photoNote && <small>📷 {latest.photoNote}</small>}
                </>
              ) : (
                <small>暂无检查记录</small>
              )}
            </article>
          );
        })}
      </div>
      <h3>新增蹄位检查</h3>
      <div className="field-grid">
        <label>
          <span>蹄位</span>
          <select
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value as HoofPosition })}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {POSITION_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>检查日期</span>
          <input
            type="date"
            value={form.checkedAt}
            onChange={(e) => setForm({ ...form, checkedAt: e.target.value })}
          />
        </label>
        <label>
          <span>蹄形评估 / 检查结论</span>
          <input
            value={form.assessment}
            placeholder="如：换铁后步幅正常"
            onChange={(e) => setForm({ ...form, assessment: e.target.value })}
          />
        </label>
        <label>
          <span>照片备注</span>
          <input
            value={form.photoNote}
            placeholder="如：慢步视频截图3张"
            onChange={(e) => setForm({ ...form, photoNote: e.target.value })}
          />
        </label>
        <label className="check-line">
          <input
            type="checkbox"
            checked={form.gaitAbnormal}
            onChange={(e) => setForm({ ...form, gaitAbnormal: e.target.checked })}
          />
          <span>标记异常步态（将暂停训练放行）</span>
        </label>
      </div>
      <div className="actions">
        <button
          className="primary"
          onClick={() => {
            store.addHoofCheck({ horseId: horse.horseId, ...form });
            setForm({ ...form, assessment: "", photoNote: "" });
          }}
        >
          记录检查（入本机批次）
        </button>
      </div>
      <RecordList
        rows={checks.map((c) => ({
          key: c.id,
          title: `${c.checkedAt} · ${POSITION_LABEL[c.position]} · ${c.gaitAbnormal ? "异常步态" : "正常"}`,
          body: `${c.assessment}${c.photoNote ? ` · 📷 ${c.photoNote}` : ""} · rev${c.rev}`,
        }))}
      />
    </div>
  );
}

/* ---------------- 蹄铁更换：类型变更 → 旧放行失效 ---------------- */

function ShoesTab({
  store,
  horse,
  dues,
}: {
  store: Store;
  horse: HorseProfile;
  dues: DueItem[];
}) {
  const shoes = useMemo(
    () =>
      Object.values(store.local.shoes)
        .filter((s) => s.horseId === horse.horseId)
        .sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
    [store.local.shoes, horse.horseId]
  );
  const [form, setForm] = useState({
    position: "LF" as HoofPosition,
    shoeType: SHOE_TYPES[0],
    nailPattern: "",
    changedAt: new Date().toISOString().slice(0, 10),
    nextDue: "",
    photoNote: "",
  });
  return (
    <div>
      <h3>登记蹄铁更换</h3>
      <div className="field-grid">
        <label>
          <span>蹄位</span>
          <select
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value as HoofPosition })}
          >
            {POSITIONS.map((p) => (
              <option key={p} value={p}>
                {POSITION_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>蹄铁类型</span>
          <select value={form.shoeType} onChange={(e) => setForm({ ...form, shoeType: e.target.value })}>
            {SHOE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>钉位</span>
          <input
            value={form.nailPattern}
            placeholder="如：外侧4钉·内侧3钉"
            onChange={(e) => setForm({ ...form, nailPattern: e.target.value })}
          />
        </label>
        <label>
          <span>修蹄日期</span>
          <input
            type="date"
            value={form.changedAt}
            onChange={(e) => setForm({ ...form, changedAt: e.target.value })}
          />
        </label>
        <label>
          <span>下次复查日期</span>
          <input
            type="date"
            value={form.nextDue}
            onChange={(e) => setForm({ ...form, nextDue: e.target.value })}
          />
        </label>
        <label>
          <span>照片备注</span>
          <input
            value={form.photoNote}
            placeholder="如：钉位照片已归档"
            onChange={(e) => setForm({ ...form, photoNote: e.target.value })}
          />
        </label>
      </div>
      <div className="actions">
        <button
          className="primary"
          onClick={() => {
            store.addShoeChange({ horseId: horse.horseId, ...form });
            setForm({ ...form, nailPattern: "", photoNote: "" });
          }}
        >
          登记更换（入本机批次）
        </button>
        <span className="hint">蹄铁类型一变，该蹄位旧训练放行立即失效并重算</span>
      </div>
      {dues.length > 0 && (
        <p className="hint">
          复查提醒：
          {dues.map((d) => (
            <span key={d.position} className={d.overdue ? "state-bad" : "state-warn"}>
              {POSITION_LABEL[d.position]} {d.nextDue}
              {d.overdue ? "（已逾期）" : ""}{" "}
            </span>
          ))}
        </p>
      )}
      <RecordList
        rows={shoes.map((s) => ({
          key: s.id,
          badge: s.typeChanged ? "类型变更·放行重算" : undefined,
          title: `${s.changedAt} · ${POSITION_LABEL[s.position]} · ${s.shoeType}`,
          body: `钉位：${s.nailPattern || "—"} · 下次复查 ${s.nextDue || "—"}${
            s.photoNote ? ` · 📷 ${s.photoNote}` : ""
          } · rev${s.rev}`,
        }))}
      />
    </div>
  );
}

/* ---------------- 训练放行：逐蹄位状态 + 失效事件 ---------------- */

function ClearanceTab({ store, horse }: { store: Store; horse: HorseProfile }) {
  const clearance = horseClearance(store.local, horse.horseId);
  const events = store.local.clearanceLog
    .filter((e) => e.horseId === horse.horseId)
    .slice()
    .reverse();
  return (
    <div>
      <div className="hoof-grid">
        {clearance.map((c) => (
          <article key={c.position} className="hoof-card">
            <b>{POSITION_LABEL[c.position]}</b>
            <span
              className={
                c.state === "放行"
                  ? "state-ok"
                  : c.state === "异常停训"
                    ? "state-bad"
                    : "state-warn"
              }
            >
              {c.state}
            </span>
            <p>{c.reason}</p>
          </article>
        ))}
      </div>
      <h3>放行失效 / 重算事件</h3>
      {events.length === 0 ? (
        <p className="hint">暂无失效事件。蹄铁类型一旦变更，旧训练放行会在此登记失效并重算。</p>
      ) : (
        <RecordList
          rows={events.map((e) => ({
            key: e.id,
            badge: "放行失效",
            title: `${e.at.slice(0, 16).replace("T", " ")} · ${POSITION_LABEL[e.position]}`,
            body: `${e.reason} · rev${e.rev}`,
          }))}
        />
      )}
    </div>
  );
}

/* ---------------- 历史钉位与照片备注：可检索 ---------------- */

function HistoryTab({ store, horse }: { store: Store; horse: HorseProfile }) {
  const [kw, setKw] = useState("");
  const [scope, setScope] = useState<"this" | "all">("this");
  const shoes = Object.values(store.local.shoes)
    .filter((s) => (scope === "this" ? s.horseId === horse.horseId : true))
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt));
  const checks = Object.values(store.local.checks)
    .filter((c) => (scope === "this" ? c.horseId === horse.horseId : true))
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
  const match = (text: string) => !kw || text.includes(kw);
  const shoeRows = shoes.filter((s) =>
    match(`${s.shoeType}${s.nailPattern}${s.photoNote}${s.horseId}`)
  );
  const checkRows = checks.filter((c) => match(`${c.assessment}${c.photoNote}${c.horseId}`));
  return (
    <div>
      <div className="actions" style={{ marginTop: 0 }}>
        <input
          placeholder="按钉位 / 蹄铁类型 / 照片备注检索，如「外侧4钉」"
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          style={{ maxWidth: 360 }}
        />
        <button onClick={() => setScope(scope === "this" ? "all" : "this")}>
          {scope === "this" ? "仅本马 ▾" : "全部马匹 ▾"}
        </button>
      </div>
      <h3>换蹄历史（钉位 · 照片备注）</h3>
      <RecordList
        rows={shoeRows.map((s) => ({
          key: s.id,
          badge: s.typeChanged ? "类型变更" : undefined,
          title: `${s.changedAt} · ${s.horseId} · ${POSITION_LABEL[s.position]} · ${s.shoeType}`,
          body: `钉位：${s.nailPattern || "—"}${s.photoNote ? ` · 📷 ${s.photoNote}` : ""} · rev${s.rev}`,
        }))}
        empty="无匹配的换蹄记录"
      />
      <h3>检查历史（照片备注）</h3>
      <RecordList
        rows={checkRows.map((c) => ({
          key: c.id,
          title: `${c.checkedAt} · ${c.horseId} · ${POSITION_LABEL[c.position]} · ${
            c.gaitAbnormal ? "异常步态" : "正常"
          }`,
          body: `${c.assessment}${c.photoNote ? ` · 📷 ${c.photoNote}` : ""} · rev${c.rev}`,
        }))}
        empty="无匹配的检查记录"
      />
    </div>
  );
}

/* ---------------- 通用记录列表 ---------------- */

export function RecordList({
  rows,
  empty = "暂无记录",
}: {
  rows: { key: string; title: string; body: string; badge?: string }[];
  empty?: string;
}) {
  if (rows.length === 0) return <p className="hint">{empty}</p>;
  return (
    <div className="records">
      {rows.map((r) => (
        <article key={r.key}>
          <div>
            <h3>
              {r.title}
              {r.badge && <span className="tag warn-tag">{r.badge}</span>}
            </h3>
            <p>{r.body}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
