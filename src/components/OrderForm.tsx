import { useState } from "react";
import type {
  HoofCheck,
  HoofPosition,
  HorseProfile,
  HorseshoeChange,
  HorseType,
  WorkOrder,
} from "../types";
import { useNetwork } from "../hooks/useNetwork";
import { saveOrderLocally } from "../store/syncEngine";
import { generateBatchId, generateId, INITIAL_REV } from "../utils/revision";
import { recomputeRelease } from "../utils/invalidation";

const POSITIONS: HoofPosition[] = ["左前", "右前", "左后", "右后"];
const HORSE_TYPES: HorseType[] = ["运动马", "休养马"];
const HORSESHOE_TYPES = ["铝蹄铁", "钢蹄铁", "加护蹄垫", "蹄铁脱落", "蹄裂防护"];

function createEmptyProfile(): HorseProfile {
  return {
    horseId: "",
    name: "",
    breed: "",
    age: 0,
    type: "运动马",
    gaitIssues: [],
    hoofShape: "",
    notes: "",
    photoNotes: [],
  };
}

function createEmptyHoofChecks(): HoofCheck[] {
  return POSITIONS.map((pos) => ({
    id: generateId("hc"),
    position: pos,
    nailPosition: "",
    hoofShape: "",
    gaitIssue: "",
    abnormalGait: false,
    notes: "",
    photoNotes: [],
  }));
}

/**
 * 新增修蹄单表单。
 *
 * 断网时单子存本机（状态 pending），恢复网络后自动合并到中央。
 * 马匹档案、蹄位检查、蹄铁更换共用一个修订号。
 * 蹄铁类型变化后训练放行失效重算。
 */
export function OrderForm({ onSaved }: { onSaved: () => void }) {
  const { isOnline } = useNetwork();
  const [horseId, setHorseId] = useState("");
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState(0);
  const [horseType, setHorseType] = useState<HorseType>("运动马");
  const [gaitIssues, setGaitIssues] = useState("");
  const [hoofShape, setHoofShape] = useState("");
  const [notes, setNotes] = useState("");
  const [hoofChecks, setHoofChecks] = useState<HoofCheck[]>(createEmptyHoofChecks);
  const [horseshoeType, setHorseshoeType] = useState(HORSESHOE_TYPES[0]);
  const [nailPosition, setNailPosition] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const updateCheck = (pos: HoofPosition, patch: Partial<HoofCheck>) => {
    setHoofChecks((prev) =>
      prev.map((c) => (c.position === pos ? { ...c, ...patch } : c))
    );
  };

  const handleSave = () => {
    if (!horseId.trim()) {
      setMsg("请填写马匹编号");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const profile: HorseProfile = {
      ...createEmptyProfile(),
      horseId: horseId.trim(),
      name: name.trim(),
      breed: breed.trim(),
      age,
      type: horseType,
      gaitIssues: gaitIssues
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean),
      hoofShape: hoofShape.trim(),
      notes: notes.trim(),
    };
    const changes: HorseshoeChange[] = [];
    if (horseshoeType) {
      changes.push({
        id: generateId("hsc"),
        position: "左前",
        horseshoeType,
        nailPosition: nailPosition.trim(),
        changedAt: now,
        notes: "",
      });
    }
    const order: WorkOrder = {
      id: generateId("WO"),
      batchId: generateBatchId(),
      rev: INITIAL_REV,
      horseId: profile.horseId,
      createdAt: now,
      updatedAt: now,
      source: "local",
      status: "pending",
      horseProfile: profile,
      hoofChecks,
      horseshoeChanges: changes,
      trainingRelease: recomputeRelease(profile, changes),
      conflicts: [],
      failCount: 0,
      lastError: "",
      syncedAt: "",
    };
    // 断网存本机；在线也先存本机，再由同步引擎合并
    saveOrderLocally(order);
    setSaving(false);
    setMsg(
      isOnline
        ? `已存本机，正在合并到中央档案…（修订号 rev.${order.rev}）`
        : `断网中，单子已暂存本机（批次 ${order.batchId}），恢复网络后自动合并`
    );
    onSaved();
    // 重置
    setHorseId("");
    setName("");
    setBreed("");
    setAge(0);
    setGaitIssues("");
    setHoofShape("");
    setNotes("");
    setHoofChecks(createEmptyHoofChecks());
    setNailPosition("");
  };

  return (
    <section className="panel form-panel">
      <div className="heading">
        <div>
          <p>专业字段</p>
          <h2>新增修蹄单</h2>
        </div>
        <button className="primary" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存记录"}
        </button>
      </div>

      {msg && <div className="form-msg">{msg}</div>}

      <div className="field-grid">
        <label>
          <span>马匹编号 *</span>
          <input value={horseId} onChange={(e) => setHorseId(e.target.value)} placeholder="如 HORSE-18" />
        </label>
        <label>
          <span>马匹名称</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 闪电" />
        </label>
        <label>
          <span>品种</span>
          <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="如 纯血马" />
        </label>
        <label>
          <span>年龄</span>
          <input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} />
        </label>
        <label>
          <span>马匹类型</span>
          <select value={horseType} onChange={(e) => setHorseType(e.target.value as HorseType)}>
            {HORSE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>步态问题（逗号分隔）</span>
          <input value={gaitIssues} onChange={(e) => setGaitIssues(e.target.value)} placeholder="如 右前蹄外侧磨耗, 步态轻微不稳" />
        </label>
        <label>
          <span>蹄形评估</span>
          <input value={hoofShape} onChange={(e) => setHoofShape(e.target.value)} placeholder="如 蹄形端正" />
        </label>
        <label>
          <span>蹄铁类型</span>
          <select value={horseshoeType} onChange={(e) => setHorseshoeType(e.target.value)}>
            {HORSESHOE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          <span>钉位</span>
          <input value={nailPosition} onChange={(e) => setNailPosition(e.target.value)} placeholder="如 左前 3 钉" />
        </label>
        <label>
          <span>备注</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="其他备注" />
        </label>
      </div>

      <h3 className="checks-title">蹄位检查（左右前后蹄对比）</h3>
      <div className="hoof-checks">
        {hoofChecks.map((check) => (
          <div key={check.position} className="hoof-check">
            <div className="hoof-position">{check.position}</div>
            <label>
              <span>钉位</span>
              <input
                value={check.nailPosition}
                onChange={(e) => updateCheck(check.position, { nailPosition: e.target.value })}
                placeholder="钉位"
              />
            </label>
            <label>
              <span>蹄形</span>
              <input
                value={check.hoofShape}
                onChange={(e) => updateCheck(check.position, { hoofShape: e.target.value })}
                placeholder="蹄形"
              />
            </label>
            <label>
              <span>步态问题</span>
              <input
                value={check.gaitIssue}
                onChange={(e) => updateCheck(check.position, { gaitIssue: e.target.value })}
                placeholder="步态"
              />
            </label>
            <label className="abnormal">
              <input
                type="checkbox"
                checked={check.abnormalGait}
                onChange={(e) => updateCheck(check.position, { abnormalGait: e.target.checked })}
              />
              <span>异常步态标记</span>
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
