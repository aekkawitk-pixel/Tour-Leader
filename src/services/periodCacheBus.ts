/**
 * เลขรุ่นของข้อมูลพีเรียด — ใช้ล้างแคชของ tourPeriodMaster เมื่อข้อมูลต้นทางเปลี่ยน
 *
 * แยกเป็นไฟล์เล็กของตัวเอง กัน import วน (zegoImportStore / periodOverrideStore ← tourPeriodMaster)
 * ผู้เขียนข้อมูลพีเรียด (นำเข้า Zego / override สถานะ) เรียก bumpPeriodVersion() ทุกครั้งที่เขียน
 * แท็บอื่นเขียน localStorage → เหตุการณ์ storage ล้างให้เองด้านล่าง
 */

export const PERIOD_SOURCE_KEYS = ['zegoImportedPrograms', 'tourPeriodOverrides'] as const;

let version = 0;

export function periodVersion(): number {
  return version;
}

export function bumpPeriodVersion(): void {
  version += 1;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    // e.key === null = ล้าง localStorage ทั้งหมด
    if (e.key === null || (PERIOD_SOURCE_KEYS as readonly string[]).includes(e.key)) bumpPeriodVersion();
  });
}
