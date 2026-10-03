import { useMemo, useState } from "react";
import { queryNailHistory, queryPhotoHistory } from "../utils/history";
import type { HoofPosition } from "../types";

const POSITIONS: HoofPosition[] = ["左前", "右前", "左后", "右后"];

/**
 * 历史查询：历史钉位与照片备注可查。
 *
 * 支持按马匹编号、蹄位、关键词检索钉位历史；
 * 按马匹编号、关键词检索照片备注历史。
 */
export function HistoryQuery() {
  const [tab, setTab] = useState<"nail" | "photo">("nail");
  const [horseId, setHorseId] = useState("");
  const [position, setPosition] = useState("");
  const [keyword, setKeyword] = useState("");

  const nailHits = useMemo(
    () =>
      queryNailHistory({
        horseId: horseId.trim() || undefined,
        position: position || undefined,
        keyword: keyword.trim() || undefined,
      }),
    [horseId, position, keyword]
  );

  const photoHits = useMemo(
    () =>
      queryPhotoHistory({
        horseId: horseId.trim() || undefined,
        keyword: keyword.trim() || undefined,
      }),
    [horseId, keyword]
  );

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>历史档案</p>
          <h2>钉位与照片备注查询</h2>
        </div>
        <div className="chips">
          <button
            className={tab === "nail" ? "active" : ""}
            onClick={() => setTab("nail")}
          >
            历史钉位
          </button>
          <button
            className={tab === "photo" ? "active" : ""}
            onClick={() => setTab("photo")}
          >
            照片备注
          </button>
        </div>
      </div>

      <div className="field-grid">
        <label>
          <span>马匹编号</span>
          <input
            value={horseId}
            onChange={(e) => setHorseId(e.target.value)}
            placeholder="如 HORSE-18"
          />
        </label>
        {tab === "nail" && (
          <label>
            <span>蹄位</span>
            <select value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">全部蹄位</option>
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span>关键词</span>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="钉位 / 备注关键词"
          />
        </label>
      </div>

      <div className="records">
        {tab === "nail" &&
          (nailHits.length === 0 ? (
            <p className="empty">未找到钉位历史记录。</p>
          ) : (
            nailHits.map((hit, i) => (
              <article key={`${hit.orderId}-${i}`}>
                <b>{hit.position?.slice(0, 1) ?? "钉"}</b>
                <div>
                  <h3>
                    {hit.horseId} · {hit.position} · {hit.nailPosition}
                  </h3>
                  <p>
                    订单 {hit.orderId} · rev.{hit.rev} ·{" "}
                    {new Date(hit.at).toLocaleString("zh-CN")}
                  </p>
                  {hit.note && <p>备注：{hit.note}</p>}
                </div>
              </article>
            ))
          ))}

        {tab === "photo" &&
          (photoHits.length === 0 ? (
            <p className="empty">未找到照片备注记录。</p>
          ) : (
            photoHits.map((hit, i) => (
              <article key={`${hit.orderId}-${i}`}>
                <b>照</b>
                <div>
                  <h3>
                    {hit.horseId} · {hit.photoRef}
                  </h3>
                  <p>
                    订单 {hit.orderId} · rev.{hit.rev} ·{" "}
                    {new Date(hit.at).toLocaleString("zh-CN")}
                  </p>
                  {hit.note && <p>备注：{hit.note}</p>}
                </div>
              </article>
            ))
          ))}
      </div>
    </section>
  );
}
