"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

const API_PREDICT = `${BASE_URL}/predict`;
const API_STATS = `${BASE_URL}/stats`;
const API_STATS_RESET = `${BASE_URL}/stats/reset`;
const API_MONITOR_START = `${BASE_URL}/monitor/start`;
const API_MONITOR_STOP = `${BASE_URL}/monitor/stop`;
const API_UPLOAD = `${BASE_URL}/upload-dataset/`;
const API_RECENT_ALERTS = `${BASE_URL}/recent/alerts?limit=10`;

type PageId = "dashboard" | "live" | "alerts" | "model" | "dataset" | "predict";
type RiskLevel = "High" | "Medium" | "Low";

type StatsResponse = {
  total: number;
  benign: number;
  attack: number;
  benign_pct: number;
  attack_pct: number;
  last_prediction?: { label: string; probability: number };
};

type PredictionResponse = {
  label?: string;
  probability?: number;
  received_features?: Record<string, number>;
  [key: string]: any;
};

type UploadMode = "train" | "test";

type AlertItem = {
  time: string;
  src: string;
  dst: string;
  type: string;
  risk: RiskLevel;
};

type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

async function safeFetchJSON<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, status: res.status, error: text || `Request failed (${res.status})` };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Network error" };
  }
}

export default function Home() {
  const navItems = useMemo(
    () => [
      { id: "dashboard" as const, label: "Dashboard", emoji: "🏠" },
      { id: "live" as const, label: "Live Traffic", emoji: "📡" },
      { id: "alerts" as const, label: "Alerts", emoji: "🚨" },
      { id: "model" as const, label: "Model", emoji: "📊" },
      { id: "dataset" as const, label: "Dataset", emoji: "📁" },
      { id: "predict" as const, label: "Test API", emoji: "🧪" },
    ],
    []
  );

  const [activePage, setActivePage] = useState<PageId>("dashboard");

  // ===== Stats =====
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);

  const fetchStats = async () => {
    const r = await safeFetchJSON<StatsResponse>(API_STATS);
    if (r.ok) {
      setStats(r.data);
      setStatsErr(null);
    } else {
      setStatsErr(r.error);
    }
  };

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 2000);
    return () => clearInterval(id);
  }, []);

  // ===== Recent Alerts (LIVE) =====
  const [recentAlerts, setRecentAlerts] = useState<AlertItem[]>([]);
  const [recentErr, setRecentErr] = useState<string | null>(null);

  const fetchRecentAlerts = async () => {
    const r = await safeFetchJSON<{ items: AlertItem[] }>(API_RECENT_ALERTS);
    if (r.ok) {
      setRecentAlerts(r.data.items || []);
      setRecentErr(null);
    } else {
      setRecentErr(r.error);
    }
  };

  useEffect(() => {
    fetchRecentAlerts();
    const id = setInterval(fetchRecentAlerts, 2000);
    return () => clearInterval(id);
  }, []);

  // ===== Monitoring =====
  const [monitoring, setMonitoring] = useState(false);
  const [monitorStatus, setMonitorStatus] = useState<string | null>(null);
  const [monitorBusy, setMonitorBusy] = useState(false);

  const startMonitoring = async () => {
    setMonitorBusy(true);
    setMonitorStatus(null);
    const r = await safeFetchJSON<any>(API_MONITOR_START);
    if (r.ok) {
      setMonitoring(true);
      setMonitorStatus("✅ Monitoring started.");
    } else {
      setMonitorStatus(`❌ Start failed: ${r.error}`);
    }
    setMonitorBusy(false);
  };

  const stopMonitoring = async () => {
    setMonitorBusy(true);
    setMonitorStatus(null);
    const r = await safeFetchJSON<any>(API_MONITOR_STOP);
    if (r.ok) {
      setMonitoring(false);
      setMonitorStatus("✅ Monitoring stopped.");
    } else {
      setMonitorStatus(`❌ Stop failed: ${r.error}`);
    }
    setMonitorBusy(false);
  };

  // ===== Reset Stats =====
  const [resetBusy, setResetBusy] = useState(false);
  const resetStats = async () => {
    setResetBusy(true);
    const r = await safeFetchJSON<any>(API_STATS_RESET, { method: "POST" });
    if (r.ok) {
      await fetchStats();
      await fetchRecentAlerts();
      setMonitorStatus("✅ Stats reset.");
    } else {
      setMonitorStatus(`❌ Reset failed: ${r.error}`);
    }
    setResetBusy(false);
  };

  // ===== Predict (Test API) =====
  const [jsonInput, setJsonInput] = useState<string>(`{
  "Flow Duration": 12345,
  "Total Fwd Packets": 10,
  "Total Backward Packets": 5
}`);
  const [predBusy, setPredBusy] = useState(false);
  const [predError, setPredError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);

  const runPredict = async () => {
    setPredError(null);
    setPrediction(null);

    let payload: any;
    try {
      payload = JSON.parse(jsonInput);
    } catch {
      setPredError("Invalid JSON.");
      return;
    }

    setPredBusy(true);
    const r = await safeFetchJSON<PredictionResponse>(API_PREDICT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (r.ok) {
      setPrediction(r.data);
      await fetchStats();
      await fetchRecentAlerts(); // ✅ عشان الجدول يتحدث فورًا
    } else {
      setPredError(r.error);
    }

    setPredBusy(false);
  };

  // ===== Upload =====
  const [uploadMode, setUploadMode] = useState<UploadMode>("train");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const chooseFile = () => {
    if (!fileRef.current) return;
    fileRef.current.value = "";
    fileRef.current.click();
  };

  const onFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] ?? null;
    setUploadFile(f);
    setUploadMsg(f ? `Selected: ${f.name}` : "No file selected.");
  };

  const uploadDataset = async () => {
    if (!uploadFile) {
      setUploadMsg("❌ Select a file first.");
      return;
    }

    setUploadBusy(true);
    setUploadMsg("⏳ Uploading...");

    try {
      const form = new FormData();
      form.append("file", uploadFile);

      const res = await fetch(`${API_UPLOAD}?mode=${uploadMode}`, { method: "POST", body: form });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      setUploadMsg(`✅ Done. mode=${data.mode} rows=${data.rows ?? "?"} cols=${data.cols ?? "?"}`);
    } catch (e: any) {
      setUploadMsg(`❌ ${e?.message || "Upload error"}`);
    } finally {
      setUploadBusy(false);
    }
  };

  const lastLabel = stats?.last_prediction?.label ?? "--";
  const lastProb =
    stats?.last_prediction?.probability !== undefined
      ? stats.last_prediction.probability.toFixed(4)
      : "--";

  return (
    <div className="min-h-screen bg-[#020014] text-slate-50">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-32 -left-32 h-72 w-72 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#0b1020_0,_#020014_55%,_#000_100%)] opacity-90" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-cyan-500/10 bg-black/60 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/80 to-fuchsia-400/80 text-xs font-bold text-slate-950">
                IDS
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight">Intrusion Detection Dashboard</div>
                <div className="text-[0.7rem] text-slate-400">
                  Backend: <span className="text-slate-200">{BASE_URL}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-2 text-slate-300">
                <span className={"h-2 w-2 rounded-full " + (monitoring ? "bg-emerald-400" : "bg-slate-500")} />
                {monitoring ? "Monitoring Active" : "Monitoring Paused"}
              </span>
              <span className="hidden sm:inline text-slate-400">
                Last: <span className="text-slate-100">{lastLabel}</span> ({lastProb})
              </span>
            </div>
          </div>

          <div className="mx-auto max-w-6xl px-6 pb-3 md:hidden">
            <div className="flex gap-2 overflow-x-auto">
              {navItems.map((it) => {
                const active = activePage === it.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => setActivePage(it.id)}
                    className={
                      "shrink-0 flex items-center gap-2 rounded-xl border px-3 py-2 text-[0.78rem] " +
                      (active
                        ? "bg-cyan-500/20 border-cyan-400/70 text-cyan-100"
                        : "bg-black/30 border-slate-800 text-slate-200 hover:bg-slate-900/50")
                    }
                  >
                    <span>{it.emoji}</span>
                    <span>{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        <main className="flex-1 py-6">
          <div className="mx-auto flex max-w-6xl gap-5 px-6">
            <aside className="hidden w-52 shrink-0 flex-col rounded-2xl border border-slate-800 bg-black/70 p-3 md:flex">
              <div className="mb-3 px-2 text-[0.7rem] text-slate-400">Navigation</div>
              <div className="space-y-1">
                {navItems.map((it) => {
                  const active = activePage === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => setActivePage(it.id)}
                      className={
                        "w-full rounded-xl px-3 py-2 text-left text-[0.8rem] flex items-center gap-2 border " +
                        (active
                          ? "bg-cyan-500/20 border-cyan-400/70 text-cyan-100"
                          : "border-transparent text-slate-300 hover:bg-slate-900/70 hover:border-slate-700")
                      }
                    >
                      <span>{it.emoji}</span>
                      <span>{it.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                <div className="text-[0.7rem] text-slate-400">Quick Control</div>
                <div className="mt-3 flex flex-col gap-2">
                  <PrimaryBtn onClick={startMonitoring} disabled={monitorBusy || monitoring} label="Start Monitoring" />
                  <GhostBtn onClick={stopMonitoring} disabled={monitorBusy || !monitoring} label="Stop Monitoring" />
                  <DangerBtn onClick={resetStats} disabled={resetBusy} label="Reset Stats" />
                </div>
              </div>
            </aside>

            <section className="flex-1">
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <MetricTile label="Total Flows" value={stats ? String(stats.total) : "--"} accent="fuchsia" />
                <MetricTile label="BENIGN" value={stats ? `${stats.benign} (${stats.benign_pct}%)` : "--"} accent="cyan" />
                <MetricTile label="ATTACK" value={stats ? `${stats.attack} (${stats.attack_pct}%)` : "--"} accent="emerald" />
              </div>

              {statsErr && <Notice tone="warn">Stats fetch warning: {statsErr}</Notice>}
              {monitorStatus && <Notice tone="warn">{monitorStatus}</Notice>}
              {recentErr && <Notice tone="warn">Recent alerts warning: {recentErr}</Notice>}

              {activePage === "dashboard" && (
                <div className="grid gap-6 lg:grid-cols-[1.7fr,1.3fr]">
                  <div className="flex flex-col gap-6">
                    <NeonCard title="Control Panel" rightLabel="Real buttons">
                      <div className="flex flex-wrap gap-2">
                        <PrimaryBtn
                          onClick={startMonitoring}
                          disabled={monitorBusy || monitoring}
                          label={monitoring ? "Monitoring Active" : "Start Monitoring"}
                        />
                        <GhostBtn onClick={stopMonitoring} disabled={monitorBusy || !monitoring} label="Stop Monitoring" />
                        <DangerBtn onClick={resetStats} disabled={resetBusy} label={resetBusy ? "Resetting..." : "Reset Stats"} />
                      </div>
                    </NeonCard>

                    {/* ✅ Live Table */}
                    <NeonCard title="Recent Alerts (LIVE)" rightLabel="from /recent/alerts">
                      {recentAlerts.length === 0 ? (
                        <div className="text-xs text-slate-400">
                          No alerts yet. (Generate more traffic or increase attack ratio)
                        </div>
                      ) : (
                        <div className="overflow-x-auto text-xs">
                          <table className="w-full text-left">
                            <thead className="border-b border-slate-800/80 text-slate-400">
                              <tr>
                                <th className="py-1.5 font-medium">Time</th>
                                <th className="py-1.5 font-medium">Source</th>
                                <th className="py-1.5 font-medium">Dest</th>
                                <th className="py-1.5 font-medium">Type</th>
                                <th className="py-1.5 font-medium">Risk</th>
                              </tr>
                            </thead>
                            <tbody>
                              {recentAlerts.map((a, idx) => (
                                <tr key={idx} className="border-b border-slate-900/70">
                                  <td className="py-1.5 text-slate-200">{a.time}</td>
                                  <td className="py-1.5 text-slate-200">{a.src}</td>
                                  <td className="py-1.5 text-slate-200">{a.dst}</td>
                                  <td className="py-1.5 text-slate-200">{a.type}</td>
                                  <td className="py-1.5">
                                    <RiskPill risk={a.risk} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </NeonCard>
                  </div>

                  <div className="flex flex-col gap-6">
                    <NeonCard title="Quick Actions" rightLabel="Shortcuts">
                      <div className="flex flex-wrap gap-2">
                        <PrimaryBtn onClick={() => setActivePage("predict")} label="Go to Test API" />
                        <GhostBtn onClick={() => setActivePage("dataset")} label="Go to Dataset" />
                        <GhostBtn onClick={fetchStats} label="Refresh Stats" />
                      </div>
                    </NeonCard>

                    <NeonCard title="Live Snapshot" rightLabel="/stats">
                      <div className="rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                        <pre className="whitespace-pre-wrap break-words text-slate-100">
                          {stats ? JSON.stringify(stats, null, 2) : "--"}
                        </pre>
                      </div>
                    </NeonCard>
                  </div>
                </div>
              )}

              {activePage === "dataset" && (
                <NeonCard title="Dataset Manager" rightLabel="POST /upload-dataset/?mode=">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-slate-400">Mode:</span>
                    <button
                      type="button"
                      onClick={() => setUploadMode("train")}
                      className={
                        "rounded-full border px-3 py-1 text-[0.75rem] " +
                        (uploadMode === "train"
                          ? "bg-cyan-500/20 border-cyan-400/70 text-cyan-100"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
                      }
                    >
                      Train
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode("test")}
                      className={
                        "rounded-full border px-3 py-1 text-[0.75rem] " +
                        (uploadMode === "test"
                          ? "bg-fuchsia-500/20 border-fuchsia-400/70 text-fuchsia-100"
                          : "bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800")
                      }
                    >
                      Test
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <PrimaryBtn onClick={chooseFile} disabled={uploadBusy} label="Select File" />
                    <GhostBtn onClick={uploadDataset} disabled={uploadBusy} label={uploadBusy ? "Uploading..." : "Upload"} />
                  </div>

                  <input ref={fileRef} type="file" accept=".csv,.parquet,.json" className="hidden" onChange={onFileChange} />

                  {uploadMsg && (
                    <div className="mt-3 rounded-xl border border-slate-800 bg-black/60 p-3 text-xs text-slate-200">
                      {uploadMsg}
                    </div>
                  )}
                </NeonCard>
              )}

              {activePage === "predict" && (
                <NeonCard title="Test API" rightLabel="POST /predict">
                  <label className="text-[0.78rem] text-slate-200">JSON Input</label>
                  <textarea
                    className="mt-2 min-h-[160px] w-full rounded-xl border border-cyan-500/40 bg-black/70 px-3 py-2 text-xs font-mono text-cyan-100 outline-none"
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PrimaryBtn onClick={runPredict} disabled={predBusy} label={predBusy ? "Predicting..." : "Run Prediction"} />
                    <GhostBtn onClick={fetchStats} label="Refresh Stats" />
                    <DangerBtn onClick={resetStats} disabled={resetBusy} label="Reset Stats" />
                  </div>

                  {predError && <Notice tone="error">Error: {predError}</Notice>}

                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                      <div className="mb-2 text-[0.72rem] text-slate-400">Prediction Response</div>
                      <pre className="whitespace-pre-wrap break-words text-slate-100">
                        {prediction ? JSON.stringify(prediction, null, 2) : "--"}
                      </pre>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-black/60 p-3 text-xs">
                      <div className="mb-2 text-[0.72rem] text-slate-400">Live Stats</div>
                      <pre className="whitespace-pre-wrap break-words text-slate-100">
                        {stats ? JSON.stringify(stats, null, 2) : "--"}
                      </pre>
                    </div>
                  </div>
                </NeonCard>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

/* UI */
function NeonCard({ title, rightLabel, children }: { title: string; rightLabel?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-black/75 p-5 shadow-[0_0_35px_rgba(15,23,42,0.55)]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-slate-50">{title}</h2>
        {rightLabel && <span className="text-[0.7rem] text-slate-400">{rightLabel}</span>}
      </div>
      {children}
    </div>
  );
}

function MetricTile({ label, value, accent }: { label: string; value: string; accent: "cyan" | "fuchsia" | "indigo" | "emerald" }) {
  const map: Record<string, string> = {
    cyan: "border-cyan-500/60 text-cyan-200",
    fuchsia: "border-fuchsia-500/60 text-fuchsia-200",
    indigo: "border-indigo-500/60 text-indigo-200",
    emerald: "border-emerald-500/60 text-emerald-200",
  };
  return (
    <div className={"rounded-xl border bg-black/70 px-3 py-3 " + map[accent]}>
      <div className="text-[0.7rem] text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function RiskPill({ risk }: { risk: RiskLevel }) {
  const cls =
    risk === "High"
      ? "border-red-400/70 bg-red-500/20 text-red-200"
      : risk === "Medium"
      ? "border-amber-400/70 bg-amber-500/20 text-amber-200"
      : "border-emerald-400/70 bg-emerald-500/20 text-emerald-200";
  return <span className={"rounded-full border px-2 py-0.5 text-[0.7rem] " + cls}>{risk}</span>;
}

function Notice({ tone, children }: { tone: "warn" | "error"; children: React.ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
      : "border-rose-500/40 bg-rose-950/20 text-rose-200";
  return <div className={"mb-5 rounded-xl border px-4 py-3 text-xs " + cls}>{children}</div>;
}

function PrimaryBtn({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-cyan-400/80 bg-cyan-500 px-4 py-1.5 text-[0.75rem] font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-cyan-400 hover:border-cyan-300"
    >
      {label}
    </button>
  );
}

function GhostBtn({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-slate-700 bg-slate-900 px-4 py-1.5 text-[0.75rem] text-slate-100 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-800 hover:border-slate-500"
    >
      {label}
    </button>
  );
}

function DangerBtn({ onClick, disabled, label }: { onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-rose-400/70 bg-rose-500/20 px-4 py-1.5 text-[0.75rem] text-rose-200 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-rose-500/30 hover:border-rose-300"
    >
      {label}
    </button>
  );
}
