/**
 * Tour Period Master (§1/§2) — โครงสร้างข้อมูลกลางของ "รายการทัวร์และพีเรียด"
 *
 * 1 record = 1 พีเรียดเดินทาง · โปรแกรมเดียวมีได้หลายพีเรียด
 * Group Code = รหัสธุรกิจหลักที่ผู้ใช้เห็น/ค้นหา (อาจซ้ำได้) — Primary Key จริงคือ `id` (internalId)
 * ออกแบบให้เปลี่ยนแหล่งข้อมูล CSV → REST/DB ได้โดยไม่แก้ผู้เรียกใช้ (ผ่าน Service กลาง)
 *
 * หมายเหตุ: สืบทอด SchedulePeriod เดิม (superset) เพื่อไม่กระทบผู้ใช้เดิม — field ใหม่เป็นชื่อ canonical (§2)
 */

import type { PeriodStatus, SaleStatus, SchedulePeriod } from './types';

export type SourceSystem = 'CSV' | 'REST' | 'DB' | 'MANUAL';

/** สถานะข้อมูลในวงจร Sync (§10) — ไม่ลบทันทีเมื่อหายจากต้นทาง */
export type DataStatus = 'ACTIVE' | 'MISSING_FROM_SOURCE' | 'INACTIVE' | 'ARCHIVED';

/** สถานะการตรวจสอบข้อมูล (§13) */
export type ValidationStatus = 'VALID' | 'WARNING' | 'INVALID';

/** ที่มาของรหัสสายการบิน (§5.5) — ระบุว่าเป็นข้อมูลจริงหรือการอนุมาน */
export type AirlineSource = 'sector' | 'source' | 'derived_from_group_code' | null;

export type SectorType = 'OUTBOUND' | 'INBOUND' | 'DOMESTIC' | 'OTHER';

/** เที่ยวบิน 1 ช่วง (Sector) — Sector 1 = ขาออก */
export interface TourSector {
  sectorSequence: number;
  sectorType: SectorType;
  airlineCode: string;
  flightNumber: string;
  fromAirportCode: string;
  toAirportCode: string;
  departureDateTime: string | null; // ISO
  arrivalDateTime: string | null;
  /**
   * เวลาประจำเที่ยวบิน (HH:MM) — คนละอย่างกับ departureDateTime ที่เป็นวันที่-เวลาเต็ม
   * บางแหล่งข้อมูล (Zego API) ให้มาแค่เวลา ไม่ได้ให้วันที่ จึงเก็บแยกไว้ไม่ปนกัน
   */
  departureTime?: string | null;
  arrivalTime?: string | null;
}

/** Tour Period Master — ข้อมูลกลาง 1 พีเรียด (§2) */
export interface TourPeriodMaster extends SchedulePeriod {
  /* ---- อ้างอิง (§2) ---- */
  sourceSystem: SourceSystem;
  sourceRecordId: string;
  groupCode: string; // = tourCode (trim + uppercase) · รหัสธุรกิจหลัก
  countryCode: string | null; // เชื่อม Country Master ถ้าจับคู่ได้ (§5.2) · null = ยังไม่แมป
  programId: string | null; // เชื่อม Tour Program Master ภายหลัง (§7) · null = ยังไม่แยกโปรแกรม

  /* ---- การเดินทาง (§2) ---- */
  startDateTime: string | null; // ISO datetime (CSV ไม่มีเวลา → null)
  endDateTime: string | null;
  durationNights: number;
  departureAirportCode: string | null; // From ของ Sector 1 (CSV ไม่มี → null)
  arrivalAirportCode: string | null;
  firstSectorAirlineCode: string | null;
  airlineSource: AirlineSource;
  route: string | null;

  /* ---- เที่ยวบิน (§2) ---- */
  sectors: TourSector[];

  /* ---- สถานะ (§3) ---- */
  saleStatus: SaleStatus; // SELL | NO_SELL | CLOSED (ไม่ปน INC/COL)
  periodStatus: PeriodStatus; // ประเภทกรุ๊ป: INC หรือ COL เท่านั้น
  sourceTourStatus: string; // ค่าดิบ tourStatus
  sourceSellStatus: string; // ค่าดิบ sellStatus

  /* ---- ราคา (§2) ---- */
  originalPrice: number | null;
  visaPrice: number | null;
  currency: string;

  /* ---- ที่นั่ง (§2) ---- */
  seatTotal: number | null;
  seatBooked: number | null;
  seatRemaining: number | null;

  /* ---- เพิ่มเติม (§2) ---- */
  periodStatusDetail: string | null; // ข้อความเต็มของ INC/COL
  commission: string | null;
  remark: string | null;

  /* ---- ระบบ (§2/§10/§13) ---- */
  dataStatus: DataStatus;
  isActive: boolean;
  importedAt: string;
  updatedAt: string;
  lastSyncedAt: string;
  sourceFileName: string;
  sourceRowNumber: number;
  validationStatus: ValidationStatus;
  validationMessages: string[];
}

/** ตัวกรองสำหรับ getTourPeriods (§8/§14) */
export interface TourPeriodFilters {
  monthStart?: string; // ISO วันแรกของเดือน — จับพีเรียดที่คาบเกี่ยวเดือนนั้น
  countryName?: string | string[]; // 'all'/undefined = ไม่กรอง · array = เลือกได้หลายประเทศ ([] = ไม่กรอง)
  groupCode?: string; // substring (case-insensitive)
  programCode?: string;
  saleStatus?: SaleStatus[];
  periodStatus?: PeriodStatus;
  sourceSystem?: SourceSystem;
  validationStatus?: ValidationStatus;
  isActive?: boolean;
  search?: string; // Group Code / Program Code / ชื่อ / INC
  /**
   * ค้นเฉพาะ "รหัสกรุ๊ป" กับ "โปรแกรม" (รหัสโปรแกรม + ชื่อโปรแกรม) เท่านั้น
   * แยกจาก search เพราะบางหน้าจงใจไม่ให้ INC/หมายเหตุระบบมาติดผลค้นหาด้วย
   */
  groupOrProgram?: string;
}

/** ผลการตรวจสอบข้อมูล (§13) */
export interface ValidationResult {
  status: ValidationStatus;
  messages: string[];
}

/** รายงานผลการ Sync (§10) */
export interface SyncReport {
  source: SourceSystem;
  sourceFileName: string;
  total: number;
  inserted: number;
  updated: number;
  missing: number;
  invalidCount: number;
  warningCount: number;
  at: string;
}

/** รายการประวัติการเปลี่ยนแปลง Master (§12) */
export interface MasterHistoryEntry {
  at: string;
  action: 'import' | 'update' | 'sync' | 'deactivate';
  field?: string;
  from?: string | null;
  to?: string | null;
  source: SourceSystem;
  by: string;
  syncBatch?: string;
}
