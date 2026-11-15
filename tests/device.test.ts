import { describe, expect, it } from "vitest";
import { clientAddress, deviceLabel, networkOf, parseDevice, sharingSignals } from "@/lib/domain/device";

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:131.0) Gecko/20100101 Firefox/131.0",
};

describe("devices and networks", () => {
  it("labels common browsers", () => {
    expect(deviceLabel(parseDevice(UA.android))).toBe("Phone · Android · Chrome");
    expect(deviceLabel(parseDevice(UA.iphone))).toBe("Phone · iOS · Safari");
    expect(deviceLabel(parseDevice(UA.windows))).toBe("Computer · Windows · Edge");
    expect(deviceLabel(parseDevice(UA.mac))).toBe("Computer · macOS · Firefox");
    expect(parseDevice(null).kind).toBe("Computer");
  });

  it("takes Cloudflare's address first and reduces it to a network", () => {
    const h = new Headers({ "cf-connecting-ip": "39.45.12.200", "x-forwarded-for": "10.0.0.1" });
    expect(clientAddress(h)).toBe("39.45.12.200");
    expect(clientAddress(new Headers({ "x-forwarded-for": "::ffff:1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(networkOf("39.45.12.200")).toBe("39.45.12.0/24");
    expect(networkOf("2400:adc1:0012:5::1")).toBe("2400:adc1:12::/48");
    expect(networkOf("999.1.1.1")).toBeNull();
    expect(networkOf("nonsense")).toBeNull();
  });
});

describe("account sharing", () => {
  const t = (min: number) => new Date(Date.UTC(2026, 10, 15, 10, min));
  const phone = "Phone · Android · Chrome", laptop = "Computer · Windows · Chrome";

  it("calls a phone and a laptop at home normal", () => {
    const s = sharingSignals([{ at: t(0), device: phone, net: "A" }, { at: t(3), device: laptop, net: "A" }, { at: t(50), device: phone, net: "B" }]);
    expect(s).toEqual([{ level: "ok", text: "A phone and a computer: usual for one person." }]);
  });

  it("flags two devices on two networks at the same time", () => {
    const s = sharingSignals([{ at: t(0), device: phone, net: "A" }, { at: t(4), device: laptop, net: "B" }]);
    expect(s[0]!.level).toBe("strong");
  });

  it("does not flag one device moving between networks", () => {
    expect(sharingSignals([{ at: t(0), device: phone, net: "A" }, { at: t(2), device: phone, net: "B" }])[0]!.level).toBe("ok");
  });

  it("watches accounts used on many devices", () => {
    const many = ["a", "b", "c", "d"].map((d, i) => ({ at: t(i * 60), device: d, net: "A" }));
    expect(sharingSignals(many)).toEqual([{ level: "watch", text: "4 different devices." }]);
  });
});
