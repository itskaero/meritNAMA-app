/**
 * Photographs on the landing and sign-in pages, with their credits (shown in the
 * landing footer and the sign-in panel). Files live in public/images/landing/.
 * To use your own photography, replace the files (or point `src` elsewhere) and
 * update the credit. Keep photos authentic and educational: real campuses, wards,
 * lecture halls and people, never stock technology imagery.
 */
export type Photo = { src: string; alt: string; caption: string; position: string; credit: { text: string; url: string } };

const KEMU_CREDIT = (n: number) => ({
  text: `King Edward Medical University, Lahore, by Ibnazhar, CC BY-SA 4.0, Wikimedia Commons (${n})`,
  url: `https://commons.wikimedia.org/wiki/File:%27Pakistan%27-KE_Med_Univ-Sep_2016_(${n}).jpg`,
});

export const PHOTOS = {
  hero: {
    src: "/images/landing/kemu-main-building.jpg",
    alt: "The domed main building of King Edward Medical University in Lahore, behind palms and lawns",
    caption: "King Edward Medical University, Lahore",
    position: "50% 40%",
    credit: KEMU_CREDIT(4),
  },
  institutions: {
    src: "/images/landing/kemu-campus.jpg",
    alt: "The arcaded front of King Edward Medical University in Lahore across a green lawn",
    caption: "King Edward Medical University, Lahore",
    position: "50% 55%",
    credit: KEMU_CREDIT(8),
  },
} satisfies Record<string, Photo>;
