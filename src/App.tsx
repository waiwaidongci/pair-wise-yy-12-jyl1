import { useState } from "react";
import { NetworkStatus } from "./components/NetworkStatus";
import { Metrics } from "./components/Metrics";
import { SyncPanel } from "./components/SyncPanel";
import { OrderForm } from "./components/OrderForm";
import { OrderList } from "./components/OrderList";
import { HistoryQuery } from "./components/HistoryQuery";
import { DemoControls } from "./components/DemoControls";
import { useSync } from "./hooks/useSync";
import { useNetwork } from "./hooks/useNetwork";

/**
 * 可续作修蹄台
 *
 * 核心能力：
 * - 断网时存本机，回场后合并中央档案
 * - 马匹档案、蹄位检查、蹄铁更换共用一个修订号
 * - 两边都改过就留两份来源，不得互相覆盖
 * - 蹄铁类型变化后旧训练放行失效重算
 * - 入库失败后保留本地批次，恢复网络重试，同一单不重复计入
 * - 升级时旧数据没有修订号就回填
 * - 历史钉位和照片备注可查
 */
function App() {
  const [refreshKey, setRefreshKey] = useState(0);
  const {
    pendingOrders,
    syncing,
    lastResults,
    refresh: refreshSync,
    retry,
  } = useSync();
  const { isOnline } = useNetwork();

  const refresh = () => {
    setRefreshKey((k) => k + 1);
    refreshSync();
    // 在线时立即同步新保存的单子
    if (isOnline) {
      retry();
    }
  };

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-top">
          <div>
            <p>可续作修蹄台 · 断网续作</p>
            <h1>马术蹄铁修整档案</h1>
          </div>
          <NetworkStatus />
        </div>
        <span>
          远场马房断网时，蹄铁师先在纸面记录；回场后将本机批次合并到中央档案。
          马匹档案、蹄位检查、蹄铁更换共用一个修订号，两边都改过就留两份来源、互不覆盖。
          蹄铁类型变化后旧训练放行失效重算；入库失败保留本地批次，恢复网络重试且同一单不重复计入；
          升级时旧数据缺失的修订号自动回填；历史钉位与照片备注随时可查。
        </span>
      </section>

      <Metrics refreshKey={refreshKey} />

      <div className="workspace">
        <aside className="panel side-panel">
          <h2>修蹄台导航</h2>
          <div className="chips vertical">
            <a href="#new-order">新增修蹄单</a>
            <a href="#sync">同步批次</a>
            <a href="#orders">修蹄单列表</a>
            <a href="#history">历史查询</a>
            <a href="#demo">演示控制台</a>
          </div>
          {pendingOrders.length > 0 && (
            <div className="pending-badge">
              {pendingOrders.length} 单待同步
            </div>
          )}
        </aside>

        <div className="main-col">
          <div id="new-order">
            <OrderForm onSaved={refresh} />
          </div>
          <div id="sync">
            <SyncPanel
              pendingOrders={pendingOrders}
              syncing={syncing}
              lastResults={lastResults}
              onRetry={retry}
            />
          </div>
        </div>
      </div>

      <div id="orders">
        <OrderList refreshKey={refreshKey} />
      </div>

      <div id="history">
        <HistoryQuery />
      </div>

      <div id="demo">
        <DemoControls onChanged={refresh} />
      </div>

      <footer className="footer">
        <p>
          可续作修蹄台 · 断网存本机 · 回场合并中央 · 共用修订号 · 冲突留两份来源 ·
          蹄铁类型变化放行失效重算 · 失败保留批次重试幂等 · 旧数据修订号回填 · 历史钉位照片可查
        </p>
      </footer>
    </main>
  );
}

export default App;
