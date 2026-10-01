/**
 * เทสต์ service ค่ากำหนด UI (ธีม/ความหนาแน่น): บันทึก/อ่านคืน + sanitize ค่าที่เสีย + fallback
 * รันด้วย: npm test
 *
 * localStorage มีจริงเฉพาะในเบราว์เซอร์ — จำลอง window.localStorage แบบง่ายด้วย Map
 * เพื่อทดสอบเส้นทางอ่าน/เขียนจริงของ ui-prefs-storage.ts (ไม่ใช่แค่ fallback เฉย ๆ)
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { loadUiPrefs, saveUiPrefs, UI_PREFS_STORAGE_KEY } from '@/services/ui-prefs-storage';

function makeFakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

const originalWindow = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = { localStorage: makeFakeLocalStorage() };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe('ui-prefs-storage', () => {
  test('ยังไม่เคยบันทึก → density fallback เป็น comfortable และ theme เป็นค่าที่รู้จัก', () => {
    const prefs = loadUiPrefs();
    assert.equal(prefs.density, 'comfortable');
    assert.ok(prefs.theme === 'light' || prefs.theme === 'dark');
  });

  test('บันทึกแล้วอ่านคืนได้ค่าเดิม', () => {
    saveUiPrefs({ theme: 'dark', density: 'dense' });
    assert.deepEqual(loadUiPrefs(), { theme: 'dark', density: 'dense' });
  });

  test('ค่าที่ไม่รู้จัก (ข้อมูลเสีย) → sanitize กลับเป็น fallback โดยไม่ทำให้หน้าเว็บพัง', () => {
    const win = (globalThis as unknown as { window: { localStorage: Storage } }).window;
    win.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify({ theme: 'purple', density: 'huge' }));
    const prefs = loadUiPrefs();
    assert.equal(prefs.density, 'comfortable');
    assert.ok(prefs.theme === 'light' || prefs.theme === 'dark');
  });

  test('JSON เสีย (parse ไม่ได้) → คืน fallback ไม่ throw', () => {
    const win = (globalThis as unknown as { window: { localStorage: Storage } }).window;
    win.localStorage.setItem(UI_PREFS_STORAGE_KEY, '{not json');
    assert.doesNotThrow(() => loadUiPrefs());
  });
});
