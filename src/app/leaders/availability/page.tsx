'use client';

/**
 * ⚠️ ย้ายไปอยู่ใน Tab "สถานะการใช้งาน" และ "วันลาและช่วงไม่พร้อม" ของหน้ารายละเอียดหัวหน้าทัวร์แล้ว
 * (แยกคนละแท็บ ผูกกับ tourLeaderId รายบุคคล) — หน้านี้จึงพาไปหน้ารายชื่อแทน
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedAvailabilityRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/leaders');
  }, [router]);
  return null;
}
