/**
 * Document Expiry Alerts — "เอกสารของหัวหน้าทัวร์คนนี้ต้องตามกี่รายการ" สำหรับพอร์ทัลหัวหน้าทัวร์ (/guide)
 *
 * แยกจาก checkDocumentReadiness (documentReadiness.ts) โดยตั้งใจ: ตัวนั้นตอบว่า "พร้อมกรุ๊ปนี้ไหม"
 * (ต้องมี TripWindow) ส่วนนี้ตอบคำถามที่ต่างกัน — "มีอะไรใกล้หมดอายุบ้าง" โดยไม่ผูกกับกรุ๊ปไหนเลย
 * ใช้ค่าเกณฑ์เดียวกับที่แท็บ "เอกสารประจำตัว" ฝั่งผู้จัดใช้อยู่แล้ว (src/app/leaders/[id]/page.tsx)
 * เพื่อไม่ให้ตัวเลขสองฝั่งเพี้ยนกัน
 */

import { diffDays } from '@/lib/format';
import type { LeaderDocument } from '@/types';

/** เตือนล่วงหน้ากี่วันก่อนหมดอายุ — เท่ากับเกณฑ์ "soonDocs" ฝั่งผู้จัด */
export const DOCUMENT_EXPIRY_SOON_WITHIN_DAYS = 120;

export type DocumentExpirySeverity = 'expired' | 'soon';

export interface DocumentExpiryAlert {
  docId: string;
  severity: DocumentExpirySeverity;
  name: string;
  expiresAt: string;
  /** ติดลบ = หมดอายุไปแล้วกี่วัน */
  daysLeft: number;
}

/**
 * เอกสารที่ต้องตาม (หมดอายุแล้ว/ใกล้หมดอายุ) — ไม่นับบัตรประชาชน ตรงกับเกณฑ์เดียวกับฝั่งผู้จัด
 * เรียงเอกสารที่ใกล้ปัญหาที่สุดขึ้นก่อน (หมดอายุนานสุด → ใกล้หมดอายุสุด)
 */
export function listDocumentExpiryAlerts(
  documents: readonly LeaderDocument[],
  today: string,
): DocumentExpiryAlert[] {
  return documents
    .filter((d): d is LeaderDocument & { expiresAt: string } => d.kind !== 'national_id' && Boolean(d.expiresAt))
    .map((d) => {
      const daysLeft = diffDays(today, d.expiresAt);
      const severity: DocumentExpirySeverity | null = daysLeft < 0
        ? 'expired'
        : daysLeft <= DOCUMENT_EXPIRY_SOON_WITHIN_DAYS ? 'soon' : null;
      return severity ? { docId: d.id, severity, name: d.name, expiresAt: d.expiresAt, daysLeft } : null;
    })
    .filter((a): a is DocumentExpiryAlert => a !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}
