'use client';

/**
 * /guide/expenses — เมนู "ค่าใช้จ่าย" เดิม รวมเข้าเมนู "การเงิน" แล้ว (แท็บระหว่างทาง)
 * คง path ไว้ให้ลิงก์/บุ๊กมาร์กเดิมพาไปหน้าใหม่ · หน้าย่อย /record ยังอยู่ที่เดิม
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GuideExpensesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/guide/finance?tab=during');
  }, [router]);
  return null;
}
