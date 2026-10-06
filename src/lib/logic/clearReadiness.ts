/**
 * พร้อมเคลียร์เงินหรือยัง — สรุปต่อกรุ๊ปสำหรับหน้า "ตรวจสอบก่อนนัดเคลียร์เงิน" ฝั่งหัวหน้าทัวร์
 * ตอบคำถามเดียว: กรุ๊ปนี้ทำครบแล้วหรือยัง ถ้ายัง ขาดอะไร
 *
 * เช็ก 3 อย่าง (✓ = ไม่ต้องทำอะไรเพิ่ม):
 *   ซองเงิน    — ซองที่การเงินมอบหมาย (ส่งมอบแล้ว · ไม่ถูกส่งคืนการเงิน) ต้องยืนยันรับครบ
 *                ไม่มีซองมอบหมาย = ✓ (ซองที่การเงินยังจัด/ยังไม่ส่งมอบ ไม่นับ — หัวหน้าทัวร์ยังทำอะไรไม่ได้)
 *   ใบเสร็จ    — กรุ๊ปที่มีเงินในมือ (ซองที่รับแล้ว ยังไม่ส่งต่อ ไม่ได้ส่งแลนด์ทั้งซอง) ต้องบันทึกอย่างน้อย 1 รายการ
 *                กรุ๊ปที่ไม่มีเงินต้องใช้จ่าย = ผ่าน · มีรายการต้องแก้ / ร่างค้าง = ยังไม่ผ่าน
 *                ยังไม่จบทริป = เทา (ยังเพิ่มได้อีก) เว้นแต่มีรายการต้องแก้
 *   เบี้ยเลี้ยง — ส่งใบเบิกแล้ว (ส่งแล้ว/อนุมัติ/จ่ายแล้ว = ✓ · ยังไม่ทำ/ร่าง/ต้องแก้ = ✗)
 * ยังไม่จบทริป = ยังไม่ถึงขั้นเคลียร์ (บอกวันที่เคลียร์ได้) — กติกาวันกลับดู tripPhase.ts
 */

import type { ExpenseRequest } from '@/types';
import type { CashEnvelope } from './cashEnvelope';

export type ReadinessTone = 'slate' | 'sky' | 'amber' | 'emerald';

/**
 * บันทึกใบเสร็จของกรุ๊ปนี้ได้หรือยัง — กติกาเดียวทุกหน้า (ตรวจสอบก่อนเคลียร์ · บันทึกใบเสร็จ · การ์ดหลังเดินทาง)
 * มีซองที่ยังไม่ถึงมือ (การเงินยังไม่ส่งมอบ / ยังไม่ยืนยันรับ) = ยังไม่ได้ — คืนเหตุผล · ไม่มีซอง หรือรับครบแล้ว = null (ได้)
 * ซองที่ถูกส่งคืนการเงินไม่นับ (ไม่ได้รอหัวหน้าทัวร์)
 */
export function receiptsBlockedReason(envs: Pick<CashEnvelope, 'handover' | 'leaderAck' | 'staffReturn'>[]): string | null {
  if (envs.some((e) => !e.handover)) return 'รอการเงินส่งมอบซองก่อน';
  if (envs.some((e) => !e.leaderAck && !e.staffReturn)) return 'ยืนยันรับซองก่อน';
  return null;
}

export interface ReadinessCheck {
  label: string;
  /** ผ่าน (รวมกรณีไม่เกี่ยวข้อง) */
  ok: boolean;
  /** ไม่เกี่ยวข้องกับกรุ๊ปนี้ (ไม่มีซองมอบหมาย / ไม่มีค่าใช้จ่าย) — นับว่าผ่าน แต่แสดงสีเทา ไม่ให้สับสนกับ "เรียบร้อย" */
  na?: boolean;
  text: string;
}

export interface ClearReadiness {
  tone: ReadinessTone;
  /** ป้ายสั้นที่หัวการ์ด */
  label: string;
  /** บรรทัดอธิบายใต้ชื่อกรุ๊ป */
  detail: string;
  checks: ReadinessCheck[];
  ready: boolean;
}

export function clearReadiness(input: {
  started: boolean;
  ended: boolean;
  startText: string;
  endText: string;
  envs: CashEnvelope[];
  receipts: ExpenseRequest[];
  perDiem: ExpenseRequest | null;
  /** มีเงินในมือที่ต้องบันทึกใบเสร็จ — ไม่ส่ง = คำนวณจากซอง (รับแล้ว · ไม่ส่งต่อ · ไม่ได้ส่งแลนด์) */
  needsReceipts?: boolean;
}): ClearReadiness {
  const { envs, receipts, perDiem } = input;

  // นับเฉพาะซองที่มอบหมายถึงหัวหน้าทัวร์แล้ว
  const assigned = envs.filter((e) => e.handover && !(e.staffReturn && !e.leaderAck));
  const notAcked = assigned.filter((e) => !e.leaderAck).length;
  const revise = receipts.filter((r) => r.status === 'revise').length;
  const draft = receipts.filter((r) => r.status === 'draft').length;
  const needsReceipts = input.needsReceipts ?? assigned.some((e) => e.leaderAck && !e.leaderForward && !e.landPayments?.length);
  // มีซองที่ยังไม่ถึงมือ (การเงินยังไม่ส่งมอบ / ยังไม่ยืนยันรับ) — ยังสรุปไม่ได้ว่า "ไม่มีค่าใช้จ่าย"
  const envPending = receiptsBlockedReason(envs) !== null;

  const checks: ReadinessCheck[] = [
    assigned.length === 0
      ? { label: 'ซองเงิน', ok: true, na: true, text: envs.some((e) => !e.handover) ? 'การเงินยังไม่ส่งมอบ' : 'ไม่มีซองมอบหมาย' }
      : notAcked > 0
        ? { label: 'ซองเงิน', ok: false, text: `ยังไม่ยืนยันรับ ${notAcked} ซอง` }
        : { label: 'ซองเงิน', ok: true, text: `รับครบ ${assigned.length} ซอง` },
    revise > 0
      ? { label: 'ใบเสร็จ', ok: false, text: `ต้องแก้ไข ${revise} รายการ` }
      // ยังไม่จบทริป — ใบเสร็จยังเพิ่มได้อีก จึงยังไม่ใช่ "ครบ" (เทา บอกจำนวนที่บันทึกแล้ว) · ต้องแก้ไขยังเป็นเรื่องที่ต้องทำทันที
      : !input.ended && receipts.length > 0
        ? { label: 'ใบเสร็จ', ok: true, na: true, text: `บันทึกแล้ว ${receipts.length - draft} รายการ${draft > 0 ? ` · ร่าง ${draft}` : ''} · ยังไม่จบทริป` }
      : draft > 0
        ? { label: 'ใบเสร็จ', ok: false, text: `ร่างยังไม่ส่ง ${draft} รายการ` }
        : receipts.length > 0
          ? { label: 'ใบเสร็จ', ok: true, text: `บันทึกแล้ว ${receipts.length} รายการ` }
          // ถือเงินแต่ยังไม่มีใบเสร็จ — ยังไม่จบทริปเป็นเรื่องปกติ (บันทึกระหว่างเดินทาง) · จบทริปแล้วจึงเป็นเรื่องค้าง
          : needsReceipts && !input.ended
            ? { label: 'ใบเสร็จ', ok: true, na: true, text: 'บันทึกระหว่างเดินทาง' }
          : needsReceipts
            ? { label: 'ใบเสร็จ', ok: false, text: 'ยังไม่ได้บันทึก' }
            : envPending
              ? { label: 'ใบเสร็จ', ok: true, na: true, text: 'รอรับซองก่อน' }
              : !input.ended
                ? { label: 'ใบเสร็จ', ok: true, na: true, text: 'บันทึกระหว่างเดินทาง' }
                : { label: 'ใบเสร็จ', ok: true, na: true, text: 'ไม่มีค่าใช้จ่าย' },
    // ยังไม่จบทริป — ส่งเบี้ยเลี้ยงยังไม่ได้ จึงยังไม่ใช่เรื่องค้าง (เทา บอกวันที่ส่งได้)
    !input.ended && (!perDiem || perDiem.status === 'draft')
      ? { label: 'เบี้ยเลี้ยง', ok: true, na: true, text: `${perDiem ? 'ร่างไว้แล้ว · ' : ''}ส่งได้ตั้งแต่ ${input.endText}` }
      : !perDiem
      ? { label: 'เบี้ยเลี้ยง', ok: false, text: 'ยังไม่ทำใบเบิก' }
      : perDiem.status === 'draft'
        ? { label: 'เบี้ยเลี้ยง', ok: false, text: 'ร่าง ยังไม่ส่ง' }
        : perDiem.status === 'revise'
          ? { label: 'เบี้ยเลี้ยง', ok: false, text: 'ต้องแก้ไข' }
          : { label: 'เบี้ยเลี้ยง', ok: true, text: perDiem.status === 'submitted' ? 'ส่งแล้ว รอบัญชีตรวจ' : perDiem.status === 'paid' ? 'จ่ายแล้ว' : 'อนุมัติแล้ว' },
  ];
  const missing = checks.filter((c) => !c.ok);

  if (!input.started) {
    return { tone: 'slate', label: 'ยังไม่ออกเดินทาง', detail: `ออกเดินทาง ${input.startText} · เคลียร์ได้ตั้งแต่วันกลับ ${input.endText}`, checks, ready: false };
  }
  if (!input.ended) {
    return { tone: 'sky', label: 'กำลังเดินทาง', detail: `เคลียร์ได้ตั้งแต่วันกลับ ${input.endText}`, checks, ready: false };
  }
  if (missing.length > 0) {
    return { tone: 'amber', label: `ยังไม่ครบ ${missing.length} อย่าง`, detail: `ต้องทำ: ${missing.map((c) => `${c.label} (${c.text})`).join(' · ')}`, checks, ready: false };
  }
  return { tone: 'emerald', label: 'ครบแล้ว · ทำนัดหมายได้', detail: 'ทำครบทุกอย่างแล้ว — นัดเข้ามาเคลียร์เงินกับบัญชีได้เลย', checks, ready: true };
}
