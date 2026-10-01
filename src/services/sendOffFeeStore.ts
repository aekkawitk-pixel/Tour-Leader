/**
 * มาตรฐานค่าส่งกรุ๊ป — ที่เก็บค่าตั้งค่าของผู้ดูแลระบบ (ตั้งค่าระบบ → ค่าส่งกรุ๊ป)
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 * ค่าที่ยังไม่เคยตั้ง หรือค่าที่เสียหาย ตกกลับเป็นค่าเริ่มต้นเสมอ
 * มีผลกับใบเบิกที่ทำใหม่ (และใบที่กดแก้ไข) — ใบที่ส่งไปแล้วเก็บยอดของตัวเองไว้ ไม่เปลี่ยนตาม
 */

import { DEFAULT_SEND_OFF_FEE_RATES, type SendOffFeeRates } from '@/lib/logic/staffPortal';
import { readJson, writeJson } from './browserStorage';

const KEY = 'sendOffFeeRates';

export interface StoredSendOffFeeRates extends SendOffFeeRates {
  /** ใครแก้ / แก้เมื่อไร — ไว้ตรวจย้อนหลัง */
  updatedBy?: string;
  updatedAt?: string;
}

export function loadSendOffFeeRates(): StoredSendOffFeeRates {
  const p = readJson<Partial<StoredSendOffFeeRates> | null>(KEY, null);
  if (!p || typeof p !== 'object') return { ...DEFAULT_SEND_OFF_FEE_RATES };
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);
  return {
    normal: num(p.normal, DEFAULT_SEND_OFF_FEE_RATES.normal),
    holiday: num(p.holiday, DEFAULT_SEND_OFF_FEE_RATES.holiday),
    weekendAsHoliday: typeof p.weekendAsHoliday === 'boolean' ? p.weekendAsHoliday : DEFAULT_SEND_OFF_FEE_RATES.weekendAsHoliday,
    ...(p.updatedBy ? { updatedBy: p.updatedBy } : {}),
    ...(p.updatedAt ? { updatedAt: p.updatedAt } : {}),
  };
}

export function saveSendOffFeeRates(rates: SendOffFeeRates, by: string, at: string): StoredSendOffFeeRates {
  const row: StoredSendOffFeeRates = { ...rates, updatedBy: by, updatedAt: at };
  writeJson(KEY, row);
  return row;
}
