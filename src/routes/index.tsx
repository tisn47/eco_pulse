import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  HAZARD_LIMIT, IR_DETECT, SOUND_ALERT, UV_SAFE, mockReading, normalize, uvStatus,
  type RawReading, type Reading,
} from "@/lib/telemetry";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EcoPulse — Ecosystem & Occupational Health Monitor" },
      { name: "description", content: "Live UV, proximity and noise hazard monitoring dashboard for Arduino + Raspberry Pi sensor nodes." },
      { property: "og:title", content: "EcoPulse — Ecosystem & Occupational Health Monitor" },
      { property: "og:description", content: "Live UV, proximity and noise hazard monitoring dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type Alert = { id: number; time: string; text: string; kind: "uv" | "sound" };
const TABS = ["Combined Overview", "UV Radiation Trend", "Proximity Logs", "Acoustic Pollution"] as const;
const DEFAULT_URL = "http://localhost:5000/api/data";

function Dashboard() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [draft, setDraft] = useState(DEFAULT_URL);
  const [showSettings, setShowSettings] = useState(false);
  const [test, setTest] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [data, setData] = useState<Reading[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const idRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      let next: Reading[] | null = null;
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(to);
        const json = (await res.json()) as RawReading[] | RawReading;
        const arr = Array.isArray(json) ? json : [json];
        if (!arr.length) throw new Error("empty");
        next = arr.map(normalize);
        if (!cancelled) setLive(true);
      } catch {
        if (!cancelled) setLive(false);
      }
      if (cancelled) return;
      setData((prev) => {
        const incoming = next ?? [mockReading(prev[prev.length - 1])];
        const merged = next ? incoming.slice(-30) : [...prev, ...incoming].slice(-30);
        const latest = incoming[incoming.length - 1]!;
        const newAlerts: Alert[] = [];
        if (latest.uv >= UV_SAFE * 2)
          newAlerts.push({ id: ++idRef.current, time: latest.timestamp, kind: "uv", text: `UV Spike Detected: ${latest.uv.toFixed(0)}% - Exposure Warning Issued` });
        if (latest.sound > SOUND_ALERT)
          newAlerts.push({ id: ++idRef.current, time: latest.timestamp, kind: "sound", text: `Sound Spike Detected: ${latest.sound.toFixed(0)}% - Physical Alert Triggered` });
        if (newAlerts.length) setAlerts((a) => [...newAlerts.reverse(), ...a].slice(0, 50));
        return merged;
      });
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [url]);

  const testConnection = async () => {
    setTest("Testing…");
    try {
      const res = await fetch(draft, { signal: AbortSignal.timeout(2000) });
      await res.json();
      setTest("✓ Connected — receiving sensor data");
    } catch {
      setTest("✗ Unreachable — simulated data will be used");
    }
  };

  const last = data[data.length - 1] ?? { uv: 0, ir: 0, sound: 0, hazard: 0, timestamp: "--" };
  const uvS = uvStatus(last.uv);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-8">
      <header className="glass flex flex-wrap items-center justify-between gap-4 px-6 py-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">EcoPulse</p>
          <h1 className="text-2xl font-bold md:text-3xl">
            EcoPulse <span className="text-muted-foreground">|</span> Environmental Hazard & Health Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm ${live ? "text-primary" : "text-warning"}`}>
            <span className="pulse-dot h-2.5 w-2.5 rounded-full bg-current" />
            {live ? "Node #1 (Arduino R4 + Pi) Connected" : "Node #1 — Simulated Telemetry"}
          </span>
          <button onClick={() => setShowSettings((s) => !s)} className="rounded-full bg-secondary px-4 py-2 text-sm font-medium hover:bg-muted">
            API Settings
          </button>
        </div>
        {showSettings && (
          <div className="flex w-full flex-wrap items-center gap-3 border-t border-border pt-4">
            <input value={draft} onChange={(e) => setDraft(e.target.value)}
              className="min-w-[280px] flex-1 rounded-lg border border-input bg-background/60 px-3 py-2 font-mono text-sm outline-none focus:border-ring" />
            <button onClick={testConnection} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary">Test Connection</button>
            <button onClick={() => setUrl(draft)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save</button>
            {test && <span className="font-mono text-sm text-muted-foreground">{test}</span>}
          </div>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="UV Radiation Index" caption="Solar Exposure Risk" value={last.uv} unit="%"
          badge={uvS === "safe" ? "Safe" : uvS === "moderate" ? "Moderate" : "Dangerous Exposure"}
          tone={uvS === "safe" ? "ok" : uvS === "moderate" ? "warn" : "bad"} />
        <Metric title="Proximity & Occupancy" caption="Target Proximity Monitoring" value={last.ir} unit="%"
          badge={last.ir >= IR_DETECT ? "Object Detected / Station Occupied" : "Clear"} tone={last.ir >= IR_DETECT ? "info" : "ok"} />
        <Metric title="Noise Pollution Level" caption="Acoustic Stress Levels" value={last.sound} unit="%"
          badge={last.sound > SOUND_ALERT ? "Noise Hazard Alert" : "Normal Ambient"} tone={last.sound > SOUND_ALERT ? "bad" : "ok"} />
        <Metric title="Composite Hazard Index" caption="Weighted UV + Acoustic Score" value={last.hazard} unit="/100"
          badge={last.hazard >= HAZARD_LIMIT ? "Hazard Threshold Exceeded" : "Optimal Ecosystem"} tone={last.hazard >= HAZARD_LIMIT ? "bad" : "ok"} />
      </section>

      <section className="glass p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Real-Time Telemetry <span className="font-mono text-xs text-muted-foreground">last 30 intervals · 2s</span></h2>
          <div className="flex flex-wrap gap-1 rounded-full bg-secondary p-1">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-full px-4 py-1.5 text-sm transition ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12 }} />
              <Legend />
              {(tab === TABS[0] || tab === TABS[1]) && <Line type="monotone" dataKey="uv" name="UV %" stroke="var(--chart-1)" strokeWidth={2.5} dot={false} animationDuration={600} />}
              {(tab === TABS[0] || tab === TABS[2]) && <Line type="monotone" dataKey="ir" name="Proximity %" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} animationDuration={600} />}
              {(tab === TABS[0] || tab === TABS[3]) && <Line type="monotone" dataKey="sound" name="Sound %" stroke="var(--chart-3)" strokeWidth={2.5} dot={false} animationDuration={600} />}
              {tab === TABS[0] && <Line type="monotone" dataKey="hazard" name="Hazard" stroke="var(--chart-4)" strokeWidth={2} strokeDasharray="5 4" dot={false} animationDuration={600} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="glass p-6 lg:col-span-2">
          <h2 className="mb-3 text-lg font-semibold">Live Hazard Alert Log</h2>
          <div className="h-72 overflow-y-auto pr-2 font-mono text-sm">
            {alerts.length === 0 && <p className="text-muted-foreground">No threshold breaches yet.</p>}
            <ul className="space-y-1.5">
              {alerts.map((a) => (
                <li key={a.id} className="flex gap-3 rounded-lg bg-secondary/50 px-3 py-2">
                  <span className={a.kind === "uv" ? "text-warning" : "text-destructive"}>●</span>
                  <span className="text-muted-foreground">{a.time}</span>
                  <span>- {a.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="glass p-6">
          <h2 className="mb-3 text-lg font-semibold text-primary">Eco-Impact Summary</h2>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Continuous UV tracking flags prolonged solar exposure that degrades soil microbiota, plant tissue, and outdoor workers' skin and eye health.</p>
            <p>Acoustic monitoring detects noise pollution that disrupts wildlife communication and breeding, and causes occupational hearing loss and stress.</p>
            <p>Real-time alerts turn passive measurements into immediate action — protecting both ecosystems and the people working in them.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

const TONES = {
  ok: "bg-primary/15 text-primary",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
} as const;
const BARS = { ok: "bg-primary", warn: "bg-warning", bad: "bg-destructive", info: "bg-info" } as const;

function Metric({ title, caption, value, unit, badge, tone }: {
  title: string; caption: string; value: number; unit: string; badge: string; tone: keyof typeof TONES;
}) {
  return (
    <div className="glass flex flex-col gap-3 p-5">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="font-mono text-5xl font-bold tabular-nums">
        {value.toFixed(0)}<span className="ml-1 text-lg text-muted-foreground">{unit}</span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full transition-all duration-700 ${BARS[tone]}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONES[tone]}`}>{badge}</span>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
    </div>
  );
}
