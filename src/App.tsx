import { useMemo, useState } from "react";
import "./styles.css";
import { CentralDB, LocalDB } from "./types";
import { loadCentral, loadLocal, resetAll, saveCentral, saveLocal } from "./store/db";
import { addHoofCheck, addHorse, addShoeChange, updateProfile } from "./store/repo";
import {
  SyncReport,
  resolveConflict,
  simulateCentralCheck,
  simulateCentralProfileEdit,
  syncNow,
} from "./store/sync";
import { dueList, horseClearance } from "./lib/clearance";
import HorseDetail from "./components/HorseDetail";
import ClearanceBoard from "./components/ClearanceBoard";
import SyncCenter from "./components/SyncCenter";

export interface Store {
  local: LocalDB;
  central: CentralDB;
  online: boolean;
  failMode: boolean;
  report: SyncReport | null;
  setOnline: (v: boolean) => void;
  setFailMode: (v: boolean) => void;
  doSync: () => void;
  updateProfile: typeof updateProfile extends (a: LocalDB, ...rest: infer R) => LocalDB
    ? (...args: R) => void
    : never;
  addHoofCheck: (input: Parameters<typeof addHoofCheck>[1]) => void;
  addShoeChange: (input: Parameters<typeof addShoeChange>[1]) => void;
  addHorse: (input: { name: string; status: "运动马" | "休养马" }) => string;
  resolve: (id: string, s: "keep-local" | "keep-central" | "keep-both") => void;
  demoCentralEdit: (horseId: string) => void;
  demoCentralCheck: (horseId: string) => void;
  resetDemo: () => void;
}

function useFarrier(): Store {
  const [local, setLocal] = useState<LocalDB>(loadLocal);
  const [central, setCentral] = useState<CentralDB>(loadCentral);
  const [online, setOnline] = useState(false); // 默认远场断网
  const [failMode, setFailMode] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);

  const commit = (l: LocalDB, c: CentralDB) => {
    saveLocal(l);
    saveCentral(c);
    setLocal(l);
    setCentral(c);
  };
  const mutate = (fn: (l: LocalDB) => LocalDB) => {
    const l = fn(local);
    saveLocal(l);
    setLocal(l);
  };

  return {
    local,
    central,
    online,
    failMode,
    report,
    setOnline,
    setFailMode,
    doSync: () => {
      if (!online) {
        setReport({
          ok: false,
          online: false,
          notes: ["当前断网：变更只存本机并进入待入库批次，回场恢复网络后再同步"],
          pushedOps: 0,
          skippedOps: 0,
          pulledRecords: 0,
          conflictsFound: 0,
          failedBatchId: null,
        });
        return;
      }
      const r = syncNow(local, central, { failMode });
      commit(r.local, r.central);
      setReport(r.report);
    },
    updateProfile: ((horseId: string, patch: Parameters<typeof updateProfile>[2]) =>
      mutate((l) => updateProfile(l, horseId, patch))) as Store["updateProfile"],
    addHoofCheck: (input) => mutate((l) => addHoofCheck(l, input)),
    addShoeChange: (input) => mutate((l) => addShoeChange(l, input)),
    addHorse: (input) => {
      const { db, horseId } = addHorse(local, input);
      saveLocal(db);
      setLocal(db);
      return horseId;
    },
    resolve: (id, s) => {
      const r = resolveConflict(local, central, id, s);
      commit(r.local, r.central);
    },
    demoCentralEdit: (horseId) => {
      const c = simulateCentralProfileEdit(central, horseId);
      saveCentral(c);
      setCentral(c);
    },
    demoCentralCheck: (horseId) => {
      const c = simulateCentralCheck(central, horseId);
      saveCentral(c);
      setCentral(c);
    },
    resetDemo: () => {
      resetAll();
      const l = loadLocal();
      const c = loadCentral();
      setLocal(l);
      setCentral(c);
      setReport(null);
    },
  };
}

type View = "workbench" | "roster" | "sync";

function App() {
  const store = useFarrier();
  const { local, online } = store;
  const [view, setView] = useState<View>("workbench");
  const horses = useMemo(
    () => Object.values(local.horses).sort((a, b) => a.horseId.localeCompare(b.horseId)),
    [local.horses]
  );
  const [selectedId, setSelectedId] = useState<string>(() => horses[0]?.horseId ?? "");
  const selected = local.horses[selectedId] ?? horses[0];
  const [filter, setFilter] = useState("全部");
  const [keyword, setKeyword] = useState("");

  const pendingOps = local.outbox.reduce((n, b) => n + b.ops.length, 0);
  const openConflicts = local.conflicts.filter((c) => !c.resolution);
  const dues = dueList(local);
  const clearanceMap = useMemo(() => {
    const m: Record<string, ReturnType<typeof horseClearance>> = {};
    for (const h of horses) m[h.horseId] = horseClearance(local, h.horseId);
    return m;
  }, [local, horses]);

  const filtered = horses.filter((h) => {
    if (keyword && !`${h.horseId}${h.name}${h.gaitIssue}`.includes(keyword)) return false;
    const states = clearanceMap[h.horseId]?.map((c) => c.state) ?? [];
    if (filter === "运动马" || filter === "休养马") return h.status === filter;
    if (filter === "异常步态") return states.includes("异常停训");
    if (filter === "待复查") return states.includes("待复查") || states.includes("无记录");
    return true;
  });

  const clearedCount = horses.filter((h) =>
    clearanceMap[h.horseId]?.every((c) => c.state === "放行")
  ).length;
  const blockedCount = horses.filter((h) =>
    clearanceMap[h.horseId]?.some((c) => c.state === "异常停训" || c.state === "待复查")
  ).length;

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <p className="kicker">hxyfront-62011 · 可续作修蹄台</p>
          <h1>马术蹄铁修整档案</h1>
        </div>
        <div className="top-actions">
          <span className={`net-badge ${online ? "on" : "off"}`}>
            {online ? "● 在场·在线" : "● 远场·断网（存本机）"}
          </span>
          <button onClick={() => store.setOnline(!online)}>
            {online ? "切换到断网" : "恢复网络"}
          </button>
          <button className="primary" onClick={store.doSync}>
            回场同步{pendingOps > 0 ? `（待入库 ${pendingOps} 单）` : ""}
          </button>
        </div>
      </header>

      <section className="metrics">
        <article>
          <small>马匹档案</small>
          <strong>{horses.length}</strong>
        </article>
        <article>
          <small>训练放行</small>
          <strong>{clearedCount}</strong>
        </article>
        <article>
          <small>待复查 / 停训</small>
          <strong>{blockedCount}</strong>
        </article>
        <article>
          <small>待入库批次</small>
          <strong>{local.outbox.length}</strong>
        </article>
        <article>
          <small>未解冲突</small>
          <strong>{openConflicts.length}</strong>
        </article>
      </section>

      <nav className="view-tabs">
        <button className={view === "workbench" ? "active" : ""} onClick={() => setView("workbench")}>
          修蹄工作台
        </button>
        <button className={view === "roster" ? "active" : ""} onClick={() => setView("roster")}>
          训练放行名单
        </button>
        <button className={view === "sync" ? "active" : ""} onClick={() => setView("sync")}>
          同步中心{openConflicts.length > 0 ? `（${openConflicts.length} 起冲突）` : ""}
        </button>
      </nav>

      {view === "workbench" && (
        <section className="workspace">
          <aside className="panel">
            <div className="heading">
              <div>
                <p>马匹列表</p>
                <h2>{filtered.length} 匹</h2>
              </div>
            </div>
            <input
              placeholder="搜索编号 / 名字 / 步态"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <div className="chips" style={{ margin: "12px 0" }}>
              {["全部", "运动马", "休养马", "异常步态", "待复查"].map((f) => (
                <button
                  key={f}
                  className={filter === f ? "chip-active" : ""}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="horse-list">
              {filtered.map((h) => {
                const states = clearanceMap[h.horseId]?.map((c) => c.state) ?? [];
                const dot = states.includes("异常停训")
                  ? "bad"
                  : states.includes("待复查") || states.includes("无记录")
                    ? "warn"
                    : "ok";
                return (
                  <button
                    key={h.horseId}
                    className={`horse-item ${selected?.horseId === h.horseId ? "active" : ""}`}
                    onClick={() => setSelectedId(h.horseId)}
                  >
                    <span className={`dot ${dot}`} />
                    <span>
                      <b>{h.horseId}</b> {h.name}
                      <small>
                        {h.status} · rev{h.rev}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            <AddHorse onAdd={(input) => setSelectedId(store.addHorse(input))} />
          </aside>

          {selected ? (
            <HorseDetail
              store={store}
              horse={selected}
              dues={dues.filter((d) => d.horseId === selected.horseId)}
            />
          ) : (
            <section className="panel">暂无马匹</section>
          )}
        </section>
      )}

      {view === "roster" && <ClearanceBoard store={store} dues={dues} />}

      {view === "sync" && <SyncCenter store={store} selectedHorseId={selected?.horseId ?? ""} />}
    </main>
  );
}

function AddHorse({
  onAdd,
}: {
  onAdd: (input: { name: string; status: "运动马" | "休养马" }) => void;
}) {
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"运动马" | "休养马">("运动马");
  return (
    <div className="add-horse">
      <h3>新增马匹</h3>
      <input placeholder="马名" value={name} onChange={(e) => setName(e.target.value)} />
      <select value={status} onChange={(e) => setStatus(e.target.value as "运动马" | "休养马")}>
        <option>运动马</option>
        <option>休养马</option>
      </select>
      <button
        className="primary"
        onClick={() => {
          if (!name.trim()) return;
          onAdd({ name: name.trim(), status });
          setName("");
        }}
      >
        建档（先入本机）
      </button>
    </div>
  );
}

export default App;
