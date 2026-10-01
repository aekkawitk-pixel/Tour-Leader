/**
 * Document Store — ที่เก็บ "เอกสารประจำตัว" ของหัวหน้าทัวร์ทุกชนิดรวมกัน
 *
 * เดิมมีเฉพาะหนังสือเดินทาง (passportBookStore) ที่ทำกติกาเหล่านี้ไว้ครบ
 * ตอนนี้ยกกติกาชุดเดียวกันขึ้นมาเป็นของกลาง ใช้ได้กับ Visa · บัตรหัวหน้าทัวร์ ·
 * บัตรประชาชน · เอกสารประวัติอาชญากรรม โดยไม่ต้องเขียนตรรกะซ้ำต่อชนิด
 *
 * กติกาฉบับหลัก: มีได้ไม่เกิน 1 ฉบับต่อ (หัวหน้าทัวร์ × ชนิดเอกสาร)
 *   • ฉบับแรกของชนิดนั้นเป็นฉบับหลักอัตโนมัติ
 *   • ตั้งฉบับใหม่เป็นหลัก → ฉบับเดิมถูกลดเป็นฉบับรองอัตโนมัติ
 *   • ฉบับที่ใช้ไม่ได้แล้ว (สูญหาย/ยกเลิก/ปิดใช้งาน) ถูกปลดจากฉบับหลักให้เอง
 *
 * เก็บเฉพาะ "ข้อมูลเอกสาร" ใน localStorage · รูปอยู่ใน documentImageStore (IndexedDB)
 * อ้างด้วย imageId — เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import {
  documentExpiryFieldKey,
  documentFieldKeys,
} from '@/data/leaders/documentFieldKeys';
import {
  DOC_ID_PREFIX, UNIQUE_ACTIVE_BY_FIELD, UNIQUE_ACTIVE_KINDS,
  type DocData, type DocKind,
} from '@/data/leaders/documentSchemas';
import {
  DOCUMENT_LIFECYCLE_LABEL,
  emptyFieldsFor,
  manualFieldOriginFor,
  type AnyLeaderDocumentRecord,
  type DocumentEntryMethod,
  type DocumentHistoryEntry,
  type DocumentLifecycle,
  type DocumentOcrFields,
  type DocumentStatus,
  type FieldOrigin,
  type LeaderDocumentRecord,
} from '@/data/leaders/documentRecordTypes';
import { readJson, writeJson } from './browserStorage';

const KEY = 'leaderDocuments';

/** คีย์เดิมของหนังสือเดินทาง — ใช้ย้ายข้อมูลของผู้ใช้ที่บันทึกไว้ก่อนรวมที่เก็บ */
const LEGACY_PASSPORT_KEY = 'passportBooks';
/** ทำเครื่องหมายว่าย้ายข้อมูลแล้ว เพื่อไม่ย้ายซ้ำ (ข้อมูลเดิมยังอยู่ ไม่ถูกลบ) */
const MIGRATED_KEY = 'leaderDocuments.migrated.passportBooks';

/**
 * คำเรียกหน่วยของเอกสารแต่ละชนิด — ใช้ในข้อความประวัติให้อ่านเป็นธรรมชาติ
 * (หนังสือเดินทางเรียก "เล่ม" · บัตรเรียก "ใบ" — คงถ้อยคำเดิมของโมดูลหนังสือเดินทางไว้)
 */
const KIND_NOUN: Record<DocKind, string> = {
  passport: 'เล่ม',
  visa: 'ฉบับ',
  tour_card: 'ใบ',
  id_card: 'ใบ',
  criminal_record: 'ฉบับ',
  certificate: 'ฉบับ',
  other: 'ฉบับ',
};

/** ชื่อเรียกเอกสารในข้อความแจ้งเตือน — ชั้น service จึงไม่ต้องพึ่งชั้นแสดงผล */
const KIND_NAME: Record<DocKind, string> = {
  passport: 'หนังสือเดินทาง',
  visa: 'วีซ่า',
  tour_card: 'บัตรหัวหน้าทัวร์',
  id_card: 'บัตรประชาชน',
  criminal_record: 'เอกสารประวัติอาชญากรรม',
  certificate: 'ใบรับรอง',
  other: 'เอกสาร',
};

/**
 * คำนำหน้ารหัสเอกสาร — หนังสือเดินทางคงรูปแบบ PPBOOK- ไว้เหมือนเดิม
 * เพราะรหัสที่ผู้ใช้บันทึกไว้ก่อนหน้านี้ใช้รูปแบบนี้ (อ้างอิงในประวัติ/ลิงก์เดิมได้ต่อ)
 */
const ID_PREFIX: Record<DocKind, string> = {
  ...DOC_ID_PREFIX,
  passport: 'PPBOOK',
};

/* --------------------------------- อ่าน/เขียน -------------------------------- */

/** เติมค่า default ให้เอกสารที่บันทึกไว้ก่อนมีฟิลด์เหล่านี้ + เติมช่องใหม่ในชุด fields */
function normalize(row: AnyLeaderDocumentRecord): AnyLeaderDocumentRecord {
  const keys = documentFieldKeys(row.kind);
  return {
    ...row,
    lifecycle: row.lifecycle ?? 'ACTIVE',
    note: row.note ?? '',
    ocrRawText: row.ocrRawText ?? null,
    portraitImageId: row.portraitImageId ?? null,
    signatureImageId: row.signatureImageId ?? null,
    extra: row.extra ?? null,
    fields: { ...emptyFieldsFor(keys), ...row.fields },
    fieldOrigin: { ...row.fieldOrigin },
    history: row.history ?? [],
  };
}

function loadAll(): AnyLeaderDocumentRecord[] {
  migrateLegacyPassportBooks();
  const parsed = readJson<AnyLeaderDocumentRecord[]>(KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalize);
}

/** เขียนไม่สำเร็จ → โยน StorageWriteError (UI ต้องไม่ขึ้นว่าบันทึกสำเร็จ) */
function saveAll(rows: AnyLeaderDocumentRecord[]): void {
  writeJson(KEY, rows);
}

function newDocId(kind: DocKind): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${ID_PREFIX[kind]}-${rand}`;
}

/* -------------------------- ย้ายข้อมูลหนังสือเดินทางเดิม ------------------------- */

/** รูปเดิมของเล่มหนังสือเดินทางใน localStorage (ก่อนรวมที่เก็บ) */
interface LegacyPassportBook {
  bookId: string;
  tourLeaderId: string;
  mrzCheck?: unknown;
  [key: string]: unknown;
}

/**
 * ย้ายเล่มหนังสือเดินทางจากคีย์เดิมมาเก็บรวม — ทำครั้งเดียว และไม่ลบข้อมูลเดิมทิ้ง
 * ถ้าเขียนไม่สำเร็จจะเงียบไว้ (ไม่ทำให้หน้าเว็บพัง) แล้วลองใหม่รอบหน้า
 */
function migrateLegacyPassportBooks(): void {
  if (readJson<string | null>(MIGRATED_KEY, null) === 'done') return;

  const legacy = readJson<LegacyPassportBook[]>(LEGACY_PASSPORT_KEY, []);
  if (!Array.isArray(legacy) || legacy.length === 0) {
    try { writeJson(MIGRATED_KEY, 'done'); } catch { /* ลองใหม่รอบหน้า */ }
    return;
  }

  const existing = readJson<AnyLeaderDocumentRecord[]>(KEY, []);
  const known = new Set(Array.isArray(existing) ? existing.map((r) => r.docId) : []);

  const converted: AnyLeaderDocumentRecord[] = legacy
    .filter((b) => b && typeof b.bookId === 'string' && !known.has(b.bookId))
    .map((b) => {
      const { bookId, mrzCheck, ...rest } = b;
      return normalize({
        ...(rest as unknown as AnyLeaderDocumentRecord),
        docId: bookId,
        kind: 'passport',
        extra: { mrzCheck: mrzCheck ?? null },
      });
    });

  try {
    saveAll([...(Array.isArray(existing) ? existing : []), ...converted]);
    writeJson(MIGRATED_KEY, 'done');
  } catch {
    /* เขียนไม่สำเร็จ (เช่นโควตาเต็ม) — ไม่ทำเครื่องหมายว่าเสร็จ จะลองใหม่รอบหน้า */
  }
}

/* --------------------- กติกาห้ามถือเอกสารซ้ำซ้อน (§บัตร) --------------------- */

/** ถูกปฏิเสธเพราะผิดกติกาของเอกสาร — ไม่ใช่ความผิดพลาดของระบบ ข้อความแสดงต่อผู้ใช้ได้ */
export class DocumentRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentRuleError';
  }
}

/** เอกสารใบนี้ยัง "ถืออยู่" หรือไม่ ณ วันที่กำหนด — ยกเลิก/ปิดใช้งาน/หมดอายุแล้ว = ไม่ถือ */
function stillHeld(doc: AnyLeaderDocumentRecord, isoDate: string): boolean {
  if (doc.lifecycle !== 'ACTIVE') return false;
  const expiry = doc.fields[documentExpiryFieldKey()]?.trim();
  return !expiry || expiry >= isoDate;
}

/**
 * หาเอกสารที่ทำให้เพิ่ม/แก้ใบนี้ไม่ได้ (ถือใบประเภทเดิมอยู่แล้ว)
 * คืน null = ไม่ติดกติกา
 */
function findHeldConflict(
  rows: readonly AnyLeaderDocumentRecord[],
  target: { tourLeaderId: string; kind: DocKind; fields: DocData; at: string; excludeDocId?: string },
): AnyLeaderDocumentRecord | null {
  const today = target.at.slice(0, 10);
  const mine = (d: AnyLeaderDocumentRecord) =>
    d.tourLeaderId === target.tourLeaderId && d.kind === target.kind && d.docId !== target.excludeDocId;

  // ถือได้ครั้งละ 1 ใบ (บัตรประชาชน) — ไม่ต้องดูค่าช่องไหนเลย
  if (UNIQUE_ACTIVE_KINDS.includes(target.kind)) {
    return rows.find((d) => mine(d) && stillHeld(d, today)) ?? null;
  }

  const fieldKey = UNIQUE_ACTIVE_BY_FIELD[target.kind];
  if (!fieldKey) return null;

  const value = (target.fields[fieldKey] ?? '').trim();
  if (!value) return null; // ยังไม่ระบุค่า → ยังตัดสินไม่ได้ว่าซ้ำกับใบไหน

  return rows.find(
    (d) => mine(d) && (d.fields[fieldKey] ?? '').trim() === value && stillHeld(d, today),
  ) ?? null;
}

/** ข้อความอธิบายว่าติดใบไหน และต้องทำอะไรก่อน */
function heldConflictMessage(conflict: AnyLeaderDocumentRecord, kind: DocKind): string {
  const expiry = conflict.fields[documentExpiryFieldKey()]?.trim();
  const noun = KIND_NOUN[kind];
  const until = expiry ? ` (หมดอายุ ${expiry})` : ' (ไม่ระบุวันหมดอายุ)';
  // ถือได้ครั้งละ 1 ฉบับ — ไม่ต้องอ้างค่าช่องไหน
  if (UNIQUE_ACTIVE_KINDS.includes(kind)) {
    return `ยังถือ${KIND_NAME[kind]}ที่ใช้งานได้อยู่ 1 ${noun}${until}`
      + ` — มีได้ครั้งละ 1 ${noun} ถ้าทำ${noun}ใหม่ให้แจ้งสูญหาย/ยกเลิก/ปิดใช้งาน${noun}เดิมก่อน`;
  }

  const fieldKey = UNIQUE_ACTIVE_BY_FIELD[kind]!;
  const value = (conflict.fields[fieldKey] ?? '').trim();

  return `ยังถือ“${value}”อยู่ 1 ${noun}${until}`
    + ` — เพิ่ม${noun}ประเภทเดียวกันไม่ได้จนกว่า${noun}เดิมจะหมดอายุ หรือถูกยกเลิก/ปิดใช้งาน`;
}

/* ----------------------------------- อ่าน ----------------------------------- */

/** เอกสารทั้งหมดของหัวหน้าทัวร์ — ฉบับหลักขึ้นก่อน แล้วเรียงตามวันหมดอายุล่าสุด */
/**
 * เหตุผลที่เพิ่มเอกสารชนิดนี้ไม่ได้ตอนนี้ (null = เพิ่มได้)
 *
 * ใช้ปิดปุ่ม "เพิ่ม…" พร้อมบอกเหตุผลไว้ก่อน ผู้ใช้จะได้ไม่กรอกเสร็จแล้วเจอ error
 * กติกาเดียวกับที่ createDocument บังคับไว้ — ที่นี่แค่ถามล่วงหน้า ไม่ได้ผ่อนกฎ
 */
export function addDocumentBlockedReason(
  tourLeaderId: string,
  kind: DocKind,
  todayISO: string,
): string | null {
  const held = findHeldConflict(loadAll(), { tourLeaderId, kind, fields: {}, at: todayISO });
  return held ? heldConflictMessage(held, kind) : null;
}

export function getDocuments(tourLeaderId: string, kind?: DocKind): AnyLeaderDocumentRecord[] {
  const expiryKey = documentExpiryFieldKey();
  return loadAll()
    .filter((d) => d.tourLeaderId === tourLeaderId && (kind === undefined || d.kind === kind))
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return (b.fields[expiryKey] || '').localeCompare(a.fields[expiryKey] || '');
    });
}

export function getDocument(docId: string): AnyLeaderDocumentRecord | null {
  return loadAll().find((d) => d.docId === docId) ?? null;
}

/**
 * เอกสารของทุกคนในครั้งเดียว — ใช้กับหน้าจอที่ต้องดูหลายคนพร้อมกัน
 * (เช่น ตรวจความพร้อมเอกสารของผู้สมัครทั้งรายการตอนจัดหัวหน้าทัวร์)
 * เรียกครั้งเดียวแล้วจัดกลุ่มเอง ดีกว่าเรียก getDocuments ทีละคนในลูป
 */
export function getAllDocuments(): AnyLeaderDocumentRecord[] {
  return loadAll();
}

/** จัดกลุ่มเอกสารตามหัวหน้าทัวร์ — พร้อมใช้กับรายการยาว ๆ */
export function getDocumentsByLeader(): Map<string, AnyLeaderDocumentRecord[]> {
  const map = new Map<string, AnyLeaderDocumentRecord[]>();
  for (const doc of loadAll()) {
    const list = map.get(doc.tourLeaderId);
    if (list) list.push(doc);
    else map.set(doc.tourLeaderId, [doc]);
  }
  return map;
}

/** ฉบับหลักปัจจุบันของชนิดนี้ (null = ยังไม่มี) */
export function getPrimaryDocument(tourLeaderId: string, kind: DocKind): AnyLeaderDocumentRecord | null {
  return loadAll().find((d) => d.tourLeaderId === tourLeaderId && d.kind === kind && d.isPrimary) ?? null;
}

/**
 * ค้นเอกสารที่ใช้ค่าในช่องนี้อยู่แล้วทั้งระบบ (เช่น เลขหนังสือเดินทาง/เลขบัตรซ้ำ)
 * เทียบแบบไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย · ค่าว่างไม่ถือว่าซ้ำ
 */
export function findDocumentsByFieldValue(
  kind: DocKind,
  fieldKey: string,
  value: string,
  excludeDocId?: string,
): AnyLeaderDocumentRecord[] {
  const q = value.trim().toUpperCase();
  if (!q) return [];
  return loadAll().filter(
    (d) => d.kind === kind
      && d.docId !== excludeDocId
      && (d.fields[fieldKey] ?? '').trim().toUpperCase() === q,
  );
}

/* ---------------------------------- สร้างใหม่ --------------------------------- */

export interface CreateDocumentInput<TExtra = unknown> {
  tourLeaderId: string;
  kind: DocKind;
  fields: DocData;
  fieldOrigin: Record<string, FieldOrigin>;
  entryMethod: DocumentEntryMethod;
  status: DocumentStatus;
  ocrOriginal: DocumentOcrFields | null;
  ocrRawText?: string | null;
  extra?: TExtra | null;
  imageId: string | null;
  portraitImageId?: string | null;
  signatureImageId?: string | null;
  sourceFileName: string | null;
  fileByteSize?: number | null;
  fileUploadedBy?: string | null;
  fileUploadedAt?: string | null;
  makePrimary: boolean;
  by: string;
  at: string;
}

/**
 * สร้างเอกสารใหม่ (บันทึกฉบับร่าง / ยืนยันและบันทึก)
 * ฉบับแรกของชนิดนั้นสำหรับหัวหน้าทัวร์คนนี้ → เป็นฉบับหลักอัตโนมัติ
 */
/** ไฟล์แนบ 1 ไฟล์พร้อมเมตาที่ต้องเก็บคู่กับระเบียน (ชื่อไฟล์ · ขนาด · ผู้แนบ · เวลาที่แนบ) */
export interface DocumentFileMeta {
  imageId: string | null;
  sourceFileName: string | null;
  fileByteSize?: number | null;
  fileUploadedBy?: string | null;
  fileUploadedAt?: string | null;
}

export function createDocument<TExtra = unknown>(
  input: CreateDocumentInput<TExtra>,
): LeaderDocumentRecord<TExtra> {
  const rows = loadAll();

  // ถือใบประเภทเดียวกันอยู่แล้ว → ปฏิเสธตั้งแต่ชั้น store (UI จะข้ามกติกานี้ไม่ได้)
  const held = findHeldConflict(rows, input);
  if (held) throw new DocumentRuleError(heldConflictMessage(held, input.kind));

  const sameKind = rows.filter((d) => d.tourLeaderId === input.tourLeaderId && d.kind === input.kind);
  const isFirst = sameKind.length === 0;
  const noun = KIND_NOUN[input.kind];
  const shouldBePrimary = isFirst || input.makePrimary;

  const history: DocumentHistoryEntry[] = [{
    at: input.at,
    by: input.by,
    action: input.entryMethod === 'OCR' ? 'OCR_IMPORT' : 'MANUAL_ENTRY',
    note: input.sourceFileName ? `ไฟล์ต้นฉบับ: ${input.sourceFileName}` : undefined,
    // ผูก imageId ไว้ด้วย เพื่อให้เปิดดูไฟล์เวอร์ชันที่แนบตอนสร้างได้ แม้ถูกแทนที่ไปแล้ว
    imageId: input.imageId,
    fileName: input.sourceFileName,
  }];
  history.push({
    at: input.at,
    by: input.by,
    action: input.status === 'CONFIRMED' ? 'CONFIRM' : 'SAVE_DRAFT',
  });
  if (shouldBePrimary) {
    history.push({
      at: input.at,
      by: input.by,
      action: 'SET_PRIMARY',
      note: isFirst ? `${noun}แรกของหัวหน้าทัวร์ — ตั้งเป็น${noun}หลักอัตโนมัติ` : undefined,
    });
  }

  const doc: LeaderDocumentRecord<TExtra> = {
    docId: newDocId(input.kind),
    tourLeaderId: input.tourLeaderId,
    kind: input.kind,
    isPrimary: shouldBePrimary,
    status: input.status,
    lifecycle: 'ACTIVE',
    note: '',
    entryMethod: input.entryMethod,
    fields: { ...input.fields },
    fieldOrigin: { ...input.fieldOrigin },
    ocrOriginal: input.ocrOriginal,
    ocrRawText: input.ocrRawText ?? null,
    extra: input.extra ?? null,
    imageId: input.imageId,
    portraitImageId: input.portraitImageId ?? null,
    signatureImageId: input.signatureImageId ?? null,
    sourceFileName: input.sourceFileName,
    fileByteSize: input.fileByteSize ?? null,
    fileUploadedBy: input.fileUploadedBy ?? null,
    fileUploadedAt: input.fileUploadedAt ?? null,
    createdBy: input.by,
    createdAt: input.at,
    updatedAt: input.at,
    verifiedBy: input.status === 'CONFIRMED' ? input.by : null,
    verifiedAt: input.status === 'CONFIRMED' ? input.at : null,
    history,
  };

  // ห้ามมีฉบับหลักเกิน 1 ฉบับต่อชนิด — ลดฉบับเดิมเป็นฉบับรอง
  const next = rows.map((d) => {
    if (shouldBePrimary && d.tourLeaderId === input.tourLeaderId && d.kind === input.kind && d.isPrimary) {
      return {
        ...d,
        isPrimary: false,
        updatedAt: input.at,
        history: [...d.history, {
          at: input.at, by: input.by, action: 'UNSET_PRIMARY' as const, note: `ถูกแทนที่ด้วย${noun}ใหม่`,
        }],
      };
    }
    return d;
  });

  next.push(doc as AnyLeaderDocumentRecord);
  saveAll(next);
  return doc;
}

/* --------------------------------- ฉบับหลัก --------------------------------- */

/** ตั้งเอกสารเป็นฉบับหลัก — ลดฉบับเดิมของชนิดเดียวกันเป็นฉบับรองอัตโนมัติ */
export function setPrimaryDocument(docId: string, by: string, at: string): AnyLeaderDocumentRecord | null {
  const rows = loadAll();
  const target = rows.find((d) => d.docId === docId);
  if (!target) return null;
  const noun = KIND_NOUN[target.kind];

  const next = rows.map((d) => {
    if (d.tourLeaderId !== target.tourLeaderId || d.kind !== target.kind) return d;
    if (d.docId === docId) {
      return { ...d, isPrimary: true, updatedAt: at, history: [...d.history, { at, by, action: 'SET_PRIMARY' as const }] };
    }
    if (d.isPrimary) {
      return {
        ...d,
        isPrimary: false,
        updatedAt: at,
        history: [...d.history, { at, by, action: 'UNSET_PRIMARY' as const, note: `ถูกแทนที่ด้วย${noun}อื่น` }],
      };
    }
    return d;
  });
  saveAll(next);
  return next.find((d) => d.docId === docId) ?? null;
}

/* ---------------------------------- แก้ไขค่า --------------------------------- */

/** แก้ไขค่าในเอกสารที่บันทึกแล้ว — บันทึกช่องที่เปลี่ยนลงประวัติ */
export function updateDocumentFields(
  docId: string,
  /** เฉพาะช่องที่ต้องการเปลี่ยน (ไม่ต้องส่งครบทุกช่อง) */
  changes: DocData,
  opts: { by: string; at: string; status?: DocumentStatus },
): AnyLeaderDocumentRecord | null {
  const rows = loadAll();
  const idx = rows.findIndex((d) => d.docId === docId);
  if (idx < 0) return null;

  const current = rows[idx];
  const changedFields = Object.keys(changes).filter((k) => changes[k] !== current.fields[k]);
  if (changedFields.length === 0 && !opts.status) return current;

  const fieldOrigin = { ...current.fieldOrigin };
  for (const k of changedFields) fieldOrigin[k] = 'USER_VERIFIED';

  const history = [...current.history];
  if (changedFields.length > 0) history.push({ at: opts.at, by: opts.by, action: 'USER_EDIT', changedFields });
  if (opts.status && opts.status !== current.status) {
    history.push({ at: opts.at, by: opts.by, action: opts.status === 'CONFIRMED' ? 'CONFIRM' : 'SAVE_DRAFT' });
  }

  const updated: AnyLeaderDocumentRecord = {
    ...current,
    fields: { ...current.fields, ...changes },
    fieldOrigin,
    status: opts.status ?? current.status,
    updatedAt: opts.at,
    verifiedBy: (opts.status ?? current.status) === 'CONFIRMED' ? opts.by : current.verifiedBy,
    verifiedAt: (opts.status ?? current.status) === 'CONFIRMED' ? opts.at : current.verifiedAt,
    history,
  };

  rows[idx] = updated;
  saveAll(rows);
  return updated;
}

/**
 * บันทึกการแก้ไขเอกสาร — แก้เฉพาะฉบับนี้เท่านั้น (ยกเว้นการสลับฉบับหลัก)
 *   • บันทึกฟิลด์ที่เปลี่ยน + หมายเหตุ
 *   • เก็บประวัติแบบ before→after รายฟิลด์
 *   • ตั้งเป็นฉบับหลัก → ลดฉบับหลักเดิมเป็นฉบับรองอัตโนมัติ
 */
export function saveDocumentEdit(
  docId: string,
  input: {
    fields: DocData;
    note: string;
    makePrimary: boolean;
    /**
     * ไฟล์แนบหลังแก้ไข — ไม่ส่ง (undefined) = ไม่แตะไฟล์เดิม · null = ถอดไฟล์ออก
     * ต้องรับที่นี่ด้วย ไม่งั้นชนิดที่ "ตัวไฟล์คือเอกสาร" จะเปลี่ยนไฟล์ไม่ได้เลย
     */
    file?: DocumentFileMeta | null;
  },
  opts: { by: string; at: string },
): AnyLeaderDocumentRecord | null {
  const rows = loadAll();
  const idx = rows.findIndex((d) => d.docId === docId);
  if (idx < 0) return null;

  const current = rows[idx];

  const held = findHeldConflict(rows, {
    tourLeaderId: current.tourLeaderId,
    kind: current.kind,
    fields: input.fields,
    at: opts.at,
    excludeDocId: current.docId,
  });
  if (held) throw new DocumentRuleError(heldConflictMessage(held, current.kind));

  const fileChanged = input.file !== undefined && (input.file?.imageId ?? null) !== current.imageId;
  const changedFields = Object.keys(input.fields).filter((k) => input.fields[k] !== current.fields[k]);
  const noteChanged = input.note !== current.note;
  const noun = KIND_NOUN[current.kind];

  const fieldOrigin = { ...current.fieldOrigin };
  for (const k of changedFields) fieldOrigin[k] = 'USER_VERIFIED';

  const history = [...current.history];
  if (changedFields.length > 0 || noteChanged) {
    history.push({
      at: opts.at,
      by: opts.by,
      action: 'USER_EDIT',
      changedFields: changedFields.length > 0 ? changedFields : undefined,
      // เก็บค่าก่อน→หลังไว้ตรวจย้อนหลัง (เฉพาะช่องที่เปลี่ยน)
      note: changedFields.length > 0
        ? changedFields.map((k) => `${k}: “${current.fields[k] || '—'}” → “${input.fields[k] || '—'}”`).join(' · ')
        : (noteChanged ? 'แก้ไขหมายเหตุ' : undefined),
    });
  }

  if (fileChanged) {
    const before = current.sourceFileName ?? '—';
    const after = input.file?.sourceFileName ?? null;
    history.push({
      at: opts.at,
      by: opts.by,
      action: 'REPLACE_IMAGE',
      note: after ? `${before} → ${after}` : `ถอดไฟล์แนบออก (เดิม: ${before})`,
      /*
        เก็บไฟล์ "เวอร์ชันก่อนถูกแทนที่" ไว้ที่รายการนี้ — เปิดย้อนดูได้ว่าตอนนั้นแนบอะไรไว้
        (ไฟล์เดิมจึงต้องไม่ถูกลบทิ้ง ดู DocumentFileField.retainReplaced)
      */
      imageId: current.imageId,
      fileName: current.sourceFileName,
    });
  }

  const willBePrimary = input.makePrimary || current.isPrimary;
  if (input.makePrimary && !current.isPrimary) {
    history.push({ at: opts.at, by: opts.by, action: 'SET_PRIMARY' });
  }

  // สลับฉบับหลัก: ลดฉบับหลักเดิมของหัวหน้าทัวร์คนเดียวกัน "ชนิดเดียวกัน" เป็นฉบับรอง
  for (let i = 0; i < rows.length; i++) {
    if (i === idx) continue;
    const d = rows[i];
    if (input.makePrimary && d.tourLeaderId === current.tourLeaderId && d.kind === current.kind && d.isPrimary) {
      rows[i] = {
        ...d,
        isPrimary: false,
        updatedAt: opts.at,
        history: [...d.history, { at: opts.at, by: opts.by, action: 'UNSET_PRIMARY', note: `ถูกแทนที่ด้วย${noun}อื่น` }],
      };
    }
  }

  rows[idx] = {
    ...current,
    fields: { ...current.fields, ...input.fields },
    fieldOrigin,
    note: input.note,
    isPrimary: willBePrimary,
    ...(input.file === undefined ? {} : {
      imageId: input.file?.imageId ?? null,
      sourceFileName: input.file?.sourceFileName ?? null,
      fileByteSize: input.file?.fileByteSize ?? null,
      fileUploadedBy: input.file?.fileUploadedBy ?? null,
      fileUploadedAt: input.file?.fileUploadedAt ?? null,
    }),
    updatedAt: opts.at,
    history,
  };
  saveAll(rows);
  return rows[idx];
}

/* ------------------------------ สถานะการใช้งาน ------------------------------- */

/**
 * เปลี่ยนสถานะการใช้งานของเอกสาร (ปิดใช้งาน / ยกเลิก / แจ้งสูญหาย)
 * เอกสารที่ใช้ไม่ได้แล้วจะถูกปลดจากการเป็นฉบับหลักโดยอัตโนมัติ
 */
export function setDocumentLifecycle(
  docId: string,
  lifecycle: DocumentLifecycle,
  opts: { by: string; at: string; note?: string },
): AnyLeaderDocumentRecord | null {
  const rows = loadAll();
  const idx = rows.findIndex((d) => d.docId === docId);
  if (idx < 0) return null;

  const current = rows[idx];
  const losesPrimary = lifecycle !== 'ACTIVE' && current.isPrimary;
  const history = [...current.history, {
    at: opts.at,
    by: opts.by,
    action: 'LIFECYCLE_CHANGE' as const,
    note: opts.note ?? `เปลี่ยนสถานะเป็น “${DOCUMENT_LIFECYCLE_LABEL[lifecycle]}”`,
  }];
  if (losesPrimary) history.push({ at: opts.at, by: opts.by, action: 'UNSET_PRIMARY', note: `${KIND_NOUN[current.kind]}ใช้งานไม่ได้แล้ว` });

  rows[idx] = {
    ...current,
    lifecycle,
    isPrimary: losesPrimary ? false : current.isPrimary,
    updatedAt: opts.at,
    history,
  };
  saveAll(rows);
  return rows[idx];
}

/* ---------------------------- แทนที่ไฟล์ต้นฉบับ/OCR --------------------------- */

/** แทนที่รูป/ผล OCR ของเอกสารเดิม (อัปโหลดรูปใหม่ / อ่านข้อมูลด้วย OCR ใหม่) */
export function replaceDocumentSource<TExtra = unknown>(
  docId: string,
  next: {
    imageId: string | null;
    sourceFileName: string | null;
    ocrOriginal: DocumentOcrFields | null;
    extra?: TExtra | null;
  },
  opts: { by: string; at: string; reOcr: boolean },
): AnyLeaderDocumentRecord | null {
  const rows = loadAll();
  const idx = rows.findIndex((d) => d.docId === docId);
  if (idx < 0) return null;

  const current = rows[idx];
  rows[idx] = {
    ...current,
    imageId: next.imageId ?? current.imageId,
    sourceFileName: next.sourceFileName ?? current.sourceFileName,
    // ค่าที่ OCR อ่านครั้งแรกของเอกสารนี้ต้องคงไว้ — รอบใหม่เก็บเมื่อยังไม่เคยมีเท่านั้น
    ocrOriginal: current.ocrOriginal ?? next.ocrOriginal,
    extra: next.extra ?? current.extra,
    updatedAt: opts.at,
    history: [...current.history, {
      at: opts.at,
      by: opts.by,
      action: opts.reOcr ? ('RE_OCR' as const) : ('REPLACE_IMAGE' as const),
      note: next.sourceFileName ? `${current.sourceFileName ?? '—'} → ${next.sourceFileName}` : undefined,
      imageId: current.imageId,
      fileName: current.sourceFileName,
    }],
  };
  saveAll(rows);
  return rows[idx];
}

/* ------------------------------------ ลบ ------------------------------------ */

/** ลบเอกสาร — ถ้าลบฉบับหลักและยังมีฉบับอื่น จะไม่ตั้งฉบับใหม่ให้อัตโนมัติ */
export function deleteDocument(docId: string): void {
  saveAll(loadAll().filter((d) => d.docId !== docId));
}

/* ---------------------------------- ฟอร์มเปล่า -------------------------------- */

/** ฟอร์มเปล่าสำหรับกรอกเอง — ทุกช่องว่างและเป็นการกรอกเอง */
export function blankDocumentDraft(kind: DocKind): {
  fields: DocData;
  fieldOrigin: Record<string, FieldOrigin>;
} {
  const keys = documentFieldKeys(kind);
  return { fields: emptyFieldsFor(keys), fieldOrigin: manualFieldOriginFor(keys) };
}
