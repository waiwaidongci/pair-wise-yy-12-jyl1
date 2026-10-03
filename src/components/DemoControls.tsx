import { useState } from "react";
import { useNetwork } from "../hooks/useNetwork";
import { setFailureSimulated } from "../store/centralStore";
import { loadCentralArchive } from "../store/centralStore";
import { loadLocalOrders, saveLocalOrders } from "../store/localStore";
import { appendLocalOrder } from "../store/localStore";
import { syncOrder } from "../store/syncEngine";
import { recomputeRelease } from "../utils/invalidation";
import { generateBatchId, generateId, INITIAL_REV } from "../utils/revision";
import type { WorkOrder } from "../types";

/**
 * 演示控制台。
 *
 * 提供一键演示：
 * - 模拟两边都改过（冲突，留两份来源）
 * - 模拟入库失败（保留本地批次，恢复网络重试）
 * - 回填旧数据缺失的修订号
 * - 清空全部数据
 */
export function DemoControls({ onChanged }: { onChanged: () => void }) {
  const { isOnline, goOnline } = useNetwork();
  const [failureOn, setFailureOn] = useState(false);
  const [msg, setMsg] = useState("");

  const flash = (text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(""), 4000);
  };

  /**
   * 模拟两边都改过：
   * 1. 建单并同步到中央（两边同 rev）
   * 2. 本机改一次（rev++）
   * 3. 中央改一次（rev++）
   * 4. 再同步 -> 冲突，留两份来源
   */
  const simulateConflict = async () => {
    if (!isOnline) {
      flash("请先切换到在线状态再模拟冲突");
      return;
    }
    const now = new Date().toISOString();
    const order: WorkOrder = {
      id: generateId("WO"),
      batchId: generateBatchId(),
      rev: INITIAL_REV,
      horseId: "HORSE-CONFLICT",
      createdAt: now,
      updatedAt: now,
      source: "local",
      status: "pending",
      horseProfile: {
        horseId: "HORSE-CONFLICT",
        name: "冲突演示马",
        breed: "演示品种",
        age: 5,
        type: "运动马",
        gaitIssues: [],
        hoofShape: "端正",
        notes: "原始档案",
        photoNotes: [],
      },
      hoofChecks: [
        {
          id: generateId("hc"),
          position: "左前",
          nailPosition: "原始钉位",
          hoofShape: "端正",
          gaitIssue: "",
          abnormalGait: false,
          notes: "",
          photoNotes: [],
        },
      ],
      horseshoeChanges: [],
      trainingRelease: recomputeRelease(
        {
          horseId: "HORSE-CONFLICT",
          name: "冲突演示马",
          breed: "演示品种",
          age: 5,
          type: "运动马",
          gaitIssues: [],
          hoofShape: "端正",
          notes: "原始档案",
          photoNotes: [],
        },
        []
      ),
      conflicts: [],
      failCount: 0,
      lastError: "",
      syncedAt: "",
    };

    // 1. 同步到中央
    appendLocalOrder(order);
    await syncOrder(order);

    // 2. 本机改一次
    const localOrders = loadLocalOrders();
    const localIdx = localOrders.findIndex((o) => o.id === order.id);
    if (localIdx >= 0) {
      localOrders[localIdx] = {
        ...localOrders[localIdx],
        rev: localOrders[localIdx].rev + 1,
        horseProfile: {
          ...localOrders[localIdx].horseProfile,
          notes: "本机修改过的备注",
        },
      };
      saveLocalOrders(localOrders);
    }

    // 3. 中央改一次（直接改中央档案）
    const central = loadCentralArchive();
    if (central.orders[order.id]) {
      central.orders[order.id] = {
        ...central.orders[order.id],
        rev: central.orders[order.id].rev + 1,
        horseProfile: {
          ...central.orders[order.id].horseProfile,
          notes: "中央修改过的备注",
        },
      };
      localStorage.setItem(
        "farrier_central_archive_v1",
        JSON.stringify(central)
      );
    }

    // 4. 再同步 -> 冲突
    const updated = loadLocalOrders().find((o) => o.id === order.id);
    if (updated) {
      const result = await syncOrder(updated);
      flash(`冲突演示：${result.message}`);
    }
    onChanged();
  };

  /**
   * 模拟入库失败：
   * 开启失败开关后，新建单子同步会失败，保留本地批次；
   * 关闭开关后重试，同一单不重复计入。
   */
  const simulateFailure = async () => {
    if (!isOnline) {
      flash("请先切换到在线状态再模拟失败");
      return;
    }
    const next = !failureOn;
    setFailureOn(next);
    setFailureSimulated(next);
    if (next) {
      // 建一条新单子，同步会失败
      const now = new Date().toISOString();
      const order: WorkOrder = {
        id: generateId("WO"),
        batchId: generateBatchId(),
        rev: INITIAL_REV,
        horseId: "HORSE-FAIL",
        createdAt: now,
        updatedAt: now,
        source: "local",
        status: "pending",
        horseProfile: {
          horseId: "HORSE-FAIL",
          name: "失败演示马",
          breed: "演示品种",
          age: 4,
          type: "休养马",
          gaitIssues: [],
          hoofShape: "",
          notes: "",
          photoNotes: [],
        },
        hoofChecks: [],
        horseshoeChanges: [],
        trainingRelease: recomputeRelease(
          {
            horseId: "HORSE-FAIL",
            name: "失败演示马",
            breed: "演示品种",
            age: 4,
            type: "休养马",
            gaitIssues: [],
            hoofShape: "",
            notes: "",
            photoNotes: [],
          },
          []
        ),
        conflicts: [],
        failCount: 0,
        lastError: "",
        syncedAt: "",
      };
      appendLocalOrder(order);
      const result = await syncOrder(order);
      flash(`失败演示：${result.message}（本地批次已保留）`);
    } else {
      flash("已关闭失败模拟，可点击「立即重试」恢复网络重试");
    }
    onChanged();
  };

  /**
   * 回填旧数据：
   * 写入一条没有 rev 的旧单子，加载时自动回填修订号。
   */
  const simulateBackfill = () => {
    const legacy = {
      id: "LEGACY-DEMO-001",
      horseId: "HORSE-LEGACY",
      // 故意不写 rev / batchId / source / status
      horseProfile: {
        horseId: "HORSE-LEGACY",
        name: "旧数据马",
        breed: "本地品种",
        age: 8,
        type: "休养马" as const,
        gaitIssues: ["旧伤"],
        hoofShape: "扁平",
        notes: "升级前的历史数据",
        photoNotes: [],
      },
      hoofChecks: [],
      horseshoeChanges: [],
      conflicts: [],
      failCount: 0,
      lastError: "",
    };
    const orders = loadLocalOrders();
    orders.push(legacy as unknown as WorkOrder);
    saveLocalOrders(orders);
    flash("已写入旧数据（无修订号），刷新列表时自动回填 rev");
    onChanged();
  };

  /**
   * 清空全部数据。
   */
  const clearAll = () => {
    localStorage.removeItem("farrier_local_orders_v1");
    localStorage.removeItem("farrier_local_batches_v1");
    localStorage.removeItem("farrier_central_archive_v1");
    localStorage.removeItem("farrier_base_rev_v1");
    setFailureSimulated(false);
    setFailureOn(false);
    flash("已清空全部数据");
    onChanged();
  };

  return (
    <section className="panel demo-panel">
      <div className="heading">
        <div>
          <p>演示</p>
          <h2>一键演示核心场景</h2>
        </div>
      </div>
      {msg && <div className="form-msg">{msg}</div>}
      <div className="demo-buttons">
        <button onClick={simulateConflict} disabled={!isOnline}>
          模拟两边都改过（冲突留两份来源）
        </button>
        <button onClick={simulateFailure} disabled={!isOnline}>
          {failureOn ? "关闭失败模拟" : "模拟入库失败（保留本地批次）"}
        </button>
        <button onClick={simulateBackfill}>
          回填旧数据缺失的修订号
        </button>
        <button onClick={clearAll} className="danger">
          清空全部数据
        </button>
      </div>
      {!isOnline && (
        <p className="demo-hint">
          当前为断网状态，部分演示需先切换到在线。
          <button className="link" onClick={goOnline}>
            点此切回在线
          </button>
        </p>
      )}
    </section>
  );
}
