/**
 * Passport Book Store (§7/§10) — เล่มหนังสือเดินทางของหัวหน้าทัวร์
 *
 * ตั้งแต่รวมที่เก็บเอกสาร ไฟล์นี้ไม่มีตรรกะของตัวเองแล้ว — เป็น "หน้ากาก" บาง ๆ
 * ที่แปลงระหว่าง PassportBook (รูปที่ UI หนังสือเดินทางใช้) กับ LeaderDocumentRecord
 * (โครงร่างกลางใน documentStore) กติกาทั้งหมดอยู่ที่ documentStore จุดเดียว:
 *   • เล่มหลักไม่เกิน 1 เล่มต่อคน (ที่นั่นคือ 1 ฉบับหลักต่อ คน × ชนิดเอกสาร)
 *   • เล่มแรกเป็นเล่มหลักอัตโนมัติ · ตั้งเล่มใหม่เป็นหลัก → เล่มเดิมถูกลดเป็นเล่มรอง
 *   • เล่มที่ใช้ไม่ได้แล้วถูกปลดจากเล่มหลักให้เอง
 *
 * ชื่อฟังก์ชันและรูปข้อมูลที่ export คงเดิมทุกตัว เพื่อไม่ให้ UI ต้องแก้ตาม
 * ข้อมูลที่ผู้ใช้เคยบันทึกไว้ใต้คีย์ `passportBooks` ถูกย้ายให้อัตโนมัติโดย documentStore
 */

import {
  emptyPassportFields, manualFieldOrigin,
  type FieldOrigin, type PassportBook, type PassportBookHistoryEntry,
  type PassportEntryMethod, type PassportFieldKey, type PassportFieldValues,
  type PassportLifecycle, type PassportOcrFields, type PassportRecordExtra,
  type MrzCheckSummary,
} from '@/data/leaders/passportBookTypes';
import { documentNumberFieldKey } from '@/data/leaders/documentFieldKeys';
import type { AnyLeaderDocumentRecord, DocumentOcrFields } from '@/data/leaders/documentRecordTypes';
import {
  createDocument,
  deleteDocument,
  findDocumentsByFieldValue,
  getDocument,
  getDocuments,
  getPrimaryDocument,
  replaceDocumentSource,
  saveDocumentEdit,
  setDocumentLifecycle,
  setPrimaryDocument,
  updateDocumentFields,
} from './documentStore';

const KIND = 'passport' as const;
const PASSPORT_NO_KEY = documentNumberFieldKey(KIND);

/* ------------------------ แปลงระหว่างสองรูปข้อมูล ------------------------ */

/** เอกสารกลาง → เล่มหนังสือเดินทาง (รูปที่ UI ใช้) */
function toBook(rec: AnyLeaderDocumentRecord): PassportBook {
  const extra = rec.extra as PassportRecordExtra | null;
  return {
    bookId: rec.docId,
    tourLeaderId: rec.tourLeaderId,
    isPrimary: rec.isPrimary,
    status: rec.status,
    lifecycle: rec.lifecycle,
    entryMethod: rec.entryMethod,
    // documentStore เติมช่องที่ขาดให้แล้ว — merge อีกชั้นกันข้อมูลเก่าที่ยังไม่ผ่าน normalize
    fields: { ...emptyPassportFields(), ...rec.fields } as PassportFieldValues,
    fieldOrigin: rec.fieldOrigin as Record<PassportFieldKey, FieldOrigin>,
    ocrOriginal: rec.ocrOriginal as PassportOcrFields | null,
    ocrRawText: rec.ocrRawText,
    imageId: rec.imageId,
    portraitImageId: rec.portraitImageId,
    signatureImageId: rec.signatureImageId,
    sourceFileName: rec.sourceFileName,
    mrzCheck: extra?.mrzCheck ?? null,
    note: rec.note,
    createdBy: rec.createdBy,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    verifiedBy: rec.verifiedBy,
    verifiedAt: rec.verifiedAt,
    history: rec.history as PassportBookHistoryEntry[],
  };
}

const toBookOrNull = (rec: AnyLeaderDocumentRecord | null): PassportBook | null => (rec ? toBook(rec) : null);

/* ----------------------------------- อ่าน ----------------------------------- */

/** เล่มทั้งหมดของหัวหน้าทัวร์ — เล่มหลักขึ้นก่อน แล้วเรียงตามวันหมดอายุล่าสุด */
export function getPassportBooks(tourLeaderId: string): PassportBook[] {
  return getDocuments(tourLeaderId, KIND).map(toBook);
}

export function getPassportBook(bookId: string): PassportBook | null {
  const rec = getDocument(bookId);
  return rec && rec.kind === KIND ? toBook(rec) : null;
}

/** เล่มหลักปัจจุบัน (null = ยังไม่มี) */
export function getPrimaryBook(tourLeaderId: string): PassportBook | null {
  return toBookOrNull(getPrimaryDocument(tourLeaderId, KIND));
}

/** ค้นหาเล่มที่ใช้เลขหนังสือเดินทางนี้อยู่แล้ว (§6 ตรวจซ้ำทั้งระบบ) */
export function findBooksByPassportNo(passportNo: string, excludeBookId?: string): PassportBook[] {
  return findDocumentsByFieldValue(KIND, PASSPORT_NO_KEY, passportNo, excludeBookId).map(toBook);
}

/* ---------------------------------- สร้างเล่ม --------------------------------- */

export interface CreateBookInput {
  tourLeaderId: string;
  fields: PassportFieldValues;
  fieldOrigin: Record<PassportFieldKey, FieldOrigin>;
  entryMethod: PassportEntryMethod;
  status: PassportBook['status'];
  ocrOriginal: PassportOcrFields | null;
  ocrRawText?: string | null;
  mrzCheck: MrzCheckSummary | null;
  imageId: string | null;
  portraitImageId?: string | null;
  signatureImageId?: string | null;
  sourceFileName: string | null;
  makePrimary: boolean;
  by: string;
  at: string;
}

/**
 * สร้างเล่มใหม่ (§4 บันทึกฉบับร่าง / ยืนยันและบันทึก)
 * เล่มแรกของหัวหน้าทัวร์ → เป็นเล่มหลักอัตโนมัติ (§7)
 */
export function createPassportBook(input: CreateBookInput): PassportBook {
  const rec = createDocument<PassportRecordExtra>({
    tourLeaderId: input.tourLeaderId,
    kind: KIND,
    fields: input.fields,
    fieldOrigin: input.fieldOrigin,
    entryMethod: input.entryMethod,
    status: input.status,
    ocrOriginal: input.ocrOriginal as DocumentOcrFields | null,
    ocrRawText: input.ocrRawText,
    extra: { mrzCheck: input.mrzCheck },
    imageId: input.imageId,
    portraitImageId: input.portraitImageId,
    signatureImageId: input.signatureImageId,
    sourceFileName: input.sourceFileName,
    makePrimary: input.makePrimary,
    by: input.by,
    at: input.at,
  });
  return toBook(rec as AnyLeaderDocumentRecord);
}

/* --------------------------------- แก้ไข/สถานะ -------------------------------- */

/** ตั้งเล่มเป็นเล่มหลัก — ลดเล่มเดิมเป็นเล่มรองอัตโนมัติ (§7) */
export function setPrimaryBook(bookId: string, by: string, at: string): PassportBook | null {
  return toBookOrNull(setPrimaryDocument(bookId, by, at));
}

/** แก้ไขค่าในเล่มที่บันทึกแล้ว — บันทึกช่องที่เปลี่ยนลงประวัติ (§10) */
export function updatePassportBook(
  bookId: string,
  changes: Partial<PassportFieldValues>,
  opts: { by: string; at: string; status?: PassportBook['status'] },
): PassportBook | null {
  return toBookOrNull(updateDocumentFields(bookId, changes as Record<string, string>, opts));
}

/**
 * เปลี่ยนสถานะการใช้งานของเล่ม (§6 ปิดใช้งาน / ยกเลิก / แจ้งสูญหาย)
 * เล่มที่ใช้ไม่ได้แล้วจะถูกปลดจากการเป็นเล่มหลักโดยอัตโนมัติ
 */
export function setBookLifecycle(
  bookId: string, lifecycle: PassportLifecycle, opts: { by: string; at: string; note?: string },
): PassportBook | null {
  return toBookOrNull(setDocumentLifecycle(bookId, lifecycle, opts));
}

/** แทนที่รูป/ผล OCR ของเล่มเดิม (§6 อัปโหลดรูปใหม่ / อ่านข้อมูลด้วย OCR ใหม่) */
export function replaceBookSource(
  bookId: string,
  next: { imageId: string | null; sourceFileName: string | null; ocrOriginal: PassportOcrFields | null; mrzCheck: MrzCheckSummary | null },
  opts: { by: string; at: string; reOcr: boolean },
): PassportBook | null {
  const current = getDocument(bookId);
  if (!current) return null;

  const currentExtra = current.extra as PassportRecordExtra | null;
  return toBookOrNull(replaceDocumentSource<PassportRecordExtra>(
    bookId,
    {
      imageId: next.imageId,
      sourceFileName: next.sourceFileName,
      ocrOriginal: next.ocrOriginal as DocumentOcrFields | null,
      // ผล MRZ รอบใหม่ทับของเดิมได้ (ต่างจาก ocrOriginal ที่ห้ามทับ) — ไม่มีค่าใหม่จึงคงของเดิม
      extra: { mrzCheck: next.mrzCheck ?? currentExtra?.mrzCheck ?? null },
    },
    opts,
  ));
}

/**
 * บันทึกการแก้ไขเล่ม (§6/§8/§10) — แก้เฉพาะเล่มนี้เท่านั้น ไม่แตะเล่มอื่น (ยกเว้นการสลับเล่มหลัก)
 *   • บันทึกฟิลด์ที่เปลี่ยน + หมายเหตุ
 *   • เก็บประวัติแบบ before/after รายฟิลด์ (§10)
 *   • ตั้งเป็นเล่มหลัก → ลดเล่มหลักเดิมเป็นเล่มรองอัตโนมัติ (§8 · ห้ามมีเล่มหลัก > 1)
 */
export function savePassportEdit(
  bookId: string,
  input: { fields: PassportFieldValues; note: string; makePrimary: boolean },
  opts: { by: string; at: string },
): PassportBook | null {
  return toBookOrNull(saveDocumentEdit(bookId, input, opts));
}

/**
 * ย้ายเล่มจากไฟล์นำเข้าต้นทางเข้ามาเป็นเล่มในระบบ เพื่อให้แก้ไขได้
 *
 * ข้อมูลนำเข้าเป็นแบบอ่านอย่างเดียว — พอผู้ใช้กดแก้ไข จึงต้องคัดลอกมาเก็บเป็นเล่มของระบบก่อน
 * แล้วแก้ที่เล่มนี้แทน (เล่มนำเข้าจะถูกซ่อนเองเพราะเลขหนังสือเดินทางซ้ำกัน)
 */
export function adoptMasterBook(
  input: { tourLeaderId: string; fields: PassportFieldValues; by: string; at: string },
): PassportBook {
  return createPassportBook({
    tourLeaderId: input.tourLeaderId,
    fields: input.fields,
    fieldOrigin: manualFieldOrigin(),
    entryMethod: 'MANUAL',
    status: 'CONFIRMED',
    ocrOriginal: null,
    mrzCheck: null,
    imageId: null,
    sourceFileName: null,
    makePrimary: false,
    by: input.by,
    at: input.at,
  });
}

/* ------------------------------------ ลบ ------------------------------------ */

/**
 * ตรวจว่าเล่มถูกอ้างอิงในงานทัวร์/เอกสาร/วีซ่า/ตั๋วหรือไม่ (§2 เงื่อนไขการลบ)
 * Demo นี้ยังไม่มีการอ้างอิง Passport จากงานทัวร์ → คืน false เสมอ
 * เมื่อระบบเชื่อมข้อมูลจริง ให้ตรวจการอ้างอิงที่นี่จุดเดียว
 */
export function isPassportReferenced(_bookId: string): boolean {
  void _bookId;
  return false;
}

/** ลบเล่ม (เฉพาะกรณีผู้ใช้สั่ง) — ถ้าลบเล่มหลักและยังมีเล่มอื่น จะไม่ตั้งเล่มใหม่ให้อัตโนมัติ */
export function deletePassportBook(bookId: string): void {
  deleteDocument(bookId);
}

/** ฟอร์มเปล่าสำหรับกรอกเอง (§1 ตัวเลือกที่ 2 / §8) */
export function blankBookDraft(): { fields: PassportFieldValues; fieldOrigin: Record<PassportFieldKey, FieldOrigin> } {
  return { fields: emptyPassportFields(), fieldOrigin: manualFieldOrigin() };
}
