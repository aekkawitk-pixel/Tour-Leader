/**
 * อัตราเบี้ยเลี้ยงหัวหน้าทัวร์ (บาท / วัน) — ฝ่ายจัดหัวหน้าทัวร์ตั้งที่เมนู "อัตราเบี้ยเลี้ยง"
 *   byCountry = ค่าเริ่มต้นตามประเทศ · byProgram = เฉพาะโปรแกรมที่ต้องการให้ต่างจากค่าเริ่มต้น
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 * ยังไม่เคยตั้งค่าตามประเทศ → ตั้งต้นจากตารางอ้างอิงเดิม (PER_DIEM_RATES)
 * มีผลกับใบเบิกที่ทำใหม่ (และใบที่กดแก้ไข) — ใบที่ส่งไปแล้วเก็บยอดของตัวเองไว้
 */

import type { PerDiemRates } from '@/lib/logic/leaderClaims';
import { PER_DIEM_RATES } from '@/data/perDiemRates';
import { readJson, writeJson } from './browserStorage';

const KEY = 'leaderPerDiemProgramRates';

export interface StoredPerDiemRates extends PerDiemRates {
  updatedBy?: string;
  updatedAt?: string;
}

/** ค่าเริ่มต้นตามประเทศจากตารางอ้างอิงเดิม */
export const DEFAULT_COUNTRY_PER_DIEM: Record<string, number> = Object.fromEntries(
  PER_DIEM_RATES.flatMap((g) => g.countryNames.map((c) => [c, g.rateTHB])),
);

/** คัดเฉพาะค่าที่เป็นตัวเลขบวก — ข้อมูลเสียบางช่องไม่ทำให้ทั้งตารางหาย */
function cleanMap(raw: unknown, upper = false): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[upper ? k.trim().toUpperCase() : k] = v;
  }
  return out;
}

export function loadPerDiemRates(): StoredPerDiemRates {
  const p = readJson<Partial<StoredPerDiemRates> | null>(KEY, null);
  if (!p || typeof p !== 'object') return { byCountry: { ...DEFAULT_COUNTRY_PER_DIEM }, byProgram: {} };
  return {
    // ข้อมูลเก่า (ก่อนมีค่าตามประเทศ) ไม่มี byCountry → ใช้ค่าเริ่มต้นจากตารางอ้างอิง
    byCountry: p.byCountry ? cleanMap(p.byCountry, true) : { ...DEFAULT_COUNTRY_PER_DIEM },
    byProgram: cleanMap(p.byProgram),
    ...(p.updatedBy ? { updatedBy: p.updatedBy } : {}),
    ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
  };
}

export function savePerDiemRates(rates: PerDiemRates, by: string, at: string): StoredPerDiemRates {
  const row: StoredPerDiemRates = { byCountry: cleanMap(rates.byCountry, true), byProgram: cleanMap(rates.byProgram), updatedBy: by, updatedAt: at };
  writeJson(KEY, row);
  return row;
}
