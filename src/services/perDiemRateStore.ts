/**
 * อัตราเบี้ยเลี้ยงหัวหน้าทัวร์ตามโปรแกรมทัวร์ (บาท / วัน) — ฝ่ายจัดหัวหน้าทัวร์ตั้งที่เมนู "อัตราเบี้ยเลี้ยง"
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 * มีผลกับใบเบิกที่ทำใหม่ (และใบที่กดแก้ไข) — ใบที่ส่งไปแล้วเก็บยอดของตัวเองไว้
 */

import type { PerDiemProgramRates } from '@/lib/logic/leaderClaims';
import { readJson, writeJson } from './browserStorage';

const KEY = 'leaderPerDiemProgramRates';

export interface StoredPerDiemRates {
  byProgram: PerDiemProgramRates;
  updatedBy?: string;
  updatedAt?: string;
}

/** คัดเฉพาะค่าที่เป็นตัวเลขบวก — ข้อมูลเสียบางช่องไม่ทำให้ทั้งตารางหาย */
function cleanMap(raw: unknown): PerDiemProgramRates {
  if (!raw || typeof raw !== 'object') return {};
  const out: PerDiemProgramRates = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

export function loadPerDiemRates(): StoredPerDiemRates {
  const p = readJson<Partial<StoredPerDiemRates> | null>(KEY, null);
  if (!p || typeof p !== 'object') return { byProgram: {} };
  return {
    byProgram: cleanMap(p.byProgram),
    ...(p.updatedBy ? { updatedBy: p.updatedBy } : {}),
    ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
  };
}

export function savePerDiemRates(byProgram: PerDiemProgramRates, by: string, at: string): StoredPerDiemRates {
  const row: StoredPerDiemRates = { byProgram: cleanMap(byProgram), updatedBy: by, updatedAt: at };
  writeJson(KEY, row);
  return row;
}
