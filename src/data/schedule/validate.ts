/**
 * Data Validation (§22) — ตรวจข้อมูลก่อนแสดง โดยไม่ทำให้หน้า Error และไม่สร้างค่าทดแทนแบบสุ่ม
 * คืนรายการคำเตือน (Data Validation Report) เพื่อ log ใน console ตอน dev
 */

import type { SchedulePeriod } from './types';

export interface ValidationWarning {
  tourCode: string;
  issue: string;
}

export function validateSchedulePeriods(rows: SchedulePeriod[]): ValidationWarning[] {
  const warns: ValidationWarning[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.tourCode) warns.push({ tourCode: '(ว่าง)', issue: 'Group Code ว่าง' });
    else if (seen.has(r.tourCode)) warns.push({ tourCode: r.tourCode, issue: 'Group Code ซ้ำ' });
    seen.add(r.tourCode);

    if (r.startDate && r.endDate && r.startDate > r.endDate) warns.push({ tourCode: r.tourCode, issue: 'startDate มากกว่า endDate' });
    if (r.seat != null && r.seat < 0) warns.push({ tourCode: r.tourCode, issue: 'Seat ติดลบ' });
    if (r.bookingBalance != null && r.bookingBalance < 0) warns.push({ tourCode: r.tourCode, issue: 'BookingBalance ติดลบ' });
    if (r.bookingCount != null && r.bookingCount < 0) warns.push({ tourCode: r.tourCode, issue: 'bookingCount ติดลบ' });
    if (r.seat != null && r.bookingBalance != null && r.bookingBalance > r.seat) warns.push({ tourCode: r.tourCode, issue: 'BookingBalance มากกว่า Seat' });
    if (r.airlineCode && !/^[A-Z0-9]{2,3}$/.test(r.airlineCode)) warns.push({ tourCode: r.tourCode, issue: `Airline Code ผิดรูป (${r.airlineCode})` });
    if (!['SELL', 'NO_SELL', 'CLOSED'].includes(r.saleStatus)) warns.push({ tourCode: r.tourCode, issue: `สถานะขายไม่ถูกต้อง (${r.saleStatus})` });
  }
  return warns;
}
