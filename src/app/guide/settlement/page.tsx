'use client';

/**
 * /guide/settlement — เมนู "เคลียร์เงิน" เดิม รวมเข้าเมนู "การเงิน" แล้ว (หัวเรื่องหลังเดินทาง)
 * คง path ไว้ให้ลิงก์/บุ๊กมาร์กเดิมพาไปหน้าใหม่ · หน้าย่อย (/allowance, /claim, /appointments) ยังอยู่ที่เดิม
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GuideSettlementRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/guide/finance#after');
  }, [router]);
  return null;
}
