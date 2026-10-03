# hxyfront-62011 马术蹄铁修整档案 · 可续作修蹄台

源提示词编号：6

面向马术俱乐部蹄铁师的**可续作修蹄台**：远场马房断网时先存本机，回场后合并中央档案。马匹档案、蹄位检查、蹄铁更换共用一个修订号，两边都改过就留两份来源、互不覆盖。蹄铁类型变化后旧训练放行失效重算；入库失败保留本地批次，恢复网络重试且同一单不重复计入；升级时旧数据缺失的修订号自动回填；历史钉位与照片备注随时可查。

## 核心能力

| 能力 | 说明 |
|------|------|
| 断网存本机 | 断网时单子暂存 localStorage（状态 `pending`），恢复网络后自动合并 |
| 回场合并中央 | 在线时将本机批次合并到中央档案（模拟服务端） |
| 共用修订号 | 马匹档案 / 蹄位检查 / 蹄铁更换共用一个 `rev`，任意子记录变更则整单 `rev++` |
| 冲突留两份来源 | 两边都改过（本机与中央 `rev` 均大于基础修订号）→ `source: 'merged'`，`sources.local` 与 `sources.central` 各自完整保留，互不覆盖 |
| 蹄铁类型变化放行失效重算 | 蹄铁类型变化后，`recomputeRelease` 按新类型重算训练放行状态 |
| 失败保留批次重试幂等 | 入库失败 → 状态 `failed`、`failCount++`，本地批次保留；恢复网络重试；同一订单号不重复计入 |
| 旧数据修订号回填 | 升级时 `backfillOrders` 自动补全缺失的 `rev` / `batchId` / `source` / `status` |
| 历史钉位照片可查 | `queryNailHistory` / `queryPhotoHistory` 跨本机与中央检索钉位与照片备注 |

## 演示控制台

页面底部「演示控制台」提供一键演示：

- **模拟两边都改过**：建单同步到中央 → 本机改一次 → 中央改一次 → 再同步 → 冲突留两份来源
- **模拟入库失败**：开启失败开关后建单同步失败，本地批次保留；关闭开关后可重试，同一单不重复计入
- **回填旧数据**：写入无修订号的旧单子，加载时自动回填 `rev`
- **清空全部数据**

## 技术栈

React + Vite + TypeScript

## 本地运行

```bash
npm install
npm run dev
```

开发端口：62011

## 目录结构

```
src/
├── types/index.ts          # 核心类型（WorkOrder / HorseProfile / HoofCheck / HorseshoeChange ...）
├── utils/
│   ├── revision.ts         # 修订号工具（bumpRev / generateOrderId ...）
│   ├── invalidation.ts     # 训练放行失效重算（recomputeRelease / isReleaseInvalid）
│   ├── migration.ts        # 旧数据修订号回填（backfillOrders）
│   └── history.ts          # 历史钉位 / 照片备注查询
├── store/
│   ├── localStore.ts       # 本机存储（断网暂存）
│   ├── centralStore.ts     # 中央档案（模拟服务端，含失败开关）
│   └── syncEngine.ts       # 同步引擎（三方合并 / 冲突留两份 / 幂等重试）
├── hooks/
│   ├── useNetwork.ts       # 网络状态（在线 / 断网切换）
│   └── useSync.ts          # 同步批次（待同步 / 失败重试 / 结果）
└── components/
    ├── NetworkStatus.tsx   # 网络状态指示器
    ├── Metrics.tsx         # 指标卡片
    ├── OrderForm.tsx       # 新增修蹄单表单
    ├── OrderList.tsx       # 修蹄单列表（含冲突两份来源展示）
    ├── SyncPanel.tsx       # 同步批次面板
    ├── HistoryQuery.tsx    # 历史钉位 / 照片备注查询
    └── DemoControls.tsx    # 演示控制台
```
