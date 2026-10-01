/**
 * Document View — ฉาย LeaderDocumentRecord (โครงร่างกลาง) ให้เป็น LeaderDocument (รูปแบน)
 *
 * ทำไมต้องมี: หน้าจอเดิมหลายที่ (การ์ดเอกสารในโปรไฟล์ · ภาพรวม · Dashboard · การตรวจสอบ)
 * อ่านจาก `leader.documents` ซึ่งเป็นรูปแบนมาตั้งแต่แรก การย้ายทุกหน้าจอพร้อมกันเสี่ยงเกินไป
 * จึงให้รูปแบน "กลายเป็นภาพฉาย" ของเอกสารจริง แทนที่จะเป็นแหล่งข้อมูลคู่ขนานอีกชุด
 *
 * ⚠️ นี่คือการฉายแบบ "สูญข้อมูล" โดยตั้งใจ — รูปแบนเก็บได้น้อยกว่าของจริงมาก
 * สิ่งที่หายไปและอยู่ครบเฉพาะใน record: ค่าที่ OCR อ่านครั้งแรก · สถานะรายช่อง ·
 * ประวัติการแก้ไข · รูปต้นฉบับ · ผลตรวจ MRZ · ช่องเฉพาะชนิด (เช่น จำนวนครั้งที่เข้าได้ของวีซ่า)
 * ห้ามเขียนกลับผ่านรูปแบน — การแก้ไขต้องทำผ่าน documentStore เท่านั้น
 */

import {
  documentExpiryFieldKey,
  documentIssueFieldKey,
  documentNumberFieldKey,
} from '@/data/leaders/documentFieldKeys';
import type { DocKind } from '@/data/leaders/documentSchemas';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';
import { DOCUMENT_LIFECYCLE_LABEL } from '@/data/leaders/documentRecordTypes';
import { maskDocumentNumber } from '@/modules/tour-leaders/utils';
import type { DocumentKind, DocumentVerifyStatus, LeaderDocument } from '@/types';

/* --------------------------- จับคู่ชนิดเอกสารสองระบบ --------------------------- */

/**
 * ชนิดเอกสารของ record → ชนิดในรูปแบน
 * รูปแบนมีชนิดหยาบกว่า: บัตรหัวหน้าทัวร์ถือเป็น "ใบอนุญาต"
 * และเอกสารประวัติอาชญากรรมไม่มีชนิดตรงตัว จึงลงเป็น "อื่น ๆ"
 */
export const DOC_KIND_TO_LEGACY: Record<DocKind, DocumentKind> = {
  id_card: 'national_id',
  passport: 'passport',
  visa: 'visa',
  tour_card: 'license',
  criminal_record: 'other',
  certificate: 'certificate',
  other: 'other',
};

/** ชื่อเอกสารที่แสดงในรูปแบน (รูปแบนมีช่อง name แต่ record ไม่มี — สร้างจากชนิด) */
export const DOC_KIND_DISPLAY_NAME: Record<DocKind, string> = {
  id_card: 'บัตรประชาชน',
  passport: 'หนังสือเดินทาง',
  visa: 'วีซ่า',
  tour_card: 'บัตรหัวหน้าทัวร์',
  criminal_record: 'เอกสารประวัติอาชญากรรม',
  certificate: 'เอกสารรับรอง / ใบเซอร์',
  other: 'เอกสารอื่น ๆ',
};

/* --------------------------------- การฉายภาพ --------------------------------- */

/** สถานะการบันทึก → สถานะการตรวจสอบในรูปแบน (รูปแบนไม่มีแนวคิด "ฉบับร่าง") */
function toVerifyStatus(record: AnyLeaderDocumentRecord): DocumentVerifyStatus {
  return record.status === 'CONFIRMED' ? 'verified' : 'pending';
}

/**
 * หมายเหตุของรูปแบน — พ่วงสถานะการใช้งานไว้ด้วยเมื่อเอกสารใช้ไม่ได้แล้ว
 * เพราะรูปแบนไม่มีช่อง lifecycle ถ้าไม่พ่วงไว้ หน้าจอเก่าจะเห็นเล่มที่สูญหายเป็นเล่มปกติ
 */
function toNote(record: AnyLeaderDocumentRecord): string | undefined {
  const own = record.note?.trim() ?? '';
  if (record.lifecycle === 'ACTIVE') return own || undefined;
  const state = DOCUMENT_LIFECYCLE_LABEL[record.lifecycle];
  return own ? `${state} — ${own}` : state;
}

/** ประเทศผู้ออก — ใช้เฉพาะช่องที่เก็บเป็น id ของ Country Master จริง ๆ */
function toIssuingCountryId(record: AnyLeaderDocumentRecord): string | undefined {
  const id = record.fields.issuingCountryId?.trim() || record.fields.countryId?.trim();
  return id || undefined;
}

/**
 * ชื่อที่แสดง
 *   • กลุ่มเอกสารแนบไฟล์ — ผู้ใช้เป็นคนระบุเองว่าเอกสารนี้คืออะไร จึงใช้ชื่อนั้นก่อน
 *   • วีซ่า — เติมประเภทวีซ่าต่อท้ายให้แยกออกจากกันได้เมื่อมีหลายใบ
 */
function toDisplayName(record: AnyLeaderDocumentRecord): string {
  const base = DOC_KIND_DISPLAY_NAME[record.kind];

  const title = record.fields.docTitle?.trim();
  if (title) return record.kind === 'other' ? title : `${base} — ${title}`;

  if (record.kind !== 'visa') return base;
  const visaType = record.fields.visaType?.trim();
  return visaType ? `${base} (${visaType})` : base;
}

/** ฉายเอกสาร 1 ฉบับให้เป็นรูปแบนที่หน้าจอเดิมอ่านได้ */
export function toLeaderDocument(record: AnyLeaderDocumentRecord): LeaderDocument {
  const kind = DOC_KIND_TO_LEGACY[record.kind];
  const rawNumber = record.fields[documentNumberFieldKey(record.kind)] ?? '';
  const expiry = record.fields[documentExpiryFieldKey()]?.trim() ?? '';

  return {
    id: record.docId,
    kind,
    name: toDisplayName(record),
    // ปิดบังด้วยกติกาเดียวกับรูปแบนเดิม — หน้าจอเก่าคาดหวังเลขที่ปิดบังแล้ว
    number: maskDocumentNumber(kind, rawNumber),
    issuingCountryId: toIssuingCountryId(record),
    issuedAt: record.fields[documentIssueFieldKey(record.kind)]?.trim() ?? '',
    expiresAt: expiry || null,
    fileName: record.sourceFileName ?? '',
    verifyStatus: toVerifyStatus(record),
    note: toNote(record),
  };
}

/* --------------------- ข้อมูลนำเข้าต้นทาง → เอกสารในระบบ --------------------- */

/**
 * หนังสือเดินทางที่มาจากไฟล์นำเข้าต้นทาง (Tour Leader Master) — แปลงเป็นเอกสารเสมือน
 *
 * ทำไมต้องมี: หัวหน้าทัวร์ส่วนใหญ่มีข้อมูลหนังสือเดินทางจากไฟล์นำเข้าอยู่แล้ว
 * แต่ยังไม่มีเล่มใน documentStore ถ้าไม่แปลงมา การตรวจความพร้อมจะรายงานว่า
 * "ไม่มีหนังสือเดินทาง" ทั้งที่มีข้อมูลอยู่ — เป็นการเตือนผิดที่ทำให้คนเลิกเชื่อระบบ
 *
 * เก็บเฉพาะวันหมดอายุ ซึ่งเป็นข้อมูลเดียวที่เปิดเผยได้โดยไม่ต้องมีสิทธิ์ดูเลขเอกสาร
 * รหัสขึ้นต้นด้วย MASTER- เพื่อให้แยกออกว่าไม่ใช่เล่มที่แก้ไขได้ในระบบ
 */
export function masterPassportToRecord(
  tourLeaderId: string,
  passportExpiryDate: string | null,
): AnyLeaderDocumentRecord | null {
  if (!passportExpiryDate) return null;

  return {
    docId: `MASTER-PP-${tourLeaderId}`,
    tourLeaderId,
    kind: 'passport',
    isPrimary: false,
    status: 'CONFIRMED',
    lifecycle: 'ACTIVE',
    entryMethod: 'MANUAL',
    fields: { passportNo: '', issueDate: '', expiryDate: passportExpiryDate },
    fieldOrigin: {},
    ocrOriginal: null,
    ocrRawText: null,
    imageId: null,
    portraitImageId: null,
    signatureImageId: null,
    sourceFileName: null,
    extra: null,
    note: 'นำเข้าจากไฟล์ต้นทาง',
    createdBy: 'ระบบนำเข้า',
    createdAt: '',
    updatedAt: '',
    verifiedBy: null,
    verifiedAt: null,
    history: [],
  };
}

/** รหัสเอกสารนี้มาจากไฟล์นำเข้าต้นทางหรือไม่ (แก้ไขในระบบไม่ได้) */
export function isMasterDocumentId(docId: string): boolean {
  return docId.startsWith('MASTER-');
}

/* ------------------------------- รวมสองแหล่ง ------------------------------- */

/**
 * ตัวเทียบว่าเป็นเอกสารใบเดียวกันหรือไม่ — เทียบชนิด + เลขท้าย 4 ตัว
 * ใช้เลขท้าย 4 ตัวเพราะฝั่งหนึ่งอาจเป็นเลขที่ถูกปิดบังแล้ว (xxxx1234)
 * ส่วนอีกฝั่งเป็นเลขเต็ม — ท้าย 4 ตัวเป็นส่วนที่เหลือรอดทั้งสองแบบ
 */
function identityKey(kind: DocumentKind, number: string): string | null {
  const clean = number.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (clean.length < 4) return null;
  return `${kind}:${clean.slice(-4)}`;
}

/**
 * รายการเอกสารรูปแบนที่หน้าจอเดิมควรเห็น = เอกสารจริงจาก store + ของเดิมที่ยังไม่ถูกแทน
 *
 * ลำดับ: เอกสารจาก store ขึ้นก่อน (เป็นแหล่งข้อมูลจริง) แล้วตามด้วยรายการเดิมตามลำดับเดิม
 * รายการเดิมที่ "เป็นใบเดียวกัน" กับเอกสารใน store จะถูกตัดออก เพื่อไม่ให้นับซ้ำสองครั้ง
 */
export function mergeLeaderDocuments(
  legacy: readonly LeaderDocument[],
  records: readonly AnyLeaderDocumentRecord[],
): LeaderDocument[] {
  const projected = records.map(toLeaderDocument);

  const taken = new Set<string>();
  for (const doc of projected) {
    const key = identityKey(doc.kind, doc.number);
    if (key) taken.add(key);
  }

  const kept = legacy.filter((doc) => {
    const key = identityKey(doc.kind, doc.number);
    return key === null || !taken.has(key);
  });

  return [...projected, ...kept];
}
