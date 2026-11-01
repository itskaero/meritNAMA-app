// Small inline icon set (24px grid, stroke) so the app ships no icon library.
const paths = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7M22 21a6 6 0 0 0-4-5.6",
  list: "M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01",
  trend: "m3 17 6-6 4 4 8-8M15 7h6v6",
  building: "M3 21h18M5 21V7l7-4 7 4v14M10 9h4M12 7v4M9 21v-5h6v5",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  calendar: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M9 2v4M15 2v4",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  database: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  cpu: "M7 7h10v10H7zM10 2v3M14 2v3M10 19v3M14 19v3M2 10h3M2 14h3M19 10h3M19 14h3",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  arrow: "M5 12h14M13 6l6 6-6 6",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  books: "M4 5h6v15H4zM10 8h5v12h-5zM15.5 6.5l4-1 3 13.5-4 1z",
  clipboard: "M9 4h6v3H9zM9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3M8.5 12l2 2 4-4M8.5 17h7",
  stethoscope: "M6 3v6a4 4 0 0 0 8 0V3M10 13v2a5 5 0 0 0 10 0v-2M20 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 3h2M13 3h2",
  award: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14 7 22l5-3 5 3-1.5-8M12 6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 8.3 11 8z",
  bars: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  layers: "m12 3 9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  book: "M4 5a2 2 0 0 1 2-2h5v17H6a2 2 0 0 0-2 2zM20 5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 1 2 2z",
  play: "M7 4.5v15a.8.8 0 0 0 1.2.7l12-7.5a.8.8 0 0 0 0-1.4l-12-7.5A.8.8 0 0 0 7 4.5z",
  check: "m5 12.5 4.5 4.5L19 7.5",
  plus: "M12 5v14M5 12h14",
  chevronLeft: "m15 5-7 7 7 7",
  chevronRight: "m9 5 7 7-7 7",
  chevronDown: "m6 9 6 6 6-6",
  shield: "M12 3 4.5 6v6c0 4.5 3.2 8 7.5 9 4.3-1 7.5-4.5 7.5-9V6zM9 12l2 2 4-4",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={paths[name]} />
    </svg>
  );
}
