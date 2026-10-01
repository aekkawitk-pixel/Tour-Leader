'use client';

/**
 * Context ธีม (สว่าง/มืด) และความหนาแน่น (สบายตา/กระชับ/แน่น) — แยกจาก DemoStore โดยตั้งใจ
 * DemoStore เก็บ "ข้อมูลธุรกิจ" ที่ออกแบบให้สลับไปเรียก API จริงได้ในอนาคต ส่วนธีม/ความหนาแน่น
 * เป็นค่ากำหนดฝั่ง UI ล้วน ๆ ไม่เกี่ยวกับข้อมูลนั้น จึงไม่ควรผูกเข้าด้วยกัน
 *
 * สคริปต์ beforeInteractive ใน layout.tsx ตั้ง data-zego-theme/data-zego-density ที่ <html>
 * ไปแล้วก่อน paint (กัน flash) — ที่นี่แค่อ่านค่าเดิมมาเก็บใน state ให้ปุ่มสลับใช้ต่อ
 * และคอยซิงก์ DOM ให้ตรงทุกครั้งที่ผู้ใช้เปลี่ยนค่าในเซสชันนี้
 */

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadUiPrefs, saveUiPrefs, type UiDensity, type UiPrefs, type UiTheme } from '@/services/ui-prefs-storage';

interface ThemeState {
  theme: UiTheme;
  density: UiDensity;
  setTheme: (theme: UiTheme) => void;
  toggleTheme: () => void;
  setDensity: (density: UiDensity) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function applyToDocument(prefs: UiPrefs) {
  document.documentElement.setAttribute('data-zego-theme', prefs.theme);
  document.documentElement.setAttribute('data-zego-density', prefs.density);
}

const SSR_SAFE_DEFAULT: UiPrefs = { theme: 'light', density: 'comfortable' };

export function ThemeProvider({ children }: { children: ReactNode }) {
  /**
   * state เริ่มต้นต้อง "ตรงกับที่ server render เป๊ะ" (ค่า default คงที่ SSR_SAFE_DEFAULT)
   * ห้ามอ่าน localStorage ตรง ๆ ตอน useState init — server ไม่มี window จึง render เป็น default
   * เสมอ ถ้า client เริ่มต้นด้วยค่าจริงจาก localStorage ทันที จะเกิด hydration mismatch
   * แล้ว React จะค้าง DOM ของ subtree นี้ไว้ตามที่ server render (ปุ่ม/ไอคอนไม่อัปเดตแม้ state ข้างในถูกแล้ว)
   * จึงต้องซิงก์ค่าจริงทีหลังใน useEffect ด้านล่าง (รันเฉพาะฝั่ง client หลัง mount เสร็จ ไม่ใช่ตอน hydrate)
   * ส่วนตัวหน้าเว็บไม่กะพริบสีอยู่แล้วเพราะสคริปต์ beforeInteractive ใน layout.tsx ตั้ง
   * data-zego-theme/data-zego-density ที่ <html> ตรงจาก localStorage ก่อน paint แรกแยกจากนี้
   */
  const [prefs, setPrefs] = useState<UiPrefs>(SSR_SAFE_DEFAULT);

  useEffect(() => {
    // อ่าน localStorage ได้เฉพาะฝั่ง client — ตั้งใจซิงก์ค่าจริงทีหลัง mount ตามเหตุผลด้านบน
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loadUiPrefs());
  }, []);

  useEffect(() => {
    applyToDocument(prefs);
  }, [prefs]);

  const persist = useCallback((next: UiPrefs) => {
    setPrefs(next);
    try {
      saveUiPrefs(next);
    } catch {
      // บันทึกไม่สำเร็จ (โควตา/ปิด storage) — ยังสลับธีมในเซสชันนี้ได้ตามปกติ แค่ไม่จำข้ามการโหลดหน้าใหม่
    }
  }, []);

  const setTheme = useCallback((theme: UiTheme) => persist({ ...prefs, theme }), [prefs, persist]);
  const toggleTheme = useCallback(
    () => persist({ ...prefs, theme: prefs.theme === 'dark' ? 'light' : 'dark' }),
    [prefs, persist],
  );
  const setDensity = useCallback((density: UiDensity) => persist({ ...prefs, density }), [prefs, persist]);

  return (
    <ThemeContext.Provider
      value={{ theme: prefs.theme, density: prefs.density, setTheme, toggleTheme, setDensity }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme ต้องอยู่ภายใน <ThemeProvider>');
  return ctx;
}
