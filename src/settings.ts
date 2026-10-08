// Global game settings, persisted separately from the people/pets data model.

import { StyleId, STYLE_LIST } from './config/styles';
import { DEFAULT_THEME, ROOM_THEMES } from './config/content';

const STYLE_KEY = 'tiny-house-style';

let activeStyle: StyleId = loadStyle();

function loadStyle(): StyleId {
  const raw = localStorage.getItem(STYLE_KEY);
  return STYLE_LIST.some((s) => s.id === raw) ? (raw as StyleId) : STYLE_LIST[0].id;
}

/** The art style the whole game currently renders in. */
export function getActiveStyle(): StyleId {
  return activeStyle;
}

export function setActiveStyle(id: StyleId) {
  activeStyle = id;
  localStorage.setItem(STYLE_KEY, id);
}

export function nextStyle(): StyleId {
  const i = STYLE_LIST.findIndex((s) => s.id === activeStyle);
  return STYLE_LIST[(i + 1) % STYLE_LIST.length].id;
}

const THEME_KEY = 'tiny-house-theme';
const THEME_IDS = Object.keys(ROOM_THEMES);

let activeTheme: string = loadTheme();

function loadTheme(): string {
  const raw = localStorage.getItem(THEME_KEY);
  return raw && ROOM_THEMES[raw] ? raw : DEFAULT_THEME;
}

/** The room color theme the house currently uses. */
export function getActiveTheme(): string {
  return activeTheme;
}

export function setActiveTheme(id: string) {
  activeTheme = id;
  localStorage.setItem(THEME_KEY, id);
}

export function nextTheme(): string {
  const i = THEME_IDS.indexOf(activeTheme);
  return THEME_IDS[(i + 1) % THEME_IDS.length];
}

/** Texture key for `name` in the active style (LPC keys are unprefixed). */
export function styledKey(name: string): string {
  const info = STYLE_LIST.find((st) => st.id === activeStyle);
  return (info?.prefix ?? '') + name;
}
