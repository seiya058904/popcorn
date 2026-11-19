/** Hand-drawn 48×48 pictograms; `currentColor` is the ink, the rest is flat fill. */
const svg = (body: string): string =>
  `<svg viewBox="0 0 48 48" aria-hidden="true" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

export const UNIT_ICONS: readonly string[] = [
  svg('<path fill="#ffd257" d="M9 21h24v13a6 6 0 0 1-6 6H15a6 6 0 0 1-6-6z"/><path fill="#fff1d0" d="M7 21c2-6 7-8 14-8s12 2 14 8z"/><circle cx="21" cy="10" r="2.6" fill="#3a2230"/><path fill="none" d="M33 26l11-3"/>'),
  svg('<rect x="5" y="11" width="38" height="27" rx="4" fill="#f4e6cf"/><rect x="9" y="15" width="21" height="19" rx="2" fill="#3a3346"/><circle cx="19" cy="25" r="5" fill="#fff1d0"/><path fill="#7ce0b8" d="M34 15h6v5h-6z"/><path fill="none" d="M34 25h6M34 30h6M12 38v3M36 38v3"/>'),
  svg('<path fill="#e4343c" d="M8 30h32v6H8z"/><path fill="#fff6e0" d="M11 12h26v18H11z"/><path fill="#e4343c" d="M8 12l4-6h24l4 6z"/><path fill="none" d="M18 12v18M30 12v18"/><circle cx="15" cy="39" r="4" fill="#3a2230"/><circle cx="33" cy="39" r="4" fill="#3a2230"/>'),
  svg('<ellipse cx="22" cy="24" rx="15" ry="10" fill="#4a4656" transform="rotate(-18 22 24)"/><path fill="#2c2a35" d="M34 13l7-3 3 9-6 3z"/><path fill="none" d="M15 32l-4 8M27 30l4 10M6 40h30"/><circle cx="20" cy="25" r="3" fill="#ffb648"/>'),
  svg('<path fill="#e4343c" d="M9 8h30l-3 7H12z"/><path fill="#c8ecff" d="M12 15h24v20H12z"/><path fill="#fff1d0" d="M15 35c0-6 3-9 9-9s9 3 9 9z"/><path fill="#e4343c" d="M9 35h30v7H9z"/>'),
  svg('<path fill="#e4343c" d="M3 13h27v22H3z"/><path fill="#fff1d0" d="M8 18h17v8H8z"/><path fill="#ffd257" d="M30 20h9l6 8v7H30z"/><path fill="#c8ecff" d="M33 23h5l3 5h-8z"/><circle cx="12" cy="37" r="4.4" fill="#3a2230"/><circle cx="36" cy="37" r="4.4" fill="#3a2230"/>'),
  svg('<path fill="#d98a3a" d="M6 42V24l11 6v-6l11 6V12h12v30z"/><path fill="#b76a24" d="M31 12V6h6v6z"/><path fill="#fff1d0" d="M12 35h5v4h-5zM22 35h5v4h-5z"/><path fill="#ffdfa8" stroke="none" d="M35 4c4-4 9-1 7 3 3 2 0 6-4 4-3 2-7-3-3-7z"/>'),
  svg('<ellipse cx="23" cy="18" rx="19" ry="11" fill="#ffd257"/><path fill="#e4343c" d="M23 7c5 3 5 19 0 22-5-3-5-19 0-22z"/><path fill="#e4343c" d="M41 12l5-4v20l-5-4z"/><path fill="#fff1d0" d="M16 31h14l-2 6H18z"/><path fill="none" d="M18 28l-1 3M28 28l1 3M20 41h1M26 43h1"/>'),
  svg('<path fill="#6b4a58" d="M4 42l13-24h14l13 24z"/><path fill="#ff7a2f" d="M17 18h14l-3 7-4-3-4 3z"/><path fill="#fff1d0" d="M18 11a4 4 0 1 1 6-3 4 4 0 1 1 6 4c-3 3-9 3-12-1z"/>'),
  svg('<path fill="#4c8be0" d="M2 16h13v13H2zM33 16h13v13H33z"/><path fill="none" d="M15 22.5h18M6 16v13M11 16v13M37 16v13M42 16v13"/><circle cx="24" cy="23" r="7" fill="#d9e4ee"/><path fill="#fff1d0" d="M15 12a12 12 0 0 1 18 0l-3 3a8 8 0 0 0-12 0z"/><path fill="none" d="M24 30v5"/><path fill="#ffb648" stroke="none" d="M21 35h6l5 9H16z"/>'),
];

export const ICONS = {
  flavor: svg('<path fill="#fff1d0" d="M19 6h10v6l5 8v18a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V20l5-8z"/><path fill="#e4343c" d="M14 24h20v10H14z"/><path fill="none" d="M21 6h6"/>'),
  click: svg('<path fill="#fff1d0" d="M19 24V9a4 4 0 0 1 8 0v11l8 2c4 1 5 4 4 8l-2 8c-1 3-3 4-6 4H22c-3 0-5-1-7-4l-6-8c-2-3 2-7 5-4z"/>'),
  unit: svg('<path fill="#ffd257" d="M24 5l5 5 7-1 1 7 6 4-4 6 2 7-7 2-3 6-7-3-7 3-3-6-7-2 2-7-4-6 6-4 1-7 7 1z"/><circle cx="24" cy="24" r="6" fill="#fff1d0"/>'),
  synergy: svg('<rect x="4" y="19" width="22" height="11" rx="5.5" fill="#8fe0c8" transform="rotate(-24 15 24)"/><rect x="22" y="19" width="22" height="11" rx="5.5" fill="#ffd257" transform="rotate(-24 33 24)"/>'),
  cannon: svg('<circle cx="24" cy="26" r="16" fill="#fff1d0"/><path fill="none" d="M24 26l8-9M12 26h3M33 26h3M24 14v3"/><circle cx="24" cy="26" r="3" fill="#e4343c"/>'),
  hopper: svg('<path fill="#ffb648" d="M24 8c7 0 12 8 12 16s-5 13-12 13-12-5-12-13S17 8 24 8z"/><path fill="none" d="M15 42c3-3 6-3 9 0 3-3 6-3 9 0"/>'),
  offline: svg('<path fill="#ffe9a8" d="M34 31A16 16 0 0 1 19 8a16 16 0 1 0 21 21 16 16 0 0 1-6 2z"/>'),
  trophy: svg('<path fill="#ffd257" d="M14 7h20v13a10 10 0 0 1-20 0z"/><path fill="none" d="M14 11H7c0 7 3 10 8 11M34 11h7c0 7-3 10-8 11M24 30v8"/><path fill="#e4343c" d="M15 38h18v4H15z"/>'),
  menu: svg('<path fill="none" d="M9 14h30M9 24h30M9 34h30"/>'),
  lock: svg('<path fill="none" d="M16 21v-6a8 8 0 0 1 16 0v6"/><rect x="11" y="21" width="26" height="20" rx="4" fill="#8d7f78"/>'),
} as const;
