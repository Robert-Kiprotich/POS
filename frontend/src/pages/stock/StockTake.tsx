import React, { useState, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import API from "../../services/api";

/* ------------------------------------------------------------------ *
 *  ADAPTER – the only place that depends on your backend shape.
 * ------------------------------------------------------------------ */
const STOCK_ENDPOINT = "products/";                       // returns products with stock for ?branch=<id>
const getSystemQty = (p: any): number => Number(p.total_stock ?? 0);
const pid = (p: any) => p.id ?? p.product_id ?? p.pk;     // safe product id
/* ------------------------------------------------------------------ */

type Row = {
  product: number;
  name: string;
  item_number: string;
  category: string;
  cost_price: number;
  system_qty: number;
  counted: string;            // keep as string so the input can be empty
  posted?: boolean;
  post_error?: string;
};

const money = (n: number) =>
  n.toLocaleString("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 2 });

// Fisher–Yates; unbiased, unlike sort(() => Math.random() - 0.5)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const toRow = (p: any): Row => ({
  product: pid(p),
  name: p.name,
  item_number: p.item_number || "",
  category: p.category_name || "",
  cost_price: Number(p.cost_price || 0),
  system_qty: getSystemQty(p),
  counted: "",
});

const variance = (r: Row) => (r.counted === "" ? null : Number(r.counted) - r.system_qty);

export default function StockTake({
  branches,
  onPosted,
}: {
  branches: any[];
  onPosted?: () => void;       // e.g. reload the movements list after adjustments are posted
}) {
  const [branch, setBranch] = useState("");
  const [sampleSize, setSampleSize] = useState(10);
  const [skipZero, setSkipZero] = useState(true);
  const [blind, setBlind] = useState(true);          // hide system qty while counting
  const [revealed, setRevealed] = useState(false);

  const [rows, setRows] = useState<Row[]>([]);
  const [generating, setGenerating] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState<string>("");

  const showSystem = !blind || revealed;

  // Loads the branch's products once, with duplicate / id-less rows removed
  const fetchPool = useCallback(async () => {
    const res = await API.get(STOCK_ENDPOINT, { params: { branch, page_size: 1000 } });
    const raw: any[] = res.data?.results || res.data?.data || (Array.isArray(res.data) ? res.data : []);
    const seen = new Set<any>();
    return raw.filter(p => {
      const id = pid(p);
      if (id == null || seen.has(id)) return false;
      seen.add(id);
      return !skipZero || getSystemQty(p) > 0;
    });
  }, [branch, skipZero]);

  const generate = useCallback(async () => {
    if (!branch) { setError("Select a branch to count."); return; }
    setError(""); setGenerating(true);
    try {
      const pool = await fetchPool();
      if (pool.length === 0) { setError("No products with stock found for this branch."); setRows([]); return; }
      setRows(shuffle(pool).slice(0, sampleSize).map(toRow));
      setRevealed(false);
      setStartedAt(new Date().toISOString());
    } catch (err) {
      console.error("Stock take load failed:", err);
      setError("Could not load stock for this branch.");
    } finally { setGenerating(false); }
  }, [branch, sampleSize, fetchPool]);

  const setCounted = (idx: number, v: string) =>
    setRows(rs => rs.map((r, i) => (i === idx ? { ...r, counted: v, posted: false, post_error: undefined } : r)));

  const swapItem = async (idx: number) => {
    // Replace one line with another random product not already in the sample
    try {
      const used = new Set(rows.map(r => r.product));
      const pool = (await fetchPool()).filter(p => !used.has(pid(p)));
      if (!pool.length) { setError("No other products available to swap in."); return; }
      const p = pool[Math.floor(Math.random() * pool.length)];
      setRows(rs => rs.map((r, i) => (i === idx ? toRow(p) : r)));
    } catch { setError("Could not swap this item."); }
  };

  /* ---------- summary ---------- */
  const stats = useMemo(() => {
    const counted = rows.filter(r => r.counted !== "");
    const withVar = counted.map(r => ({ r, v: variance(r) as number }));
    const matched = withVar.filter(x => x.v === 0).length;
    const short = withVar.filter(x => x.v < 0);
    const over = withVar.filter(x => x.v > 0);
    const valueNet = withVar.reduce((s, x) => s + x.v * x.r.cost_price, 0);
    const valueShort = short.reduce((s, x) => s + x.v * x.r.cost_price, 0);
    const valueOver = over.reduce((s, x) => s + x.v * x.r.cost_price, 0);
    return {
      total: rows.length,
      counted: counted.length,
      matched,
      shortCount: short.length,
      overCount: over.length,
      accuracy: counted.length ? Math.round((matched / counted.length) * 100) : 0,
      valueNet, valueShort, valueOver,
    };
  }, [rows]);

  const allCounted = rows.length > 0 && stats.counted === rows.length;
  const canPost = revealed && rows.some(r => variance(r) !== null && variance(r) !== 0 && !r.posted);

  /* ---------- post adjustments ---------- */
  const postAdjustments = async () => {
    const todo = rows
      .map((r, i) => ({ r, i, v: variance(r) }))
      .filter(x => x.v !== null && x.v !== 0 && !x.r.posted);
    if (!todo.length) return;
    if (!window.confirm(`Post ${todo.length} stock adjustment(s) so system stock matches the shelf count?`)) return;

    setPosting(true); setError("");
    let okCount = 0;
    for (const { r, i, v } of todo) {
      try {
        await API.post("stock-movements/adjust/", {
          product: r.product,
          branch,
          quantity_change: v,
          note: `Stock take ${startedAt.slice(0, 10)}: system ${r.system_qty}, counted ${r.counted}`,
        });
        okCount++;
        setRows(rs => rs.map((x, k) => (k === i ? { ...x, posted: true, post_error: undefined } : x)));
      } catch (err: any) {
        const d = err.response?.data;
        const msg = d?.error || d?.quantity_change?.[0] || "Failed";
        setRows(rs => rs.map((x, k) => (k === i ? { ...x, post_error: msg } : x)));
      }
    }
    setPosting(false);
    if (okCount) onPosted?.();
    if (okCount < todo.length) setError(`${todo.length - okCount} adjustment(s) failed. See the rows marked in red.`);
  };

  /* ---------- export ---------- */
  const buildSheet = () => {
    const head = ["Product", "Item #", "Category", "System Qty", "Counted Qty", "Variance", "Variance %", "Unit Cost", "Variance Value"];
    const body = rows.map(r => {
      const v = variance(r);
      return [
        r.name, r.item_number, r.category, r.system_qty, r.counted === "" ? "" : Number(r.counted),
        v ?? "", v === null || r.system_qty === 0 ? "" : `${((v / r.system_qty) * 100).toFixed(1)}%`,
        r.cost_price, v === null ? "" : v * r.cost_price,
      ];
    });
    return [head, ...body];
  };
  const branchName = branches.find(b => String(b.id) === branch)?.name || "branch";
  const exportCSV = () => {
    const lines = buildSheet().map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `stock_take_${branchName}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const exportExcel = () => {
    const ws = XLSX.utils.aoa_to_sheet(buildSheet());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Take");
    XLSX.writeFile(wb, `stock_take_${branchName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  /* ---------- UI ---------- */
  const tiles = [
    { label: "Items counted", value: `${stats.counted} / ${stats.total}`, icon: "ti-clipboard-check", bg: "bg-primary-gradient-100", color: "text-primary" },
    { label: "Matched", value: revealed ? `${stats.matched} (${stats.accuracy}%)` : "—", icon: "ti-circle-check", bg: "bg-success-gradient-100", color: "text-success" },
    { label: "Shortages", value: revealed ? stats.shortCount : "—", icon: "ti-trending-down", bg: "bg-danger-gradient-100", color: "text-danger" },
    { label: "Surplus", value: revealed ? stats.overCount : "—", icon: "ti-trending-up", bg: "bg-info-gradient-100", color: "text-info" },
    { label: "Net variance value", value: revealed ? money(stats.valueNet) : "—", icon: "ti-scale", bg: "bg-warning-gradient-100", color: "text-warning" },
  ];

  return (
    <div>
      {/* Setup */}
      <div className="card shadow-none border mb-3">
        <div className="card-body py-3">
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label className="form-label fs-12 fw-medium text-muted mb-1">Branch</label>
              <select className="form-select form-select-sm fs-13" value={branch}
                onChange={e => { setBranch(e.target.value); setRows([]); setRevealed(false); }}>
                <option value="">Select branch…</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label fs-12 fw-medium text-muted mb-1">Items to count</label>
              <select className="form-select form-select-sm fs-13" value={sampleSize}
                onChange={e => setSampleSize(Number(e.target.value))}>
                {[5, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>{n} items</option>)}
              </select>
            </div>
            <div className="col-md-4 d-flex flex-column gap-1">
              <div className="form-check fs-13">
                <input className="form-check-input" type="checkbox" id="st-blind" checked={blind}
                  disabled={revealed} onChange={e => setBlind(e.target.checked)} />
                <label className="form-check-label" htmlFor="st-blind">
                  Blind count (hide system quantity until I finish)
                </label>
              </div>
              <div className="form-check fs-13">
                <input className="form-check-input" type="checkbox" id="st-zero" checked={skipZero}
                  onChange={e => setSkipZero(e.target.checked)} />
                <label className="form-check-label" htmlFor="st-zero">Skip products with zero system stock</label>
              </div>
            </div>
            <div className="col-md-3 text-md-end">
              <button className="btn btn-primary btn-sm" onClick={generate} disabled={generating || !branch}>
                {generating ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-dice-5 me-1" />}
                {rows.length ? "Draw new sample" : "Draw random sample"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger fs-13 py-2">{error}</div>}

      {rows.length === 0 ? (
        <div className="card shadow-none border">
          <div className="card-body d-flex flex-column align-items-center py-5 text-muted">
            <i className="ti ti-clipboard-list fs-1 mb-2" />
            <p className="fs-14 mb-0">Pick a branch and draw a random sample to start counting the shelves.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="row g-3 mb-3">
            {tiles.map(t => (
              <div key={t.label} className="col-6 col-lg" style={{ flex: "1 1 0" }}>
                <div className="card mb-0 shadow-none border">
                  <div className="card-body p-3 position-relative">
                    <p className="fw-medium mb-1 fs-13">{t.label}</p>
                    <h5 className={`mb-0 ${t.color}`}>{t.value}</h5>
                    <div className={`avatar avatar-rounded avatar-sm ${t.bg} position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center`}>
                      <i className={`ti ${t.icon} fs-5 ${t.color}`} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="card shadow-none border">
            <div className="card-header border-bottom py-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div className="fs-13 text-muted">
                {branchName} · sample of <strong>{rows.length}</strong> · started {new Date(startedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <button className="btn btn-outline-success btn-sm" onClick={exportCSV}><i className="ti ti-file-text me-1" />CSV</button>
                <button className="btn btn-outline-success btn-sm" onClick={exportExcel}><i className="ti ti-table me-1" />Excel</button>
                {!revealed ? (
                  <button className="btn btn-primary btn-sm" disabled={!allCounted}
                    title={allCounted ? "" : "Enter a counted quantity for every item first"}
                    onClick={() => setRevealed(true)}>
                    <i className="ti ti-eye me-1" />Reveal variance
                  </button>
                ) : (
                  <button className="btn btn-warning btn-sm" disabled={!canPost || posting} onClick={postAdjustments}>
                    {posting ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="ti ti-adjustments me-1" />}
                    Post adjustments
                  </button>
                )}
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-hover mb-0 fs-13 align-middle">
                <thead className="table-light">
                  <tr>
                    <th>Product</th>
                    <th className="text-end">System qty</th>
                    <th style={{ width: 130 }}>Shelf count</th>
                    <th className="text-end">Variance</th>
                    <th className="text-end">Variance %</th>
                    <th className="text-end">Value</th>
                    <th>Result</th>
                    {!revealed && <th />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => {
                    const v = variance(r);
                    const show = revealed && v !== null;
                    const pct = show && r.system_qty > 0 ? (v! / r.system_qty) * 100 : null;
                    const cls = !show ? "" : v === 0 ? "text-success" : v! < 0 ? "text-danger" : "text-info";
                    return (
                      <tr key={`${r.product}-${idx}`} className={r.post_error ? "table-danger" : ""}>
                        <td>
                          <div className="fw-semibold text-dark">{r.name}</div>
                          <div className="text-muted fs-11">{[r.item_number, r.category].filter(Boolean).join(" · ")}</div>
                        </td>
                        <td className="text-end">{showSystem ? r.system_qty : <span className="text-muted">hidden</span>}</td>
                        <td>
                          <input type="text" inputMode="decimal" autoComplete="off"
                            className="form-control form-control-sm fs-13"
                            disabled={revealed} value={r.counted} placeholder="0"
                            onChange={e => {
                              const val = e.target.value;
                              if (/^\d*\.?\d*$/.test(val)) setCounted(idx, val);
                            }} />
                        </td>
                        <td className={`text-end fw-semibold ${cls}`}>
                          {show ? (v! > 0 ? `+${v}` : v) : "—"}
                        </td>
                        <td className={`text-end ${cls}`}>
                          {show ? (pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`) : "—"}
                        </td>
                        <td className={`text-end ${cls}`}>{show ? money(v! * r.cost_price) : "—"}</td>
                        <td>
                          {!show ? <span className="text-muted">—</span>
                            : r.posted ? <span className="badge bg-success-transparent text-success">Adjusted</span>
                            : r.post_error ? <span className="badge bg-danger-transparent text-danger" title={r.post_error}>Failed</span>
                            : v === 0 ? <span className="badge bg-success-transparent text-success">Match</span>
                            : v! < 0 ? <span className="badge bg-danger-transparent text-danger">Shortage</span>
                            : <span className="badge bg-info-transparent text-info">Surplus</span>}
                        </td>
                        {!revealed && (
                          <td className="text-end">
                            <button className="btn btn-sm btn-icon btn-light" title="Swap for another product"
                              onClick={() => swapItem(idx)}>
                              <i className="ti ti-refresh" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
                {revealed && (
                  <tfoot className="table-light">
                    <tr className="fw-semibold">
                      <td colSpan={5} className="text-end">Shortages {money(stats.valueShort)} · Surplus {money(stats.valueOver)} · Net</td>
                      <td className={`text-end ${stats.valueNet < 0 ? "text-danger" : stats.valueNet > 0 ? "text-info" : "text-success"}`}>
                        {money(stats.valueNet)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
