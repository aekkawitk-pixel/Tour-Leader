/**
 * โครงสร้างรองรับการอ่านข้อมูลจากเอกสาร (OCR / Document AI)
 *
 * ⚠️ สำคัญ: โปรเจกต์นี้ "ยังไม่ได้เชื่อมบริการอ่านเอกสารจริง"
 *   - readDocumentOcr() จะคืนสถานะ 'unsupported' เสมอ และ **ไม่สร้าง/ไม่เดา** ข้อมูลใด ๆ
 *   - ผู้ใช้กรอกข้อมูลเองได้ทุกช่อง (ดูใน UI แท็บ "เอกสารประจำตัว")
 *
 * วิธีเชื่อมบริการจริงในอนาคต:
 *   ตั้ง OCR_ENABLED = true แล้วแทนที่ readDocumentOcr ให้เรียก API อ่านเอกสาร
 *   จากนั้นคืน { ok: true, data, confidence } โดย
 *     - data       = คู่ (field key ตาม DOC_SCHEMAS) → ค่าที่อ่านได้ (วันที่เป็น ISO 'YYYY-MM-DD')
 *     - confidence = คู่ field key → ความมั่นใจ 0..1 (ช่องที่ต่ำจะถูกทำเครื่องหมาย "ควรตรวจสอบ")
 */

import type { UploadedFile } from './newLeaderWizard';
import type { DocData, DocKind } from '@/data/leaders/documentSchemas';

/** ยังไม่ได้เชื่อมบริการอ่านเอกสาร — ใช้แสดงข้อความใน UI ด้วย */
export const OCR_ENABLED = false;

export type OcrResult =
  | { ok: true; data: DocData; confidence: Record<string, number> }
  | { ok: false; reason: 'unsupported' | 'error' };

/**
 * อ่านข้อมูลจากไฟล์เอกสาร
 * ปัจจุบันยังไม่เชื่อมบริการ → คืน 'unsupported' โดยไม่แตะต้อง/เดาข้อมูล
 */
export function readDocumentOcr(file: UploadedFile, kind: DocKind): Promise<OcrResult> {
  void file;
  void kind;
  // ไม่มีบริการ OCR ที่เชื่อมไว้ — ห้ามสร้างข้อมูลตัวอย่าง/เดาข้อมูล
  return Promise.resolve({ ok: false, reason: 'unsupported' });
}
