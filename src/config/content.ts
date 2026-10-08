// =============================================================================
// GAME CONTENT CONFIG — edit this file to explore different asset combinations.
// Everything here is data; no game logic. After editing, just reload the page.
//
// Asset files live in public/assets/character/ and follow naming conventions:
//   hair (shared by both sexes):  hair_<style>_<color>.png
//   hair (per sex):               hair_<m|f>_<style>_<color>.png
//   hats (unisex):                hat_<id>.png            (id = type_color)
//   transformation heads:         head_form_<form>.png     (unisex)
//                                 head_form_<form>_<m|f>.png (per sex)
//   transformation bodies:        body_form_<form>_<m|f>.png
// To add content: copy a sheet from the LPC repo with the right name, then
// list it here. To remove content: delete the line (files can stay).
// =============================================================================

// ---------------------------------------------------------------------------
// HAIR — styles × colors. 'shared' styles use one sheet for boys and girls.
// ---------------------------------------------------------------------------

export const HAIR_COLORS = ['black', 'blonde', 'carrot', 'blue', 'pink', 'purple', 'green', 'white'];

/** Hair colors that cost coins (per color, any style). */
export const FANCY_HAIR_COLORS = ['blue', 'pink', 'purple', 'green', 'white'];

export const SHARED_HAIR = ['bob', 'curly', 'dreads'];

export const SEXED_HAIR: Record<'m' | 'f', string[]> = {
  m: ['ponytail', 'long', 'afro', 'curly_long', 'long_straight', 'pixie', 'high_ponytail', 'wavy', 'mop', 'xlong', 'princess', 'lob'],
  f: ['ponytail', 'long', 'pigtails', 'afro', 'curly_long', 'long_straight', 'pixie', 'high_ponytail', 'wavy', 'mop', 'xlong', 'princess', 'lob'],
};

/** Styles whose source art lacks some colors. */
export const HAIR_MISSING_COLORS: Record<string, string[]> = {
  long_straight: ['carrot', 'white'],
};

// ---------------------------------------------------------------------------
// HATS — 'free' show in the wardrobe right away; price > 0 shows a 🔒 there.
// Secret-market-only hats stay in economy.ts (SECRET_ITEMS).
// ---------------------------------------------------------------------------

export const FREE_HATS: { id: string; price: number }[] = [
  { id: 'bandana_red', price: 0 },
  { id: 'bandana_blue', price: 0 },
  { id: 'bandana_black', price: 0 },
  { id: 'band_red', price: 0 },
  { id: 'band_blue', price: 0 },
  { id: 'bowler_black', price: 0 },
  { id: 'bowler_brown', price: 0 },
  { id: 'feather_green', price: 15 },
  { id: 'feather_red', price: 15 },
  { id: 'feather_brown', price: 15 },
  { id: 'xmas_red', price: 20 },
  { id: 'xmas_green', price: 20 },
  { id: 'santa_red', price: 25 },
];

// ---------------------------------------------------------------------------
// TRANSFORMATIONS — each form defines its look, movement, and signature move.
//   head: 'unisex' (head_form_<id>.png) | 'sexed' (head_form_<id>_<m|f>.png)
//         | 'human' (keep the character's own head)
//   hasBody: body_form_<id>_<m|f>.png replaces the skin
//   action: signature move on other characters
//           five | scare | boop | eat | charge | levitate | bless | shrink | hop | baa
//   traits: speed px/s, bounce amplitude/frequency, hover = float always,
//           fly = can be sent into the air, animRate = leg speed multiplier
// ---------------------------------------------------------------------------

export interface FormDef {
  id: string;
  label: string; // shown in the machine
  toastName: string; // "Превръщане: <toastName>!"
  emoji: string;
  head: 'unisex' | 'sexed' | 'human';
  hasBody: boolean;
  wings?: boolean;
  horn?: boolean;
  action: string;
  traits: { speed: number; bobAmp: number; bobFreq: number; hover?: boolean; fly?: boolean; animRate?: number };
}

export const FORM_DEFS: FormDef[] = [
  { id: 'human', label: 'Човек', toastName: 'отново човек', emoji: '🧒', head: 'human', hasBody: false, action: 'five',
    traits: { speed: 220, bobAmp: 0, bobFreq: 0 } },
  { id: 'mouse', label: 'Мишка', toastName: 'мишка', emoji: '🐭', head: 'unisex', hasBody: true, action: 'scare',
    traits: { speed: 310, bobAmp: 1.5, bobFreq: 9, animRate: 1.6 } },
  { id: 'pig', label: 'Прасенце', toastName: 'прасенце', emoji: '🐷', head: 'unisex', hasBody: true, action: 'boop',
    traits: { speed: 150, bobAmp: 2, bobFreq: 3.2, animRate: 0.8 } },
  { id: 'lizard', label: 'Гущер', toastName: 'гущер', emoji: '🦎', head: 'sexed', hasBody: true, action: 'eat',
    traits: { speed: 300, bobAmp: 0.8, bobFreq: 7, animRate: 1.5 } },
  { id: 'bull', label: 'Бик', toastName: 'бик', emoji: '🐮', head: 'sexed', hasBody: true, action: 'charge',
    traits: { speed: 260, bobAmp: 2.5, bobFreq: 2.4 } },
  { id: 'alien', label: 'Извънземно', toastName: 'извънземно', emoji: '👽', head: 'unisex', hasBody: true, action: 'levitate',
    traits: { speed: 200, bobAmp: 2.5, bobFreq: 1.6, hover: true } },
  { id: 'unicorn', label: 'Еднорог', toastName: 'еднорог', emoji: '🦄', head: 'sexed', hasBody: true, horn: true, action: 'bless',
    traits: { speed: 300, bobAmp: 4, bobFreq: 3.5, animRate: 1.3 } },
  { id: 'fairy', label: 'Фея', toastName: 'фея', emoji: '🧚', head: 'human', hasBody: false, wings: true, action: 'shrink',
    traits: { speed: 260, bobAmp: 3, bobFreq: 2, hover: true, fly: true } },
  { id: 'rabbit', label: 'Заек', toastName: 'заек', emoji: '🐰', head: 'unisex', hasBody: true, action: 'hop',
    traits: { speed: 290, bobAmp: 6, bobFreq: 4, animRate: 1.3 } },
  { id: 'wolf', label: 'Вълк', toastName: 'вълк', emoji: '🐺', head: 'unisex', hasBody: true, action: 'scare',
    traits: { speed: 320, bobAmp: 1.5, bobFreq: 5, animRate: 1.4 } },
  { id: 'sheep', label: 'Овца', toastName: 'овца', emoji: '🐑', head: 'unisex', hasBody: true, action: 'baa',
    traits: { speed: 140, bobAmp: 2, bobFreq: 2.6, animRate: 0.8 } },
  { id: 'rat', label: 'Плъх', toastName: 'плъх', emoji: '🐀', head: 'unisex', hasBody: true, action: 'scare',
    traits: { speed: 310, bobAmp: 1.5, bobFreq: 9, animRate: 1.6 } },
  { id: 'skeleton', label: 'Скелет', toastName: 'скелет', emoji: '💀', head: 'unisex', hasBody: true, action: 'scare',
    traits: { speed: 180, bobAmp: 1, bobFreq: 2, animRate: 0.7 } },
];

// ---------------------------------------------------------------------------
// ROOM THEMES — repaint the whole house by switching ACTIVE_THEME.
// Walls are per room: living, kitchen, bedroom, lab, grown-up, puzzle, bathroom.
// ---------------------------------------------------------------------------

export interface RoomTheme {
  label: string; // shown in the HUD toast when switching
  walls: number[];
  floor: number;
  floorLine: number;
  baseboard: number;
  divider: number;
}

export const ROOM_THEMES: Record<string, RoomTheme> = {
  classic: {
    label: 'Класика',
    walls: [0xead9c2, 0xd6e4d0, 0xdcd3e8, 0xc7dde4, 0xd9c9b8, 0xf2e3c0, 0xc8e6e8],
    floor: 0xc9a678,
    floorLine: 0xb8946a,
    baseboard: 0xfff6e8,
    divider: 0x8a6f52,
  },
  cozy: {
    label: 'Уют',
    walls: [0xf2d9b8, 0xe8cfa8, 0xefc9c9, 0xd8e0c0, 0xe6cdb0, 0xf7e8c6, 0xd8ead8],
    floor: 0xb98a5e,
    floorLine: 0xa87a50,
    baseboard: 0xfff0dc,
    divider: 0x7a5f42,
  },
  evening: {
    label: 'Вечер',
    walls: [0xb9c4d9, 0xaec4c8, 0xc4b8d9, 0xa8c4d2, 0xc2b4a9, 0xd2c9b2, 0xa6c2cc],
    floor: 0x9a8468,
    floorLine: 0x8a7458,
    baseboard: 0xe8e0d0,
    divider: 0x6a5540,
  },
};

/** Default theme for a fresh game; players switch live with the 🖼 button. */
export const DEFAULT_THEME = 'classic';
