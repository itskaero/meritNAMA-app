/**
 * Brand imagery: the asset manifest. Files live in public/images/brand/ and were
 * made from the generated set (docs/DESIGN.md has the inventory). They are
 * illustrations of medical education in general, not photographs of any named
 * institution, so no caption may name a real hospital or university.
 *
 * `position` is the CSS object-position that keeps the focal point in frame when
 * the image is cropped; `width`/`height` are the intrinsic size (no layout shift).
 */
export type Photo = { src: string; alt: string; width: number; height: number; position: string };

const p = (src: string, width: number, height: number, position: string, alt: string): Photo => ({ src: `/images/brand/${src}`, width, height, position, alt });

export const PHOTOS = {
  /** Wide (2.36:1). A doctor writing at a lamp-lit desk in an arched library; she sits right of centre, the left half is dark and quiet for text. */
  hero: p("hero-library-study.jpg", 2400, 1018, "72% 45%", "A young doctor writing notes at a lamp-lit desk in an old arched library"),
  /** 4:3. Open textbooks, handwritten notes, highlighters and a stethoscope on a library table. */
  studyDesk: p("study-desk.jpg", 2400, 1792, "45% 60%", "Open textbooks, handwritten notes, highlighters and a stethoscope on a library table"),
  /** 16:9. A doctor in navy scrubs with a tablet in a bright hospital corridor; she stands left of centre facing right. */
  doctor: p("doctor-corridor.jpg", 2400, 1340, "38% 35%", "A doctor in scrubs with a tablet, looking down a bright hospital corridor"),
  /** 16:9. An aerial view of a large modern hospital with stone screens at golden hour. */
  hospital: p("hospital-aerial.jpg", 2400, 1340, "50% 40%", "An aerial view of a large modern teaching hospital at golden hour"),
  /** 4:3. A red-brick heritage medical college beside a modern glass block, students on the lawns. */
  campus: p("campus-heritage.jpg", 2400, 1792, "40% 45%", "A heritage red-brick medical college beside a modern teaching block, with students on the lawns"),
  /** 4:3. A graduate in a navy gown holding a scroll in a sunlit courtyard; face upper centre. */
  graduate: p("graduate-courtyard.jpg", 2400, 1792, "50% 30%", "A graduate in a navy gown holding a rolled certificate in a sunlit courtyard"),
} satisfies Record<string, Photo>;

/** Backgrounds and line art. Decorative: always rendered with alt="" / aria-hidden. */
export const ART = {
  contourNavy: "/images/brand/texture-contour-navy.jpg",
  paperIvory: "/images/brand/texture-paper-ivory.jpg",
  /** Transparent line art (alpha taken from the white background). */
  divider: "/images/brand/art-divider.webp",
  contour: "/images/brand/art-contour.webp",
  skyline: "/images/brand/art-skyline.webp",
  botanical: "/images/brand/art-botanical.webp",
} as const;
