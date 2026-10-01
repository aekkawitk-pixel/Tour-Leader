/**
 * Sale Status Mapper — คำนวณ "สถานะขาย" จากข้อมูล CSV (แยกจากสถานะพีเรียด COL/INC)
 * ค่าในระบบมี 3 ค่าเท่านั้น: SELL / NO_SELL / CLOSED (ไม่ใช้ OPEN/INC/COL เป็นสถานะขาย)
 *
 * ลำดับความสำคัญ:
 *   1) tourStatus === "NO SELL" → NO_SELL
 *   2) sellStatus === "Close"   → CLOSED
 *   3) กรณีอื่น                  → SELL
 */

import type { RawPeriod, SaleStatus } from './types';

export function getSaleStatus(raw: Pick<RawPeriod, 'tourStatus' | 'sellStatus'>): SaleStatus {
  if ((raw.tourStatus ?? '').trim().toUpperCase() === 'NO SELL') return 'NO_SELL';
  if ((raw.sellStatus ?? '').trim().toUpperCase() === 'CLOSE') return 'CLOSED';
  return 'SELL';
}

/** ข้อความที่แสดงใน UI (ค่าในระบบ NO_SELL → "NO SELL") */
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  SELL: 'SELL',
  NO_SELL: 'NO SELL',
  CLOSED: 'CLOSED',
};
