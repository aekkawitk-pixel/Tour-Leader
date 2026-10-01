/**
 * Leader Document Record — โครงร่างกลางของ "เอกสารประจำตัว 1 ฉบับ" ของหัวหน้าทัวร์
 *
 * ทุกชนิดเอกสาร (หนังสือเดินทาง · Visa · บัตรหัวหน้าทัวร์ · บัตรประชาชน · เอกสารประวัติอาชญากรรม)
 * ใช้โครงเดียวกันนี้ ต่างกันแค่ชุดช่องข้อมูลใน `fields` (ดู documentFieldKeys) และ `extra` เฉพาะชนิด
 *
 * แยกเก็บ 2 ชุดเสมอ (เหมือนที่ Passport ทำไว้เดิม) เพื่อตรวจย้อนหลังได้ว่าค่าใดมาจาก OCR:
 *   • ocrOriginal — ค่าที่ OCR อ่านได้ "ครั้งแรก" + ความมั่นใจรายช่อง (ห้ามแก้ทับ)
 *   • fields      — ค่าปัจจุบันที่ผู้ใช้ตรวจสอบ/แก้ไขและยืนยัน
 *
 * รูปต้นฉบับเก็บแยกใน Private Storage (IndexedDB) อ้างด้วย imageId เท่านั้น
 * ห้ามเก็บเลขเอกสารอ่อนไหวลง Audit Log กลาง
 *
 * ⚠️ ไฟล์นี้เป็นชั้น data — ห้าม import จาก modules/ · services/ · components/
 */

import type { DocData, DocKind } from './documentSchemas';

/* ------------------------------ ค่าที่ OCR อ่านได้ ----------------------------- */

/** ระดับความมั่นใจของ OCR */
export type OcrConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNREADABLE';

/** แหล่งที่มาของค่าแต่ละช่อง (เอกสารที่มี MRZ ใช้ MRZ เป็นแหล่งหลัก) */
export type OcrFieldSource = 'MRZ' | 'VIZ' | 'MRZ_VIZ' | 'NONE' | 'DERIVED';

/** ค่าที่ OCR อ่านได้รายช่อง พร้อมหลักฐานประกอบ */
export interface OcrField {
  value: string;
  confidence: OcrConfidence;
  /** คะแนนดิบจาก engine 0-100 (null = อ่านไม่ได้) — เก็บไว้ตรวจย้อนหลัง */
  score: number | null;
  source: OcrFieldSource;
  /** ค่าจาก MRZ ไม่ตรงกับที่พิมพ์บนเอกสาร */
  mismatch?: boolean;
  /** ข้อความอธิบายเมื่อ mismatch หรืออ่านไม่ได้ */
  note?: string;
}

/** ค่าที่ OCR อ่านได้ทั้งฉบับ — key = ชื่อช่องตาม schema ของชนิดเอกสารนั้น */
export type DocumentOcrFields = Record<string, OcrField>;

/** สถานะของค่าปัจจุบันในแต่ละช่อง — เปลี่ยนเป็น USER_VERIFIED เมื่อผู้ใช้แก้ */
export type FieldOrigin = 'OCR' | 'USER_VERIFIED' | 'MANUAL';

/* ------------------------------ สถานะของเอกสาร ------------------------------ */

/** สถานะการบันทึก — ฉบับร่าง หรือยืนยันแล้ว */
export type DocumentStatus = 'DRAFT' | 'CONFIRMED';

/**
 * สถานะการใช้งานของเอกสาร — แยกจากวันหมดอายุ (ซึ่งคำนวณจากวันที่)
 * ใช้กับกรณีที่เอกสารใช้ไม่ได้ทั้งที่ยังไม่หมดอายุ
 */
export type DocumentLifecycle = 'ACTIVE' | 'REVOKED' | 'LOST' | 'INACTIVE';

export const DOCUMENT_LIFECYCLE_LABEL: Record<DocumentLifecycle, string> = {
  ACTIVE: 'ใช้งานอยู่',
  REVOKED: 'ถูกยกเลิก',
  LOST: 'สูญหาย',
  INACTIVE: 'ปิดใช้งาน',
};

/** วิธีที่ข้อมูลเข้าสู่ระบบ */
export type DocumentEntryMethod = 'OCR' | 'MANUAL';

/* -------------------------------- ประวัติการแก้ไข ------------------------------- */

export type DocumentHistoryAction =
  | 'OCR_IMPORT' | 'USER_EDIT' | 'CONFIRM' | 'SAVE_DRAFT'
  | 'SET_PRIMARY' | 'UNSET_PRIMARY' | 'RE_OCR' | 'MANUAL_ENTRY'
  | 'LIFECYCLE_CHANGE' | 'REPLACE_IMAGE';

export interface DocumentHistoryEntry {
  at: string; // ISO datetime
  by: string;
  action: DocumentHistoryAction;
  /** ช่องที่เปลี่ยน (เฉพาะ USER_EDIT) — เก็บชื่อช่อง ไม่เก็บค่าอ่อนไหวลง log กลาง */
  changedFields?: string[];
  note?: string;

  /**
   * ไฟล์ที่ผูกกับเหตุการณ์นี้ — ไฟล์ที่แนบตอนสร้าง หรือ "ไฟล์ก่อนถูกแทนที่"
   * เก็บ imageId ไว้เพื่อให้เปิดดูไฟล์เวอร์ชันนั้นย้อนหลังได้ ไม่ใช่รู้แค่ว่าชื่ออะไร
   */
  imageId?: string | null;
  fileName?: string | null;
}

/* --------------------------------- ตัวเอกสาร --------------------------------- */

/**
 * เอกสารประจำตัว 1 ฉบับ
 *
 * `TExtra` = ข้อมูลเฉพาะชนิด เช่น หนังสือเดินทางเก็บผลตรวจ MRZ ไว้ที่นี่
 * ชนิดที่ไม่มีข้อมูลพิเศษให้ใช้ `null`
 */
export interface LeaderDocumentRecord<TExtra = unknown> {
  docId: string;
  tourLeaderId: string;
  kind: DocKind;

  /** ฉบับหลักของชนิดนี้ — มีได้ไม่เกิน 1 ฉบับต่อ (หัวหน้าทัวร์ × ชนิดเอกสาร) */
  isPrimary: boolean;
  status: DocumentStatus;
  lifecycle: DocumentLifecycle;
  entryMethod: DocumentEntryMethod;

  /** ค่าปัจจุบัน (ผู้ใช้ตรวจสอบ/แก้ไขแล้ว) — key ตาม documentFieldKeys(kind) */
  fields: DocData;
  /** สถานะรายช่อง — OCR / ผู้ใช้ตรวจสอบแล้ว / กรอกเอง */
  fieldOrigin: Record<string, FieldOrigin>;

  /** ค่าที่ OCR อ่านได้ครั้งแรก — ห้ามแก้ทับ (null เมื่อกรอกเอง) */
  ocrOriginal: DocumentOcrFields | null;
  /** ข้อความ OCR ดิบทั้งหน้า — เก็บไว้ตรวจย้อนหลัง (เช่นรูปแบบวันที่ต้นฉบับ) */
  ocrRawText: string | null;

  /** ไฟล์ต้นฉบับใน Private Storage (อ้างด้วย imageId — ไม่เก็บไฟล์ในนี้) */
  imageId: string | null;
  /** รูปบุคคล/ลายเซ็นที่แยกจากเอกสารได้ (ถ้าระบบแยกได้) */
  portraitImageId: string | null;
  signatureImageId: string | null;
  sourceFileName: string | null;
  /**
   * เมตาของไฟล์แนบ — เก็บคู่กับระเบียนเพื่อให้แสดงในรายการได้โดยไม่ต้องเปิด IndexedDB
   * ไม่บังคับ เพราะระเบียนที่บันทึกไว้ก่อนหน้านี้ไม่มีค่าเหล่านี้
   */
  fileByteSize?: number | null;
  fileUploadedBy?: string | null;
  fileUploadedAt?: string | null;

  /** ข้อมูลเฉพาะชนิดเอกสาร (เช่น ผลตรวจ MRZ ของหนังสือเดินทาง) */
  extra: TExtra | null;

  /** หมายเหตุของผู้ดูแล */
  note: string;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** ผู้ยืนยันข้อมูล */
  verifiedBy: string | null;
  verifiedAt: string | null;

  history: DocumentHistoryEntry[];
}

/** เอกสารที่ยังไม่รู้ชนิดตอน compile — ใช้ในชั้น store ที่จัดการทุกชนิดรวมกัน */
export type AnyLeaderDocumentRecord = LeaderDocumentRecord<unknown>;

/* --------------------------------- ตัวช่วย ---------------------------------- */

/** ค่าว่างของทุกช่องตามรายชื่อ key ที่ให้มา */
export function emptyFieldsFor(keys: readonly string[]): DocData {
  return keys.reduce<DocData>((acc, k) => { acc[k] = ''; return acc; }, {});
}

/** สถานะเริ่มต้นของทุกช่องเมื่อกรอกเอง */
export function manualFieldOriginFor(keys: readonly string[]): Record<string, FieldOrigin> {
  return keys.reduce<Record<string, FieldOrigin>>((acc, k) => { acc[k] = 'MANUAL'; return acc; }, {});
}

/**
 * เอกสารใช้งานได้อยู่หรือไม่ ณ วันที่กำหนด
 * ใช้ไม่ได้เมื่อ: สถานะไม่ใช่ ACTIVE · ยังเป็นฉบับร่าง · หรือหมดอายุก่อนวันที่ตรวจ
 */
export function isDocumentUsableOn(
  doc: Pick<AnyLeaderDocumentRecord, 'lifecycle' | 'status' | 'fields'>,
  isoDate: string,
): boolean {
  if (doc.lifecycle !== 'ACTIVE') return false;
  if (doc.status !== 'CONFIRMED') return false;
  const expiry = doc.fields.expiryDate?.trim();
  if (!expiry) return true; // ไม่มีวันหมดอายุ = ใช้ได้ตลอด
  return expiry >= isoDate;
}
