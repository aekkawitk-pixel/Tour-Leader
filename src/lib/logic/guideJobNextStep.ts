/**
 * ขั้นต่อไปของงาน (กรุ๊ป) — ป้ายในหน้า "งานของฉัน" ฝั่งหัวหน้าทัวร์ บอกว่ากรุ๊ปนี้ต้องทำอะไรต่อโดยไม่ต้องเปิดดู
 *
 * ลำดับ (เจอข้อแรกที่ตรงชนะ):
 *   การเงินปิดเคลียร์แล้ว            → เรียบร้อย
 *   มีซองรอคุณยืนยันรับ              → ยืนยันรับซอง (ต้องทำ — ซองมาถึงช้าได้ทุกช่วง)
 *   ยังไม่ออกเดินทาง                 → รอเดินทาง
 *   กำลังเดินทาง                     → บันทึกใบเสร็จ
 *   จบทริปแล้ว                       → ขั้นต่อไปของหลังเดินทาง (afterTripProgress — ชุดเดียวกับการ์ดกรุ๊ปในบัญชี-การเงิน)
 *                                      มีลิงก์ = หัวหน้าทัวร์ต้องทำ · ไม่มี = รอฝั่งการเงิน
 */

import type { AfterTripProgress } from './afterTripProgress';

export type NextStepTone = 'action' | 'waiting' | 'done' | 'idle';

export interface JobNextStep {
  label: string;
  tone: NextStepTone;
}

export function jobNextStep(input: {
  started: boolean;
  ended: boolean;
  /** การเงินปิดเคลียร์กรุ๊ปนี้แล้ว */
  closed: boolean;
  /** ซองที่ส่งมาถึงหัวหน้าทัวร์คนนี้แล้วแต่ยังไม่กดยืนยันรับ */
  envelopesToAck: number;
  /** ความคืบหน้าหลังเดินทาง — ใช้เมื่อจบทริปแล้ว */
  afterTrip: AfterTripProgress | null;
}): JobNextStep {
  if (input.closed) return { label: 'เคลียร์เงินเรียบร้อย', tone: 'done' };
  if (input.envelopesToAck > 0) return { label: `ยืนยันรับซอง${input.envelopesToAck > 1 ? ` ${input.envelopesToAck} ซอง` : ''}`, tone: 'action' };
  if (!input.started) return { label: 'รอเดินทาง', tone: 'idle' };
  if (!input.ended) return { label: 'บันทึกใบเสร็จระหว่างทาง', tone: 'action' };
  const next = input.afterTrip?.next;
  if (!next) return { label: 'เคลียร์เงินหลังเดินทาง', tone: 'action' };
  return { label: next.label, tone: next.href ? 'action' : 'waiting' };
}
