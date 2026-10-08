/**
 * ซองเงินของกรุ๊ปนี้อยู่ขั้นไหน มองจากฝั่งเจ้าหน้าที่ส่งกรุ๊ป — ใช้ร่วมกันหน้าตารางงาน (/staff) และหน้าหลัก (/staff/home)
 * บอกให้รู้ตั้งแต่การเงินยังจัดอยู่ ไม่ใช่แค่ตอนฝากมาแล้ว
 * ซองที่การเงินฝากคนอื่น/ส่งหัวหน้าทัวร์ตรง ไม่ใช่เรื่องของคนนี้ → ไม่แสดง (null)
 * tone amber = เจ้าหน้าที่ต้องทำอะไรต่อ · slate = แจ้งให้ทราบ
 * short = ข้อความสั้นสำหรับป้ายในรายการบนมือถือ (บรรทัดเดียว) · text = ข้อความเต็ม (ใช้เป็น title / ที่ที่มีพื้นที่)
 */

import type { ExpenseRequest } from '@/types';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { groupEnvelopeStatus, groupLines, returnedToFinanceBy, type CashEnvelope } from '@/lib/logic/cashEnvelope';

export type EnvelopeNotice = { text: string; short: string; tone: 'amber' | 'slate' };

export function staffEnvelopeNotice(opts: {
  envelopes: CashEnvelope[];
  expenses: ExpenseRequest[];
  staffId: string;
  staffName: string;
  periodId: string;
}): EnvelopeNotice | null {
  const { envelopes, expenses, staffId, staffName, periodId } = opts;
  const envs = envelopes.filter((e) => e.periodId === periodId);
  const mine = envs.filter((e) => e.handover?.proxyStaffId === staffId && !e.leaderAck);
  if (mine.some((e) => e.staffReturn)) return { text: 'ส่งซองเงินคืนการเงินแล้ว — รอการเงินยืนยันรับ', short: 'คืนซองแล้ว · รอการเงินรับ', tone: 'slate' };
  if (mine.some((e) => !e.staffAck)) return { text: 'การเงินส่งมอบซองเงินให้คุณแล้ว — กดยืนยันรับ', short: 'ซองรอคุณกดรับ', tone: 'amber' };
  if (mine.some((e) => !e.staffHandoff)) return { text: 'มีซองเงินต้องนำส่งหัวหน้าทัวร์', short: 'ถือซอง · รอส่งหัวหน้าทัวร์', tone: 'amber' };
  if (mine.length > 0) return { text: 'ส่งซองเงินแล้ว — รอหัวหน้าทัวร์ยืนยันรับ', short: 'ส่งแล้ว · รอหัวหน้าทัวร์รับ', tone: 'slate' };
  if (envs.some((e) => e.handover)) return null;
  if (envs.some((e) => returnedToFinanceBy(e, { id: staffId, name: staffName }))) {
    return { text: 'ส่งซองเงินคืนการเงินแล้ว', short: 'คืนซองแล้ว', tone: 'slate' };
  }
  const docs = expenses.filter((e) => isGroupAdvanceDoc(e) && e.jobId === periodId);
  if (docs.length === 0) return null;
  const status = groupEnvelopeStatus(groupLines(docs), envs);
  if (status.stage === 'sealed') return { text: 'มีซองเงินให้ไปรับที่การเงิน', short: 'ไปรับซองที่การเงิน', tone: 'amber' };
  if (status.stage === 'packing') return { text: 'การเงินกำลังจัดซองเงินของกรุ๊ปนี้', short: 'การเงินกำลังจัดซอง', tone: 'slate' };
  return null;
}
