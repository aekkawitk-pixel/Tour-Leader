/**
 * เมนู "จ่ายเงิน" — โอนเงินใบเบิกที่ตรวจอนุมัติแล้ว (แยกจากคิวตรวจ "ตรวจสอบรายการจ่าย")
 *
 * ใบที่มาที่นี่: เบี้ยเลี้ยง · ค่าส่งกรุ๊ป · ใบเบิกอื่น ๆ ที่อนุมัติแล้ว
 * ไม่มา: ใบเสร็จค่าใช้จ่ายจริงของหัวหน้าทัวร์ (รายงานการใช้เงิน — เงินจ่ายไปแล้วผ่านซอง ส่วนต่างไปเคลียร์เงินกรุ๊ป)
 *        เอกสารเบิกค่าใช้จ่ายกรุ๊ปที่นำเข้า (จัดซองที่จัดการค่าใช้จ่ายกรุ๊ป)
 * ขั้นจ่าย: อนุมัติแล้ว → ตั้งเรื่องรอจ่าย → บันทึกจ่าย
 */

import type { StatusMeta } from '../labels';
import type { ExpenseRequest, ExpenseStatus } from '@/types';
import { isGroupAdvanceDoc } from './groupBudget';
import { isUsageReport } from './usageReport';

export type PayStage = Extract<ExpenseStatus, 'approved' | 'awaiting_payment' | 'paid'>;
export const PAY_STAGES: PayStage[] = ['approved', 'awaiting_payment', 'paid'];

export const PAY_STAGE: Record<PayStage, StatusMeta> = {
  approved: { label: 'รอตั้งเรื่องจ่าย', tone: 'sky' },
  awaiting_payment: { label: 'รอโอน', tone: 'indigo' },
  paid: { label: 'จ่ายแล้ว', tone: 'green' },
};

/** ใบนี้อยู่ในงานจ่ายเงินหรือไม่ */
export function isPayable(e: ExpenseRequest): e is ExpenseRequest & { status: PayStage } {
  return !isGroupAdvanceDoc(e) && !isUsageReport(e) && (PAY_STAGES as ExpenseStatus[]).includes(e.status);
}

/** เรียง: ที่ยังต้องจ่ายก่อน (ใบเก่าสุดก่อน — ค้างนานสุดจ่ายก่อน) · จ่ายแล้วไว้ท้าย (ล่าสุดก่อน) */
export function sortForPayment(list: ExpenseRequest[]): ExpenseRequest[] {
  const order = (e: ExpenseRequest) => (e.status === 'awaiting_payment' ? 0 : e.status === 'approved' ? 1 : 2);
  const at = (e: ExpenseRequest) => e.submittedAt ?? e.requestedAt;
  return [...list].sort((a, b) => order(a) - order(b)
    || (a.status === 'paid' ? (b.paidAt ?? '').localeCompare(a.paidAt ?? '') : at(a).localeCompare(at(b))));
}
