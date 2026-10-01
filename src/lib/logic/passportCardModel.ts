/**
 * รวมหนังสือเดินทางทุกแหล่งให้เป็น "รายการ Card เดียว" (1 เล่ม = 1 Card)
 *
 * แหล่งข้อมูล 2 ทาง — ห้ามนำมารวมอยู่ใน Card เดียวกัน:
 *   • MASTER — เล่มที่นำเข้าจากไฟล์ต้นทาง (Tour Leader Master) · อ่านอย่างเดียว
 *   • BOOK   — เล่มที่เพิ่มในระบบผ่าน OCR/กรอกเอง · แก้ไขได้
 *
 * ตรรกะล้วน (รับข้อมูลเป็นพารามิเตอร์) เพื่อให้ทดสอบได้
 */

import { passportCardStatus, sortPassportCards, mrzValidationStatus, type PassportCardStatus } from './passportCard';
import { passportFullName } from './tourLeaderMaster';
import {
  emptyPassportFields,
  type MrzCheckSummary, type MrzValidationStatus, type PassportBook, type PassportBookHistoryEntry,
  type PassportBookStatus, type PassportEntryMethod, type PassportFieldValues, type PassportLifecycle,
  type PassportOcrFields,
} from '@/data/leaders/passportBookTypes';
import type { TourLeaderIdentityDocument, TourLeaderProfile } from '@/data/leaders/masterTypes';

export type PassportCardSource = 'MASTER' | 'BOOK';

export interface PassportCardModel {
  /** key สำหรับ React */
  id: string;
  source: PassportCardSource;
  /** null เมื่อมาจาก Master (ยังไม่ใช่เล่มในสโตร์) */
  bookId: string | null;
  isPrimary: boolean;
  lifecycle: PassportLifecycle;
  status: PassportCardStatus;
  /** สถานะการบันทึก (ฉบับร่าง/ยืนยันแล้ว) — Master ไม่มี */
  saveStatus: PassportBookStatus | null;

  fields: PassportFieldValues;

  /** แหล่งที่มาของข้อมูล (§10 Tag) */
  entryMethod: PassportEntryMethod;
  /** สถานะการตรวจสอบ MRZ (§4/§6 Section D) */
  mrzValidation: MrzValidationStatus;
  /** วันที่ตรวจสอบล่าสุด (§6 Section D) */
  updatedAt: string | null;

  imageId: string | null;
  sourceFileName: string | null;
  ocrOriginal: PassportOcrFields | null;
  mrzCheck: MrzCheckSummary | null;
  history: PassportBookHistoryEntry[];

  /** แก้ไข/จัดการได้หรือไม่ (Master = ไม่ได้ ต้องแก้ที่ระบบต้นทาง) */
  manageable: boolean;
}

/** แปลงข้อมูลจาก Tour Leader Master เป็น Card 1 ใบ (คืน null เมื่อไม่มีข้อมูลเล่มเลย) */
export function masterIdentityToCard(
  profile: TourLeaderProfile | null,
  identity: TourLeaderIdentityDocument | null,
  todayISO: string,
): PassportCardModel | null {
  if (!identity && !profile) return null;
  // ไม่มีร่องรอยของเล่มจริงเลย → ไม่สร้าง Card ว่าง
  const hasBookData = !!(identity?.passportNo || identity?.passportExpiryDate || identity?.passportIssueDate);
  if (!hasBookData) return null;

  const fields = emptyPassportFields();
  fields.passportType = identity?.passportType ?? '';
  fields.passportNo = identity?.passportNo ?? '';
  fields.issuingCountry = profile?.countryCode ?? '';
  fields.issuingAuthority = identity?.issuingAuthority ?? '';
  // Master เก็บ "หมายเหตุจากหน่วยงาน" ไม่ใช่สถานที่ออก — ไม่นำมาใส่ช่องสถานที่ออก (จะผิดความหมาย)
  fields.titleName = profile?.titleNameEN ?? '';
  fields.firstName = profile?.firstNameEN ?? '';
  fields.lastName = profile?.lastNameEN ?? '';
  fields.fullName = profile ? passportFullName(profile) : '';
  // ชื่อไทยจาก Master (§2) — เก็บตามที่มี ไม่แปลจากอังกฤษ
  fields.titleNameTh = profile?.titleNameTH ?? '';
  fields.firstNameTh = profile?.firstNameTH ?? '';
  fields.lastNameTh = profile?.lastNameTH ?? '';
  fields.fullNameTh = [profile?.titleNameTH, profile?.firstNameTH, profile?.lastNameTH].filter(Boolean).join(' ').trim();
  fields.nameInThaiRaw = fields.fullNameTh;
  fields.nationality = profile?.nationality ?? '';
  fields.dateOfBirth = identity?.dateOfBirth ?? '';
  fields.gender = profile?.gender ?? '';
  fields.placeOfBirth = identity?.placeOfBirth ?? '';
  fields.nationalId = identity?.personalID ?? '';
  fields.issueDate = identity?.passportIssueDate ?? '';
  fields.expiryDate = identity?.passportExpiryDate ?? '';

  return {
    id: `master:${identity?.tourLeaderId ?? profile?.tourLeaderId ?? 'unknown'}`,
    source: 'MASTER',
    bookId: null,
    isPrimary: false, // เล่มหลักกำหนดจากเล่มในระบบเท่านั้น
    lifecycle: 'ACTIVE',
    status: passportCardStatus('ACTIVE', fields.expiryDate || null, todayISO),
    saveStatus: null,
    fields,
    entryMethod: 'MANUAL', // Master = ข้อมูลนำเข้าจากไฟล์ต้นทาง (ไม่ใช่ OCR ในระบบนี้)
    mrzValidation: 'UNVERIFIABLE',
    updatedAt: null,
    imageId: null,
    sourceFileName: null,
    ocrOriginal: null,
    mrzCheck: null,
    history: [],
    manageable: true, // กดแก้ไขได้ — ระบบจะคัดลอกมาเป็นเล่มในระบบให้เองก่อนแก้
  };
}

/** แปลงเล่มในระบบเป็น Card */
export function bookToCard(book: PassportBook, todayISO: string): PassportCardModel {
  return {
    id: `book:${book.bookId}`,
    source: 'BOOK',
    bookId: book.bookId,
    isPrimary: book.isPrimary,
    lifecycle: book.lifecycle ?? 'ACTIVE',
    status: passportCardStatus(book.lifecycle ?? 'ACTIVE', book.fields.expiryDate || null, todayISO),
    saveStatus: book.status,
    fields: book.fields,
    entryMethod: book.entryMethod,
    mrzValidation: mrzValidationStatus(book.mrzCheck),
    updatedAt: book.updatedAt || book.createdAt || null,
    imageId: book.imageId,
    sourceFileName: book.sourceFileName,
    ocrOriginal: book.ocrOriginal,
    mrzCheck: book.mrzCheck,
    history: book.history,
    manageable: true,
  };
}

/**
 * รายการ Card ทั้งหมดของหัวหน้าทัวร์ เรียงตาม §5
 * เล่มจาก Master ที่มีเลขซ้ำกับเล่มในระบบจะถูกตัดออก (ถือเป็นเล่มเดียวกัน — กัน Card ซ้ำ)
 */
export function buildPassportCards(
  books: PassportBook[],
  master: PassportCardModel | null,
  todayISO: string,
): PassportCardModel[] {
  const cards = books.map((b) => bookToCard(b, todayISO));

  if (master) {
    const masterNo = master.fields.passportNo.trim().toUpperCase();
    const duplicated = masterNo !== ''
      && cards.some((c) => c.fields.passportNo.trim().toUpperCase() === masterNo);
    if (!duplicated) cards.push(master);
  }

  return sortPassportCards(
    cards.map((c) => ({ ...c, expiryDate: c.fields.expiryDate || null })),
  ).map(({ expiryDate: _expiry, ...card }) => {
    void _expiry;
    return card;
  });
}
