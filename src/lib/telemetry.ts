export type RawReading = { timestamp: string; uv: number; ir: number; sound: number };
export type Reading = { timestamp: string; uv: number; ir: number; sound: number; hazard: number };

export const UV_SAFE = 30;
export const UV_DANGER = 60;
export const SOUND_ALERT = 40;
export const IR_DETECT = 50;
export const HAZARD_LIMIT = 50;

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Scale raw 0-1023 sensor input to 0-100%. */
export const scaleRaw = (raw: number) => clamp(Math.round((Number(raw) / 1023) * 1000) / 10);

/** Composite hazard index 0-100 from UV and Sound percentages. */
export const hazardIndex = (uv: number, sound: number) =>
  Math.round(clamp(uv * 0.55 + sound * 0.45));

export function normalize(r: RawReading): Reading {
  const uv = scaleRaw(r.uv);
  const sound = scaleRaw(r.sound);
  return { timestamp: r.timestamp, uv, ir: scaleRaw(r.ir), sound, hazard: hazardIndex(uv, sound) };
}

export const uvStatus = (v: number) =>
  v < UV_SAFE ? "safe" : v < UV_DANGER ? "moderate" : "danger";

const now = () => new Date().toLocaleTimeString("en-GB", { hour12: false });

let t = 0;
export function mockReading(prev?: Reading): Reading {
  t += 1;
  const drift = (base: number, amp: number, spikeChance: number, spike: number) => {
    let v = base + Math.sin(t / 5) * amp + (Math.random() - 0.5) * amp;
    if (Math.random() < spikeChance) v += spike;
    return v;
  };
  const smooth = (next: number, old?: number) => clamp(Math.round((old === undefined ? next : old * 0.5 + next * 0.5) * 10) / 10);
  const uv = smooth(drift(28, 12, 0.08, 35), prev?.uv);
  const sound = smooth(drift(30, 14, 0.12, 45), prev?.sound);
  const ir = smooth(Math.sin(t / 9) > 0.3 ? 70 + Math.random() * 20 : 10 + Math.random() * 15, prev?.ir);
  return { timestamp: now(), uv, ir, sound, hazard: hazardIndex(uv, sound) };
}
