/**
 * Who is using the site from where, for the owner's activity page. Pure rules: a coarse
 * device label from the User-Agent, the network an address belongs to (IPv4 /24, IPv6 /48:
 * a home or office line, a mobile carrier's block), and the account-sharing signals.
 * Addresses themselves are never stored, only keyed hashes of them (src/lib/data/activity-log.ts).
 */

export type Device = { kind: "Phone" | "Tablet" | "Computer"; os: string; browser: string };

export function parseDevice(ua: string | null | undefined): Device {
  const s = ua ?? "";
  const os = /Android/i.test(s) ? "Android"
    : /iPhone|iPod/i.test(s) ? "iOS"
    : /iPad/i.test(s) || (/Macintosh/i.test(s) && /Mobile/i.test(s)) ? "iPadOS"
    : /CrOS/i.test(s) ? "ChromeOS"
    : /Windows/i.test(s) ? "Windows"
    : /Mac OS X|Macintosh/i.test(s) ? "macOS"
    : /Linux/i.test(s) ? "Linux"
    : "Unknown";
  const browser = /SamsungBrowser/i.test(s) ? "Samsung Internet"
    : /Edg\//i.test(s) ? "Edge"
    : /OPR\/|Opera/i.test(s) ? "Opera"
    : /Firefox|FxiOS/i.test(s) ? "Firefox"
    : /CriOS|Chrome\//i.test(s) ? "Chrome"
    : /Safari/i.test(s) ? "Safari"
    : "Other";
  const kind = os === "iPadOS" || (/Android/i.test(s) && !/Mobile/i.test(s)) || /Tablet/i.test(s) ? "Tablet"
    : /Mobi|iPhone|Android/i.test(s) ? "Phone"
    : "Computer";
  return { kind, os, browser };
}

export const deviceLabel = (d: Device) => `${d.kind} · ${d.os} · ${d.browser}`;

/** The client address from the proxy headers (Cloudflare's first), or null. */
export function clientAddress(h: { get(name: string): string | null }): string | null {
  const v = h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0];
  const ip = v?.trim().replace(/^::ffff:/i, "");
  return ip && ip.length <= 64 ? ip : null;
}

/** The network part of an address: IPv4 /24, IPv6 /48. Null when it is not an address. */
export function networkOf(ip: string): string | null {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) return v4.slice(1, 5).every((p) => Number(p) <= 255) ? `${v4[1]}.${v4[2]}.${v4[3]}.0/24` : null;
  if (!ip.includes(":") || !/^[0-9a-f:]+$/i.test(ip)) return null;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const a = head ? head.split(":") : [], b = tail ? tail.split(":") : [];
  const full = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return full.length === 8 ? `${full.slice(0, 3).map((x) => x.replace(/^0+(?=.)/, "")).join(":")}::/48` : null;
}

export type Seen = { at: Date; device: string; net: string | null };
export type SharingSignal = { level: "strong" | "watch" | "ok"; text: string };

/** Two uses this close together from different networks cannot be one person moving. */
export const TOGETHER_MS = 10 * 60_000;

/**
 * What an account's recent visits say about who uses it. Strong: two different devices on
 * two different networks within minutes of each other. Watch: many devices or networks.
 * A phone and a computer on the same network, or one device moving between networks
 * (home Wi-Fi, mobile data), is normal for one person.
 */
export function sharingSignals(visits: Seen[]): SharingSignal[] {
  const v = [...visits].sort((a, b) => a.at.getTime() - b.at.getTime());
  const devices = new Set(v.map((x) => x.device));
  const nets = new Set(v.map((x) => x.net).filter(Boolean));
  const out: SharingSignal[] = [];
  let together = 0;
  let last: Seen | null = null;
  const lastByDevice = new Map<string, Seen>();
  for (const x of v) {
    for (const [d, y] of lastByDevice) {
      if (d !== x.device && y.net && x.net && y.net !== x.net && x.at.getTime() - y.at.getTime() <= TOGETHER_MS) { together++; break; }
    }
    lastByDevice.set(x.device, x);
    last = x;
  }
  if (together) out.push({ level: "strong", text: `Used on two devices from two different networks within ${TOGETHER_MS / 60_000} minutes (${together} time${together === 1 ? "" : "s"}): likely two people.` });
  if (devices.size >= 4) out.push({ level: "watch", text: `${devices.size} different devices.` });
  if (nets.size >= 5) out.push({ level: "watch", text: `${nets.size} different networks.` });
  if (!out.length && last) {
    const kinds = new Set([...devices].map((d) => d.split(" · ")[0]));
    out.push({ level: "ok", text: devices.size <= 1 ? "One device." : kinds.has("Phone") && kinds.has("Computer") && devices.size <= 3 ? "A phone and a computer: usual for one person." : `${devices.size} devices, never at once from different places.` });
  }
  return out;
}
