/**
 * A forensic watermark: the account's code and the time, tiled across the page in mid-grey at
 * a few percent opacity. It moves pixels by a handful of brightness levels on the dark and the
 * light theme alike, so it does not show on screen, but raising the contrast of a screenshot
 * brings it out (Admin → Activity → Trace a screenshot). No script, no layout: one fixed layer
 * that ignores the pointer and is hidden from assistive technology.
 */
export const WATERMARK_OPACITY = 0.026;

export function Watermark({ text }: { text: string }) {
  const t = text.replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="210"><g transform="rotate(-21 170 105)" fill="rgb(128,128,128)" fill-opacity="${WATERMARK_OPACITY}" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700" letter-spacing="1"><text x="40" y="95">${t}</text><text x="190" y="195">${t}</text></g></svg>`;
  return (
    <div
      aria-hidden
      data-watermark
      className="pointer-events-none fixed inset-0 z-[70] select-none print:block"
      style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, backgroundRepeat: "repeat" }}
    />
  );
}
