// Global art-style registry.
//
// The game renders ALL characters in one globally-selected style (persisted in
// settings.ts, switched live with the HUD 🎨 button). Every style must cover
// the FULL wardrobe catalog: a style is a complete parallel set of sheets in
// public/assets/<folder>/ with the same file names and the same LPC frame
// layout as assets/character/. The 'doodle' set is generated procedurally by
// scratchpad/gen_doodle.py — rerun it after adding new items to the catalog.

export type StyleId = 'lpc';

export interface StyleInfo {
  id: StyleId;
  label: string;
  emoji: string;
  /** Texture key prefix ('' for the base style). */
  prefix: string;
  /** Folder under public/ with this style's sheets. */
  path: string;
}

export const STYLE_LIST: StyleInfo[] = [
  { id: 'lpc', label: 'Пиксел', emoji: '🎮', prefix: '', path: 'assets/character' },
];
