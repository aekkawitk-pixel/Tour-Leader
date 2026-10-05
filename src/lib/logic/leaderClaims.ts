/**
 * ใบเบิกเบี้ยเลี้ยง / ค่าทิป ของหัวหน้าทัวร์ — ตรรกะล้วน (ทดสอบได้ตรง ๆ)
 *
 * หลักการเคลียร์งานรายกรุ๊ป: หัวหน้าทัวร์ส่ง "แยกเอกสาร" 3 ใบต่อกรุ๊ป
 *   1) ค่าใช้จ่าย — ใบเสร็จที่บันทึกจากเมนูค่าใช้จ่าย (ExpenseRequest category 'actual') ตามเดิม
 *   2) ใบเบิกเบี้ยเลี้ยง — อัตราต่อวันตามประเทศ (perDiemRates) × จำนวนวันเดินทาง
 *   3) ใบเบิกค่าทิป — อัตราต่อลูกค้า 1 คน (ทั้งทริป) × จำนวนลูกค้า
 *      อัตราหลักตามประเทศ · บางโปรแกรมมีอัตราเฉพาะ (ชนะอัตราประเทศ) — ผู้ดูแลระบบตั้งที่ ตั้งค่าระบบ → ค่าทิป
 * ใบ 2) และ 3) เป็น ExpenseRequest category 'leader_fee' แยก claimKind — บัญชีตรวจ/อนุมัติแยกใบได้
 */

import type { ExpenseRequest } from '@/types';

export type LeaderClaimKind = 'per_diem' | 'tip';

export const LEADER_CLAIM_LABEL: Record<LeaderClaimKind, string> = {
  per_diem: 'เบี้ยเลี้ยง',
  tip: 'ค่าทิป',
};

/** อัตราค่าทิป (บาท / ลูกค้า 1 คน / ทั้งทริป) — key ประเทศ = countryName ตัวพิมพ์ใหญ่ · key โปรแกรม = ชื่อโปรแกรม (displayName) */
export interface TipRates {
  byCountry: Record<string, number>;
  byProgram: Record<string, number>;
}
export const EMPTY_TIP_RATES: TipRates = { byCountry: {}, byProgram: {} };

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();

/** อัตราค่าทิปของกรุ๊ป — โปรแกรมก่อน (เฉพาะกรณี) แล้วค่อยประเทศ · ไม่มีทั้งคู่ = null (หัวหน้าทัวร์กรอกเอง บัญชีตรวจ) */
export function tipRateFor(
  period: { countryName?: string | null; displayName?: string | null },
  rates: TipRates,
): { rate: number; source: 'program' | 'country' } | null {
  const program = period.displayName?.trim();
  if (program && rates.byProgram[program] > 0) return { rate: rates.byProgram[program], source: 'program' };
  const c = rates.byCountry[norm(period.countryName)];
  return c > 0 ? { rate: c, source: 'country' } : null;
}

/** จำนวนวันเดินทาง (นับวันแรกและวันสุดท้าย) — ใช้คิดเบี้ยเลี้ยง */
export function tripDays(startDate: string, endDate: string | null | undefined): number {
  if (!endDate) return 1;
  const s = Date.UTC(+startDate.slice(0, 4), +startDate.slice(5, 7) - 1, +startDate.slice(8, 10));
  const e = Date.UTC(+endDate.slice(0, 4), +endDate.slice(5, 7) - 1, +endDate.slice(8, 10));
  return Math.max(1, Math.round((e - s) / 86_400_000) + 1);
}

const INACTIVE = new Set(['cancelled', 'rejected']);

/** ใบเบิกเบี้ยเลี้ยง/ค่าทิปที่ยังมีผลของกรุ๊ปนี้ (ไม่นับใบที่ยกเลิก/ไม่อนุมัติ — ทำใบใหม่ได้) */
export function activeLeaderClaim(
  expenses: ExpenseRequest[],
  periodId: string,
  leaderId: string,
  kind: LeaderClaimKind,
): ExpenseRequest | null {
  return expenses.find((e) => e.claimKind === kind && e.jobId === periodId && e.requesterId === leaderId && !INACTIVE.has(e.status)) ?? null;
}

/* ------------------------------------------------------------------ */
/* เอกสารค่าใช้จ่ายหัวหน้าทัวร์ (ใบเบิกเบี้ยเลี้ยง) — ตามแบบฟอร์มกระดาษของบริษัท */
/* ------------------------------------------------------------------ */

/**
 * รายการตั้งต้นในเอกสารค่าใช้จ่ายหัวหน้าทัวร์ (ข้อ 1 = เบี้ยเลี้ยง คำนวณจากอัตราของโปรแกรม)
 * รายการอื่นนอกจากนี้ หัวหน้าทัวร์กด "เพิ่มรายการ" แล้วตั้งชื่อเอง (expenseType = ชื่อที่พิมพ์)
 */
export const LEADER_FORM_ITEMS = ['ค่าเบี้ยเลี้ยง', 'ค่าเบ็ดเตล็ด', 'ค่าเค้กวันเกิด', 'ค่ามื้ออาหารอิสระ', 'ค่าวีซ่า'] as const;
export type LeaderFormItem = (typeof LEADER_FORM_ITEMS)[number];

/** อัตราเบี้ยเลี้ยง (บาท / วัน) ตามโปรแกรมทัวร์ — ฝ่ายจัดหัวหน้าทัวร์ตั้งไว้ · key = perDiemProgramKey */
export type PerDiemProgramRates = Record<string, number>;

/** อัตราเบี้ยเลี้ยง: ค่าเริ่มต้นตามประเทศ (key = countryName ตัวพิมพ์ใหญ่) + เฉพาะโปรแกรมที่ต่างจากค่าเริ่มต้น */
export interface PerDiemRates {
  byCountry: Record<string, number>;
  byProgram: PerDiemProgramRates;
}
export const EMPTY_PER_DIEM_RATES: PerDiemRates = { byCountry: {}, byProgram: {} };

/** คีย์โปรแกรมของกรุ๊ป — รหัสโปรแกรม (เช่น ZGCTS-2518VZ) ก่อน ไม่มีจึงใช้ชื่อโปรแกรม */
export function perDiemProgramKey(period: { programCode?: string | null; displayName?: string | null }): string {
  return (period.programCode ?? '').trim().toUpperCase() || (period.displayName ?? '').trim();
}

type PerDiemPeriod = { programCode?: string | null; displayName?: string | null; countryName?: string | null };

/** อัตราเบี้ยเลี้ยงต่อวันของกรุ๊ป + ที่มา — เฉพาะโปรแกรมก่อน แล้วค่อยค่าเริ่มต้นของประเทศ · ไม่มีทั้งคู่ = null */
export function perDiemRateSource(period: PerDiemPeriod, rates: PerDiemRates): { rate: number; source: 'program' | 'country' } | null {
  const p = rates.byProgram[perDiemProgramKey(period)];
  if (p > 0) return { rate: p, source: 'program' };
  const c = rates.byCountry[norm(period.countryName)];
  return c > 0 ? { rate: c, source: 'country' } : null;
}

/** อัตราเบี้ยเลี้ยงต่อวันของกรุ๊ป — ไม่มีอัตรา = null (หัวหน้าทัวร์กรอกเอง บัญชีตรวจ) */
export function perDiemRateFor(period: PerDiemPeriod, rates: PerDiemRates): number | null {
  return perDiemRateSource(period, rates)?.rate ?? null;
}

/**
 * จำนวนลูกค้า / หัวหน้าทัวร์ จากข้อความในเอกสารเบิกที่นำเข้า (AdvanceDocMeta.pax) เช่น "34 ท่าน + 1 TL" · "34+1"
 * อ่านไม่ออก = null (ใช้ค่าอื่นแทน)
 */
export function parsePaxText(text: string | null | undefined): { pax: number; leaders: number | null } | null {
  const m = (text ?? '').match(/(\d+)\s*(?:ท่าน|คน|pax)?\s*(?:\+\s*(\d+))?/i);
  if (!m) return null;
  return { pax: Number(m[1]), leaders: m[2] != null ? Number(m[2]) : null };
}
