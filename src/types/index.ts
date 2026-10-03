/**
 * 修蹄台核心类型定义
 *
 * 关键设计：马匹档案、蹄位检查、蹄铁更换共用同一个修订号（rev）。
 * 同一张修蹄单（WorkOrder）下的任意子记录被修改，整张单子的 rev 都递增，
 * 合并时以 rev 作为版本判据。
 */

/** 蹄位：左前 / 右前 / 左后 / 右后 */
export type HoofPosition = "左前" | "右前" | "左后" | "右后";

/** 马匹类型（对应筛选器：运动马 / 休养马） */
export type HorseType = "运动马" | "休养马";

/** 单子来源：本机 / 中央 / 合并（两边都改过，留两份来源） */
export type OrderSource = "local" | "central" | "merged";

/** 单子同步状态 */
export type OrderStatus =
  | "draft" // 草稿（本机未提交）
  | "pending" // 待同步（断网暂存）
  | "synced" // 已入库
  | "conflict" // 两边都改过，已留两份来源
  | "failed"; // 入库失败，保留本地批次待重试

/** 网络状态 */
export type NetworkStatus = "online" | "offline";

/** 照片备注 */
export interface PhotoNote {
  id: string;
  /** 照片引用（可查的历史照片备注） */
  photoRef: string;
  /** 备注内容 */
  note: string;
  /** 拍摄/记录时间 */
  takenAt: string;
}

/** 马匹档案 */
export interface HorseProfile {
  horseId: string;
  name: string;
  breed: string;
  age: number;
  type: HorseType;
  /** 步态问题 */
  gaitIssues: string[];
  /** 蹄形评估 */
  hoofShape: string;
  /** 备注 */
  notes: string;
  /** 照片备注（可查） */
  photoNotes: PhotoNote[];
}

/** 蹄位检查（四个蹄位各一条） */
export interface HoofCheck {
  id: string;
  position: HoofPosition;
  /** 钉位（历史钉位可查） */
  nailPosition: string;
  /** 蹄形 */
  hoofShape: string;
  /** 步态问题 */
  gaitIssue: string;
  /** 异常步态标记 */
  abnormalGait: boolean;
  /** 备注 */
  notes: string;
  /** 照片备注 */
  photoNotes: PhotoNote[];
}

/** 蹄铁更换记录 */
export interface HorseshoeChange {
  id: string;
  position: HoofPosition;
  /** 蹄铁类型（变化后训练放行失效重算） */
  horseshoeType: string;
  /** 钉位 */
  nailPosition: string;
  /** 更换时间 */
  changedAt: string;
  /** 备注 */
  notes: string;
}

/** 训练放行状态 */
export interface TrainingRelease {
  /** 是否放行 */
  released: boolean;
  /** 放行 / 失效原因 */
  reason: string;
  /** 最近一次重算时间 */
  computedAt: string;
  /** 本次重算所依据的蹄铁类型 */
  basedOnHorseshoeType: string;
}

/** 冲突记录：两边都改过的字段，保留两份来源，互不覆盖 */
export interface ConflictRecord {
  id: string;
  /** 冲突字段路径，如 horseProfile.name / hoofChecks[左前].nailPosition */
  field: string;
  /** 本机值 */
  localValue: unknown;
  /** 中央值 */
  centralValue: unknown;
  /** 本机修订号 */
  localRev: number;
  /** 中央修订号 */
  centralRev: number;
  /** 记录时间 */
  recordedAt: string;
}

/** 修蹄单（核心聚合根） */
export interface WorkOrder {
  /** 订单号（幂等键，同一单不重复计入） */
  id: string;
  /** 批次号（断网时按批次暂存，恢复网络后整批重试） */
  batchId: string;
  /** 共用修订号：马匹档案 / 蹄位检查 / 蹄铁更换共用 */
  rev: number;
  /** 马匹编号 */
  horseId: string;
  /** 建单时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 来源 */
  source: OrderSource;
  /** 同步状态 */
  status: OrderStatus;

  /** 马匹档案 */
  horseProfile: HorseProfile;
  /** 蹄位检查（四个蹄位） */
  hoofChecks: HoofCheck[];
  /** 蹄铁更换历史 */
  horseshoeChanges: HorseshoeChange[];
  /** 训练放行（随蹄铁类型变化失效重算） */
  trainingRelease: TrainingRelease;

  /** 冲突记录（两边都改过，留两份来源） */
  conflicts: ConflictRecord[];

  /**
   * 两份来源（仅当 source === 'merged' 时有值）。
   * 两边都改过的单子，保留本机与中央各自的完整快照，互不覆盖。
   */
  sources?: {
    local: WorkOrder;
    central: WorkOrder;
  };

  /** 入库失败次数（重试依据） */
  failCount: number;
  /** 最近一次失败原因 */
  lastError: string;
  /** 最近一次入库时间 */
  syncedAt: string;
}

/** 本地批次（断网暂存的一批单子） */
export interface LocalBatch {
  batchId: string;
  createdAt: string;
  orders: WorkOrder[];
  /** 批次状态 */
  status: "open" | "syncing" | "synced" | "partial";
}

/** 中央档案（模拟服务端） */
export interface CentralArchive {
  /** 已入库的单子，按订单号索引（幂等） */
  orders: Record<string, WorkOrder>;
  /** 已入库的批次号（幂等：同一批次不重复计入） */
  batches: Record<string, string>;
  /** 最近一次入库时间 */
  lastSyncAt: string;
}

/** 同步结果 */
export interface SyncResult {
  /** 订单号 */
  orderId: string;
  /** 处理结果 */
  outcome: "synced" | "conflict" | "duplicate" | "failed";
  /** 说明 */
  message: string;
  /** 冲突记录（若有） */
  conflicts?: ConflictRecord[];
}

/** 历史查询命中（钉位 / 照片备注） */
export interface HistoryHit {
  orderId: string;
  horseId: string;
  rev: number;
  kind: "nail" | "photo";
  /** 蹄位（钉位命中） */
  position?: HoofPosition;
  /** 钉位值 */
  nailPosition?: string;
  /** 照片引用（照片命中） */
  photoRef?: string;
  /** 备注内容 */
  note?: string;
  /** 时间 */
  at: string;
}
