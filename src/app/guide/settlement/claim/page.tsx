'use client';

/**
 * ตรวจสอบก่อนนัดเคลียร์เงิน — /guide/settlement/claim (เลิกใช้เป็นหน้าแยกแล้ว)
 *
 * เนื้อหารายกรุ๊ป (✓/✗ · ใบเสร็จ · เบี้ยเลี้ยง · ปุ่มทำนัดเคลียร์เงิน) ย้ายไปส่วน "บัญชี-การเงิน" ในหน้ารายละเอียดงาน
 * (GroupFinancePanel) · ยอดค้างติดตามหลังเคลียร์ย้ายไปหน้าบัญชี-การเงิน
 * หน้านี้เหลือไว้พาไปที่ใหม่ ลิงก์เก่า (?period=<id>) จะได้ไม่เสีย
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function GuideSettlementClaimRedirect() {
  const router = useRouter();
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('period');
    router.replace(pid ? `/guide/jobs/${encodeURIComponent(pid)}#finance` : '/guide/finance');
  }, [router]);
  return null;
}
