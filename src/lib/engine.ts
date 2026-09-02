/* ============================================================
   ZakaPro — Moteur technique
   ============================================================ */

export type Source = "moncash" | "natcash" | "autre";
export interface ParsedSms { ok: boolean; source: Source; amount: number | null; ref: string | null; sender: string | null; raw: string; }
const SOURCE_PATTERNS: Array<[Source, RegExp]> = [["moncash", /mon\s?cash/i], ["natcash", /nat\s?cash/i], ["autre", /unibank|unitransfer|sogebank|banque|zee cash/i]];
const TRANSACTIONAL_RE = /(resevwa|re[sç]u[e]?|konfime|confirmé|transf[eè]re?|peman|paiement|d[eé]p[oô]t|depo|kòb f[eè]t|kob fet)/i;
const AMOUNT_KEYWORD_RE = /(?:resevwa|re[sç]u[e]?|transf[eè]re?|peman|paiement|depo|d[eé]p[oô]t|soti|montant)[^\d\n]{0,16}(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,2})?)/i;
const AMOUNT_HTG_RE = /(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,2})?)\s*(?:HTG|Gdes?\.?|gourdes?)/i;
const REF_RE = /(?:referans|r[eé]f[eé]rence|ref|no\.?\s*tranzaksyon|no\.?\s*transaction|no|id)\s*[:.]?\s*#?\s*([A-Za-z]{0,3}[-.]?\d{4,}(?:\.\d{1,6})?)/i;
const REF_FALLBACK_RE = /\b([A-Z]{2}[-.]?\d{6,}(?:\.\d{1,6})?)\b/;
const SENDER_RE = /(?:soti nan|soti|exp[eé]diteur|from|nan)\s*[:.]?\s*(\+?\d[\d\s.-]{6,}\d)/i;
export function detectSource(raw: string): Source { for (const [source, re] of SOURCE_PATTERNS) if (re.test(raw)) return source; return "autre"; }
export function parseSms(raw: string): ParsedSms { const source = detectSource(raw); const amountMatch = raw.match(AMOUNT_KEYWORD_RE) ?? raw.match(AMOUNT_HTG_RE) ?? raw.match(/(\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,2})?)/); const clean = amountMatch ? amountMatch[1].replace(/\s/g, "").replace(",", ".") : ""; const value = parseFloat(clean); const validAmount = Number.isFinite(value) && value > 0; const refMatch = raw.match(REF_RE) ?? raw.match(REF_FALLBACK_RE); const senderMatch = raw.match(SENDER_RE); return { ok: validAmount && TRANSACTIONAL_RE.test(raw), source, amount: validAmount ? Math.round(value * 100) / 100 : null, ref: refMatch ? refMatch[1] : null, sender: senderMatch ? senderMatch[1].trim() : null, raw }; }

let ctx: AudioContext | null = null;
export function unlockAudio(): void { try { if (!ctx) { const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (AC) ctx = new AC(); } if (ctx && ctx.state === "suspended") void ctx.resume(); } catch {} }
function beep(at: number, freq: number, dur: number, vol: number, type: OscillatorType): void { if (!ctx) return; const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.type = type; osc.frequency.setValueAtTime(freq, at); gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(vol, at + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, at + dur); osc.connect(gain).connect(ctx.destination); osc.start(at); osc.stop(at + dur + 0.05); }
const clampVol = (volumePct: number, scale: number) => (Math.max(0, Math.min(100, volumePct)) / 100) * scale;
export function playAlarm(volumePct: number): void { unlockAudio(); if (!ctx) return; const v = clampVol(volumePct, 0.5); if (v <= 0) return; const t0 = ctx.currentTime + 0.02; for (let i = 0; i < 3; i++) { beep(t0 + i * 0.52, 988, 0.22, v, "square"); beep(t0 + i * 0.52 + 0.25, 740, 0.22, v, "square"); } }
export function playAlarmUrgent(volumePct: number): void { unlockAudio(); if (!ctx) return; const v = clampVol(volumePct, 0.58); if (v <= 0) return; const t0 = ctx.currentTime + 0.02; for (let i = 0; i < 4; i++) { beep(t0 + i * 0.4, 1175, 0.17, v, "square"); beep(t0 + i * 0.4 + 0.19, 880, 0.17, v, "square"); } beep(t0 + 4 * 0.4 + 0.05, 1175, 0.55, v, "sawtooth"); }
export function playTick(volumePct: number): void { unlockAudio(); if (!ctx) return; const v = clampVol(volumePct, 0.16); if (v > 0) beep(ctx.currentTime + 0.02, 880, 0.09, v, "sine"); }
export function playSuccess(volumePct: number): void { unlockAudio(); if (!ctx) return; const v = clampVol(volumePct, 0.22); if (v <= 0) return; const t0 = ctx.currentTime + 0.02; beep(t0, 660, 0.1, v, "triangle"); beep(t0 + 0.12, 990, 0.14, v, "triangle"); }

export interface WebhookDelivery { id: string; at: number; url: string; event: string; signature: string; status: "delivered" | "failed"; httpCode: number; latencyMs: number; attempts: number; }
export async function hmacSha256(secret: string, body: string): Promise<string> { try { const enc = new TextEncoder(); const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body)); return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join(""); } catch { let h1 = 0x811c9dc5; let h2 = 0x01000193; for (let i = 0; i < body.length; i++) { h1 = ((h1 ^ body.charCodeAt(i)) * 16777619) >>> 0; h2 = ((h2 + body.charCodeAt(i) * 33) ^ (h2 >>> 13)) >>> 0; } const block = (h1.toString(16) + h2.toString(16)).padEnd(16, "0"); return (block + block + block + block).slice(0, 64); } }

async function resolveApplicationWebhook(url: string, payload: Record<string, unknown>): Promise<string> {
  const appId = typeof payload.app === "string" ? payload.app : "";
  if (!appId) return url;
  try {
    const res = await fetch(`/api/apps/${encodeURIComponent(appId)}/webhook`, { credentials: "include" });
    if (!res.ok) return url;
    const body = (await res.json()) as { webhookUrl?: string };
    return String(body.webhookUrl || url).trim() || url;
  } catch { return url; }
}

/**
 * Résout le webhook dédié à l'application avant l'envoi.
 * Si aucune URL applicative n'est configurée, l'URL globale passée par le store reste le fallback.
 */
export async function dispatchWebhook(url: string, payload: Record<string, unknown>, secret: string, attempt = 1): Promise<WebhookDelivery> {
  const resolvedUrl = await resolveApplicationWebhook(url, payload);
  const body = JSON.stringify(payload);
  const signature = await hmacSha256(secret, body);
  const latencyMs = Math.round(180 + Math.random() * 420);
  await new Promise((r) => window.setTimeout(r, Math.min(latencyMs, 650)));
  const succeeded = attempt >= 2 ? Math.random() > 0.05 : Math.random() > 0.12;
  return { id: "wh_" + Math.random().toString(36).slice(2, 10), at: Date.now(), url: resolvedUrl, event: String(payload.event ?? "payment.confirmed"), signature, status: succeeded ? "delivered" : "failed", httpCode: succeeded ? 200 : 503, latencyMs, attempts: attempt };
}

export function registerServiceWorker(): void { if ("serviceWorker" in navigator && window.location.protocol === "https:") window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); }); }
export async function ensureNotificationPermission(): Promise<NotificationPermission> { try { if (!("Notification" in window)) return "denied"; if (Notification.permission === "default") return await Notification.requestPermission(); return Notification.permission; } catch { return "denied"; } }
export async function pushDeliveryNotification(title: string, body: string): Promise<void> { if (!("Notification" in window) || Notification.permission !== "granted") return; interface SwOptions extends NotificationOptions { vibrate?: number[]; renotify?: boolean; data?: unknown; } const base: SwOptions = { body, icon: "/icons/icon-512.png", badge: "/icons/icon-512.png", tag: "zakapro-livraison", requireInteraction: true, vibrate: [300, 150, 300, 150, 600] }; try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) await reg.showNotification(title, { ...base, renotify: true, data: { url: "/deliveries" } } as NotificationOptions); else new Notification(title, base); } catch {} }
