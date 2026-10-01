/**
 * อัตราค่าทิปหัวหน้าทัวร์ — ที่เก็บค่าตั้งค่าของผู้ดูแลระบบ (ตั้งค่าระบบ → ค่าทิป)
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 * มีผลกับใบเบิกค่าทิปที่ทำใหม่ (และใบที่กดแก้ไข) — ใบที่ส่งไปแล้วเก็บยอดของตัวเองไว้
 */

import { EMPTY_TIP_RATES, type TipRates } from '@/lib/logic/leaderClaims';
import { readJson, writeJson } from './browserStorage';

const KEY = 'leaderTipRates';

export interface StoredTipRates extends TipRates {
  updatedBy?: string;
  updatedAt?: string;
}

/** คัดเฉพาะค่าที่เป็นตัวเลขบวก — ข้อมูลเสียบางช่องไม่ทำให้ทั้งตารางหาย */
function cleanMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

export function loadTipRates(): StoredTipRates {
  const p = readJson<Partial<StoredTipRates> | null>(KEY, null);
  if (!p || typeof p !== 'object') return { ...EMPTY_TIP_RATES, byCountry: {}, byProgram: {} };
  return {
    byCountry: cleanMap(p.byCountry),
    byProgram: cleanMap(p.byProgram),
    ...(p.updatedBy ? { updatedBy: p.updatedBy } : {}),
    ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
  };
}

export function saveTipRates(rates: TipRates, by: string, at: string): StoredTipRates {
  const row: StoredTipRates = { byCountry: cleanMap(rates.byCountry), byProgram: cleanMap(rates.byProgram), updatedBy: by, updatedAt: at };
  writeJson(KEY, row);
  return row;
}
