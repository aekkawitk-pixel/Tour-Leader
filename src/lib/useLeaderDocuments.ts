'use client';

/**
 * รายการเอกสารรูปแบนที่หน้าจอเดิมใช้ — รวมเอกสารจริงใน documentStore เข้ากับรายการเดิมของหัวหน้าทัวร์
 *
 * หน้าจอที่ยังอ่าน `leader.documents` ตรง ๆ จะไม่เห็นเอกสารที่บันทึกผ่านโมดูลใหม่
 * hook นี้ทำให้เห็นครบโดยไม่ต้องแก้โครงหน้าจอ (อ่านอย่างเดียว — การแก้ไขยังทำที่ documentStore)
 *
 * ผู้เรียกต้องส่ง `canViewIdentity` ที่ตรวจสิทธิ์มาแล้ว (เอกสารประจำตัวเป็นข้อมูลอ่อนไหว)
 * ถ้าไม่มีสิทธิ์ จะคืนเฉพาะรายการเดิมเท่านั้น ไม่แตะ store
 */

import { useMemo } from 'react';
import { mergeLeaderDocuments } from '@/lib/logic/documentView';
import { getDocuments } from '@/services/documentStore';
import type { LeaderDocument, TourLeader } from '@/types';

const NONE: LeaderDocument[] = [];

/** รับ leader เป็น undefined ได้ เพื่อให้เรียกก่อนจุด early-return ของหน้าจอได้ (กฎของ Hook) */
export function useLeaderDocumentsView(
  leader: TourLeader | undefined,
  canViewIdentity: boolean,
  /** เปลี่ยนค่าเพื่อบังคับอ่านใหม่หลังบันทึก (ใช้ร่วมกับ state นับรอบของหน้าจอ) */
  rev: number = 0,
): LeaderDocument[] {
  const legacy = leader?.documents;
  const leaderId = leader?.id;

  return useMemo(() => {
    void rev;
    if (!legacy || !leaderId) return NONE;
    if (!canViewIdentity) return legacy;
    return mergeLeaderDocuments(legacy, getDocuments(leaderId));
  }, [legacy, leaderId, canViewIdentity, rev]);
}
