'use client';

/**
 * เอกสารประจำตัวของหัวหน้าทัวร์ในมุมพอร์ทัล (/guide) — แหล่งเดียวสำหรับทุกจุดที่นับ "เอกสารต้องตาม"
 * (กระดิ่ง/แถบล่างใน GuideShell · กล่องเตือนหน้าหลัก · ป้ายในเมนูโปรไฟล์ · หน้าเอกสารประจำตัว)
 *
 * ทำไมต้องมี: รายการรูปแบน (useLeaderDocumentsView) ไม่มีหนังสือเดินทางที่มาจากไฟล์นำเข้าต้นทาง
 * หัวหน้าทัวร์ส่วนใหญ่มีพาสปอร์ตแบบนั้น จึงไม่ถูกนับเลย ทั้งที่เป็นเอกสารที่สำคัญที่สุด
 * ที่นี่จึงใช้รายการหนังสือเดินทางชุดเดียวกับแท็บหนังสือเดินทาง (buildPassportCards:
 * เล่มในระบบ + เล่มจากไฟล์ต้นทางที่ไม่ซ้ำ) แทนรายการพาสปอร์ตในรูปแบน แล้วนับเตือนด้วยเกณฑ์เดิม
 */

import { useMemo } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listDocumentExpiryAlerts, type DocumentExpiryAlert } from '@/lib/logic/documentExpiryAlerts';
import { buildPassportCards, masterIdentityToCard, type PassportCardModel } from '@/lib/logic/passportCardModel';
import type { PassportCardStatus } from '@/lib/logic/passportCard';
import { maskPassport } from '@/lib/logic/tourLeaderMaster';
import { getIdentityDocument, getTourLeaderById } from '@/services/tourLeaderMaster';
import { getPassportBooks } from '@/services/passportBookStore';
import { isMasterPassportHidden } from '@/services/masterPassportHidden';
import type { LeaderDocument, TourLeader } from '@/types';

/** เล่มที่เลิกใช้แล้ว (ยกเลิก/สูญหาย/ปิดใช้งาน) — ยังแสดงในรายการ แต่ไม่ต้องเตือนวันหมดอายุ */
export const PASSPORT_NOT_IN_USE: ReadonlySet<PassportCardStatus> = new Set(['REVOKED', 'LOST', 'INACTIVE']);

/** หนังสือเดินทาง 1 เล่ม → รูปแบน เพื่อใช้เกณฑ์เตือนเดียวกับเอกสารอื่น */
export function passportCardToDocument(card: PassportCardModel): LeaderDocument {
  return {
    id: card.id,
    kind: 'passport',
    name: 'หนังสือเดินทาง',
    number: maskPassport(card.fields.passportNo || null),
    issuedAt: card.fields.issueDate || '',
    expiresAt: card.fields.expiryDate || null,
    fileName: card.sourceFileName ?? '',
    verifyStatus: card.saveStatus === 'DRAFT' ? 'pending' : 'verified',
  };
}

export interface GuideDocuments {
  /** หนังสือเดินทางทุกเล่ม (เล่มหลักขึ้นก่อน) */
  passports: PassportCardModel[];
  /** เอกสารอื่นทั้งหมดในรูปแบน (ไม่รวมหนังสือเดินทาง) */
  others: LeaderDocument[];
  /** เอกสารที่ต้องตาม (หมดอายุแล้ว/ใกล้หมดอายุ) รวมหนังสือเดินทางที่ยังใช้อยู่ */
  alerts: DocumentExpiryAlert[];
}

/** รับ leader เป็น undefined ได้ (เรียกก่อนจุด early-return ของหน้าจอได้) · rev เปลี่ยน = อ่านใหม่หลังบันทึก */
export function useGuideDocuments(leader: TourLeader | undefined, rev: number = 0): GuideDocuments {
  const { currentUser, today } = useDemo();
  const canViewIdentity = can(currentUser.role, 'passport.view');
  const flat = useLeaderDocumentsView(leader, canViewIdentity, rev);
  const leaderId = leader?.id;

  const passports = useMemo(() => {
    void rev;
    if (!leaderId || !canViewIdentity) return [];
    const master = isMasterPassportHidden(leaderId)
      ? null
      : masterIdentityToCard(getTourLeaderById(leaderId), getIdentityDocument(leaderId, true), today);
    return buildPassportCards(getPassportBooks(leaderId), master, today);
  }, [leaderId, canViewIdentity, today, rev]);

  return useMemo(() => {
    const others = flat.filter((d) => d.kind !== 'passport');
    const inUse = passports.filter((c) => !PASSPORT_NOT_IN_USE.has(c.status)).map(passportCardToDocument);
    return { passports, others, alerts: listDocumentExpiryAlerts([...inUse, ...others], today) };
  }, [flat, passports, today]);
}
