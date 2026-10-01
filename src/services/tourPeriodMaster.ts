/**
 * Tour Period Sync / Access Service (§14) — จุดเดียวที่ทุกหน้าเรียกใช้ข้อมูลพีเรียด
 *
 * ทุกหน้า (ตารางโปรแกรม / ตารางจัดหัวหน้าทัวร์ / Calendar / รายงาน) ต้องเรียกผ่าน Service นี้
 * ห้ามให้แต่ละหน้าอ่าน CSV หรือ Normalize เอง (§14)
 *
 * แหล่งข้อมูลเรียงตามลำดับที่ใช้:
 *   1) Zego API — ข้อมูลที่ผู้ใช้กด "ดึงข้อมูลล่าสุด" ไว้ที่เมนูโปรแกรมทัวร์ (Zego)
 *   2) CSV (buildTourPeriodMaster) — ข้อมูลตัวอย่างตั้งต้นของ Demo
 * สลับที่นี่จุดเดียว ทุกเมนูที่เกี่ยวข้องจึงเห็นข้อมูลชุดเดียวกันทันทีโดยไม่ต้องแก้หน้าจอไหนเลย
 */

import { endOfMonth } from '@/lib/format';
import { buildTourPeriodMaster, validateTourPeriodRecord, compositeKey, SOURCE_FILE, IMPORT_TS } from '@/data/schedule/master';
import { loadPeriodOverrides } from '@/services/periodOverrideStore';
import { loadZegoImport } from '@/services/zegoImportStore';
import { zegoToTourPeriodMaster } from '@/data/zego/zegoToMaster';
import type {
  MasterHistoryEntry, SourceSystem, SyncReport, TourPeriodFilters, TourPeriodMaster, ValidationResult,
} from '@/data/schedule/masterTypes';
import type { SaleStatus } from '@/data/schedule/types';

/** แหล่งข้อมูลที่กำลังใช้อยู่ — ใช้แสดงให้ผู้ใช้รู้ว่าตัวเลขบนหน้าจอมาจากไหน */
export type PeriodSourceKind = 'zego' | 'csv';

export interface PeriodSourceInfo {
  kind: PeriodSourceKind;
  label: string;
  /** เวลาที่นำเข้า (เฉพาะ Zego) */
  importedAt: string | null;
  count: number;
}

/**
 * ชุดข้อมูลตั้งต้นก่อนทับ override
 * นำเข้าจาก Zego ไว้แล้ว → ใช้ชุดนั้น · ยังไม่เคยนำเข้า → ใช้ CSV ตัวอย่างเดิม
 * (ฝั่งเซิร์ฟเวอร์อ่าน localStorage ไม่ได้ จึงได้ CSV เสมอ ซึ่งถูกต้อง —
 *  ข้อมูลที่นำเข้าเป็นของผู้ใช้แต่ละเครื่อง ไม่ใช่ข้อมูลร่วมของทั้งระบบ)
 */
function baseRecords(): TourPeriodMaster[] {
  const imported = loadZegoImport();
  if (imported && imported.periods.length > 0) {
    return zegoToTourPeriodMaster({
      programs: imported.programs,
      periods: imported.periods,
      importedAt: imported.importedAt,
      sourceUpdatedAt: imported.sourceUpdatedAt,
    });
  }
  return buildTourPeriodMaster();
}

/** แหล่งข้อมูลพีเรียดที่ระบบกำลังใช้อยู่ตอนนี้ */
export function getPeriodSource(): PeriodSourceInfo {
  const imported = loadZegoImport();
  if (imported && imported.periods.length > 0) {
    return {
      kind: 'zego',
      label: `Zego API · นำเข้า ${imported.programs.length} โปรแกรม ${imported.periods.length} พีเรียด (ขอบเขต: ${imported.scope})`,
      importedAt: imported.importedAt,
      count: imported.periods.length,
    };
  }
  const base = buildTourPeriodMaster();
  return { kind: 'csv', label: `ข้อมูลตัวอย่างจากไฟล์ ${SOURCE_FILE}`, importedAt: null, count: base.length };
}

/** พีเรียดจาก Master + ทับด้วย override ของผู้ดูแล (ปิดใช้งาน/Archive/สถานะขาย §10) — จุดเดียวที่ทุก view อ่าน */
function withOverrides(): TourPeriodMaster[] {
  const ov = loadPeriodOverrides();
  const base = baseRecords();
  if (Object.keys(ov).length === 0) return base;
  return base.map((p) => {
    const o = ov[p.internalId];
    if (!o) return p;
    let next = p;
    if (o.dataStatus) next = { ...next, dataStatus: o.dataStatus, isActive: false };
    if (o.saleStatus) next = { ...next, saleStatus: o.saleStatus };
    return next;
  });
}

/**
 * ประวัติการเปลี่ยน "สถานะขาย" ล่าสุดของพีเรียด (ใครเปลี่ยน / เมื่อไร / จากสถานะใด)
 * คืน null เมื่อยังไม่เคยถูกเปลี่ยน — ค่าปัจจุบันมาจาก Master ตามเดิม
 */
export function getSaleStatusChange(periodId: string): SaleStatusChange | null {
  const o = loadPeriodOverrides()[periodId];
  if (!o?.saleStatus) return null;
  return {
    periodId,
    from: o.previousSaleStatus ?? null,
    to: o.saleStatus,
    at: o.saleStatusChangedAt ?? null,
    by: o.saleStatusChangedBy ?? null,
  };
}

export interface SaleStatusChange {
  periodId: string;
  from: SaleStatus | null;
  to: SaleStatus;
  at: string | null;
  by: string | null;
}

/** ดึงพีเรียดทั้งหมด (ผ่านตัวกรอง §8/§14) — Master กลาง */
export function getTourPeriods(filters: TourPeriodFilters = {}): TourPeriodMaster[] {
  let rows = withOverrides();
  const f = filters;

  if (f.monthStart) {
    const monthEnd = endOfMonth(f.monthStart);
    rows = rows.filter((r) => r.startDate <= monthEnd && r.endDate >= f.monthStart!);
  }
  if (f.countryName) {
    // รับได้ทั้งค่าเดียวและหลายค่า — 'all' หรือรายการว่าง = ไม่กรอง
    const wanted = (Array.isArray(f.countryName) ? f.countryName : [f.countryName]).filter((c) => c !== 'all');
    if (wanted.length > 0) rows = rows.filter((r) => wanted.includes(r.countryName));
  }
  if (f.groupCode) {
    const q = f.groupCode.trim().toUpperCase();
    rows = rows.filter((r) => r.groupCode.includes(q));
  }
  if (f.programCode) {
    const q = f.programCode.trim().toUpperCase();
    rows = rows.filter((r) => (r.programCode ?? '').toUpperCase().includes(q));
  }
  if (f.saleStatus && f.saleStatus.length > 0 && f.saleStatus.length < 3) {
    rows = rows.filter((r) => f.saleStatus!.includes(r.saleStatus));
  }
  if (f.periodStatus) rows = rows.filter((r) => r.periodStatus === f.periodStatus);
  if (f.sourceSystem) rows = rows.filter((r) => r.sourceSystem === f.sourceSystem);
  if (f.validationStatus) rows = rows.filter((r) => r.validationStatus === f.validationStatus);
  if (f.isActive !== undefined) rows = rows.filter((r) => r.isActive === f.isActive);
  if (f.search) {
    const q = f.search.trim().toLowerCase();
    rows = rows.filter((r) => [r.groupCode, r.programCode ?? '', r.displayName, r.incName ?? '', r.systemNote ?? ''].join(' ').toLowerCase().includes(q));
  }
  if (f.groupOrProgram) {
    const q = f.groupOrProgram.trim().toLowerCase();
    // เทียบทีละช่อง ไม่ join รวมกัน — คำค้นที่คร่อมรอยต่อสองช่องต้องไม่ถือว่าตรง
    rows = rows.filter((r) =>
      r.groupCode.toLowerCase().includes(q)
      || (r.programCode ?? '').toLowerCase().includes(q)
      || r.displayName.toLowerCase().includes(q));
  }
  return rows;
}

/** ดึงพีเรียดตาม Primary Key จริง (internalId) */
export function getTourPeriodById(periodId: string): TourPeriodMaster | null {
  return withOverrides().find((r) => r.internalId === periodId) ?? null;
}

/** ดึงพีเรียดตาม Group Code — คืนได้หลายรายการ (Group Code อาจซ้ำ §1) */
export function getTourPeriodByGroupCode(groupCode: string): TourPeriodMaster[] {
  const q = groupCode.trim().toUpperCase();
  return withOverrides().filter((r) => r.groupCode === q);
}

/** พีเรียดที่คาบเกี่ยวเดือน (ISO เดือนใดก็ได้ในเดือนนั้น) (§3) */
export function getTourPeriodsByMonth(monthStartISO: string): TourPeriodMaster[] {
  return getTourPeriods({ monthStart: monthStartISO });
}

/** พีเรียดที่คาบเกี่ยวช่วงวัน [start, end] (§3) */
export function getTourPeriodsByDateRange(startISO: string, endISO: string): TourPeriodMaster[] {
  return withOverrides().filter((r) => r.startDate <= endISO && r.endDate >= startISO);
}

/** Sector ของพีเรียด (§3) — CSV ยังไม่มีข้อมูล Sector → [] */
export function getTourPeriodSectors(periodId: string): TourPeriodMaster['sectors'] {
  return getTourPeriodById(periodId)?.sectors ?? [];
}

/**
 * พีเรียดที่นำไปจัดหัวหน้าทัวร์ได้ — Active + ไม่ INVALID + สถานะขายต้องไม่ใช่ NO_SELL
 *
 * NO_SELL = ไม่เปิดขายแล้ว จึงห้ามนำมาจัดสเก็ตใหม่ (ต้องไม่โผล่ในรายการให้เลือก/ค้นหา/กำหนดรายชื่อ)
 * การกรองที่นี่เป็นเพียงชั้นแรก — ชั้นบันทึกจริงตรวจซ้ำอีกครั้งที่ guideAssignmentStore
 */
export function getAssignablePeriods(): TourPeriodMaster[] {
  return withOverrides().filter(
    (r) => r.isActive && r.dataStatus === 'ACTIVE' && r.validationStatus !== 'INVALID' && r.saleStatus !== 'NO_SELL',
  );
}

/** ตรวจสอบข้อมูล 1 พีเรียด (§13/§14) */
export function validateTourPeriod(period: TourPeriodMaster): ValidationResult {
  return validateTourPeriodRecord(period);
}

/** ประวัติการเปลี่ยนแปลงของพีเรียด (§12/§14) — Demo: มีรายการนำเข้าครั้งแรก (ยังไม่มี persistence การแก้) */
export function getTourPeriodHistory(periodId: string): MasterHistoryEntry[] {
  const rec = getTourPeriodById(periodId);
  if (!rec) return [];
  return [{ at: rec.importedAt, action: 'import', source: rec.sourceSystem, by: 'ระบบนำเข้า (CSV)', to: rec.groupCode }];
}

/**
 * Sync ข้อมูลจากต้นทาง (§10) — CSV adapter
 *   ปัจจุบันรองรับ 'CSV' (in-memory) · REST/DB เป็น interface เตรียมไว้ต่อยอด (ยังไม่ implement adapter)
 *   ตรวจซ้ำด้วย Composite Key · ไม่ลบรายการที่หายทันที → ตั้ง MISSING_FROM_SOURCE
 */
export function syncTourPeriods(source: SourceSystem = 'CSV'): SyncReport {
  if (source !== 'CSV') {
    throw new Error(`ยังไม่รองรับแหล่งข้อมูล ${source} — เตรียม adapter ไว้ต่อยอด (REST/DB)`);
  }
  const rows = buildTourPeriodMaster();
  // ตรวจ Composite Key ซ้ำ (ควรไม่มีในไฟล์จริง — รายงานถ้าพบ)
  const keys = new Set<string>();
  let duplicates = 0;
  for (const r of rows) {
    const k = compositeKey(r);
    if (keys.has(k)) duplicates += 1;
    keys.add(k);
  }
  const invalidCount = rows.filter((r) => r.validationStatus === 'INVALID').length;
  const warningCount = rows.filter((r) => r.validationStatus === 'WARNING').length;
  return {
    source,
    sourceFileName: SOURCE_FILE,
    total: rows.length,
    inserted: rows.length - duplicates, // รอบแรก: ทุกรายการเป็น insert (ยังไม่มี snapshot เดิม)
    updated: 0,
    missing: 0, // ยังไม่มีการเทียบกับรอบก่อน (in-memory) → 0
    invalidCount,
    warningCount,
    at: IMPORT_TS,
  };
}
