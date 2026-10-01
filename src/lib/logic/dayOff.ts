/**
 * วันหยุดของเจ้าหน้าที่ส่งกรุ๊ป — เสาร์-อาทิตย์ หรือวันหยุดที่ตั้งไว้ในเมนูวันหยุด
 *
 * วันหยุดพนักงานไม่ต้องเข้างานประจำ จึงจัดไปส่งกรุ๊ปได้ทุกช่วงเวลาเท่าประเภทประจำ
 * ใช้ dayTypeOf ชุดเดียวกับปฏิทินทุกหน้า จะได้ไม่มีวันไหนที่หน้าหนึ่งบอกหยุด อีกหน้าบอกทำงาน
 */

import { dayTypeOf, type Holiday } from '@/services/holidayService';
import { parseDate } from '@/lib/format';

/** ชื่อวันหยุดสุดสัปดาห์ — ใช้เฉพาะข้อความอธิบายว่าทำไมวันนี้จัดได้ */
const WEEKEND_NAME: Record<number, string> = { 0: 'วันอาทิตย์', 6: 'วันเสาร์' };

/**
 * สร้างตัวตรวจวันหยุดสำหรับช่วงที่กำลังดู
 * คืนชื่อวันหยุด (เช่น "วันสงกรานต์" หรือ "วันเสาร์") · null = วันทำงานปกติ
 */
export function dayOffLookup(holidays: Map<string, Holiday>): (iso: string) => string | null {
  return (iso: string) => {
    const type = dayTypeOf(iso, holidays);
    if (type === 'holiday') return holidays.get(iso)?.name ?? 'วันหยุด';
    if (type === 'weekend') return WEEKEND_NAME[parseDate(iso).getDay()] ?? 'วันหยุดสุดสัปดาห์';
    return null;
  };
}
