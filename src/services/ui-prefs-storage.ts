/**
 * ค่ากำหนด UI ของผู้ใช้ — ธีม (สว่าง/มืด) และความหนาแน่น (สบายตา/กระชับ/แน่น)
 * เก็บเป็น object เดียวใน Key เดียว (ต่างจาก Store อื่นที่เก็บ array) กันการเขียน 2 ค่าแข่งกัน
 * (ตั้งธีมกับความหนาแน่นพร้อมกันในเซสชันเดียว ถ้าแยก Key อาจเขียนทับกันเอง)
 *
 * ใช้ทั้งจาก ThemeStore (client) และ layout.tsx (server — อ่านเฉพาะชื่อ Key ไปฝังในสคริปต์กัน flash)
 */

import { canUseStorage, readJson, writeJson } from './browserStorage';

export type UiTheme = 'light' | 'dark';
export type UiDensity = 'comfortable' | 'compact' | 'dense';

export interface UiPrefs {
  theme: UiTheme;
  density: UiDensity;
}

export const UI_PREFS_STORAGE_KEY = 'uiPrefs';

const DEFAULT_DENSITY: UiDensity = 'comfortable';

function isTheme(v: unknown): v is UiTheme {
  return v === 'light' || v === 'dark';
}

function isDensity(v: unknown): v is UiDensity {
  return v === 'comfortable' || v === 'compact' || v === 'dense';
}

/** ธีมเริ่มต้นตามที่เครื่องตั้งไว้ (prefers-color-scheme) — ใช้เมื่อยังไม่เคยตั้งค่าเอง */
function systemTheme(): UiTheme {
  if (!canUseStorage() || typeof window.matchMedia !== 'function') return 'light';
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** อ่านค่าที่บันทึกไว้ — ไม่มี/ข้อมูลเสีย → theme ตามเครื่อง, density = สบายตา */
export function loadUiPrefs(): UiPrefs {
  const fallback: UiPrefs = { theme: systemTheme(), density: DEFAULT_DENSITY };
  const parsed = readJson<Partial<UiPrefs> | null>(UI_PREFS_STORAGE_KEY, null);
  if (!parsed) return fallback;
  return {
    theme: isTheme(parsed.theme) ? parsed.theme : fallback.theme,
    density: isDensity(parsed.density) ? parsed.density : fallback.density,
  };
}

/** เขียนค่ากำหนด — เขียนไม่สำเร็จโยน StorageWriteError พร้อมสาเหตุจริง (ดู browserStorage) */
export function saveUiPrefs(prefs: UiPrefs): void {
  writeJson(UI_PREFS_STORAGE_KEY, prefs);
}
