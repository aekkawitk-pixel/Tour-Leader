/**
 * Period Override Store (§10) — สถานะของพีเรียดที่ผู้ดูแลปรับ (ปิดใช้งาน/Archive/สถานะขาย)
 *
 * ไม่แก้ Master ต้นทาง — เก็บ "override" แยกใน localStorage แล้วนำมาทับตอนอ่าน (service)
 * ใช้จำลอง "Master เปลี่ยน" เพื่อทดสอบการแจ้งเตือน (§9) · ไม่ลบพีเรียด/ไม่ลบ Assignment อัตโนมัติ
 *
 * สถานะขาย เก็บพร้อม "ค่าเดิม / ใครเปลี่ยน / เปลี่ยนเมื่อไร" เพื่อให้ตรวจย้อนหลังได้
 * และแสดงในรายละเอียดงานที่ต้องถอดหัวหน้าทัวร์ออก
 */

import type { DataStatus } from '@/data/schedule/masterTypes';
import type { SaleStatus } from '@/data/schedule/types';

export interface PeriodOverride {
  dataStatus?: Extract<DataStatus, 'INACTIVE' | 'ARCHIVED' | 'MISSING_FROM_SOURCE'>;
  /** สถานะขายที่ถูกปรับ — ทับค่าจาก Master ตอนอ่าน */
  saleStatus?: SaleStatus;
  /** สถานะขายก่อนการเปลี่ยนครั้งล่าสุด (ไว้แสดง "จาก X เป็น Y") */
  previousSaleStatus?: SaleStatus;
  /** เวลาที่เปลี่ยนสถานะขายล่าสุด */
  saleStatusChangedAt?: string;
  /** ผู้เปลี่ยนสถานะขายล่าสุด */
  saleStatusChangedBy?: string;
}

const KEY = 'tourPeriodOverrides';

function canUseStorage(): boolean {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

export function loadPeriodOverrides(): Record<string, PeriodOverride> {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, PeriodOverride>) : {};
  } catch { return {}; }
}

function save(map: Record<string, PeriodOverride>): void {
  if (!canUseStorage()) return;
  try { window.localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/** ตั้งสถานะข้อมูลของพีเรียด (ปิดใช้งาน/Archive) — คืน map ใหม่ */
export function setPeriodDataStatus(periodId: string, dataStatus: PeriodOverride['dataStatus']): Record<string, PeriodOverride> {
  const map = loadPeriodOverrides();
  map[periodId] = { ...map[periodId], dataStatus };
  save(map);
  return map;
}

/**
 * เปลี่ยน "สถานะขาย" ของพีเรียด — บันทึกค่าเดิม ผู้เปลี่ยน และเวลาไว้เสมอ
 * ไม่แตะ Assignment ใด ๆ (ห้ามถอดหัวหน้าทัวร์อัตโนมัติ — ต้องให้ผู้ใช้ยืนยันเอง)
 */
export function setPeriodSaleStatus(
  periodId: string, saleStatus: SaleStatus, by: string, at: string, currentSaleStatus?: SaleStatus,
): Record<string, PeriodOverride> {
  const map = loadPeriodOverrides();
  const prev = map[periodId]?.saleStatus ?? currentSaleStatus;
  map[periodId] = { ...map[periodId], saleStatus, previousSaleStatus: prev, saleStatusChangedAt: at, saleStatusChangedBy: by };
  save(map);
  return map;
}

/** คืนพีเรียดกลับเป็น ACTIVE (ลบ override) */
export function clearPeriodOverride(periodId: string): Record<string, PeriodOverride> {
  const map = loadPeriodOverrides();
  delete map[periodId];
  save(map);
  return map;
}
