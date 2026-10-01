/**
 * อัตราเบิกเบี้ยเลี้ยงหัวหน้าทัวร์อ้างอิงตามกลุ่มประเทศปลายทาง (ต่อวัน)
 * ใช้แสดงเป็นตารางอ้างอิงในแบบฟอร์ม "เคลียร์ค่าใช้จ่ายรายกรุ๊ป" และคำนวณยอดเบี้ยเลี้ยงเริ่มต้นให้อัตโนมัติ
 * (rate × จำนวนวันเดินทาง) — ผู้ใช้แก้ไขยอดเองได้เสมอก่อนบันทึก ไม่ใช่ค่าบังคับ
 *
 * ⚠️ TourPeriodMaster.countryName เก็บเป็นภาษาอังกฤษตัวพิมพ์ใหญ่เสมอ (เช่น "CHINA" "JAPAN" "HONG KONG"
 * ไม่ใช่ "จีน"/"ญี่ปุ่น") — ยืนยันจากข้อมูลจริงใน src/data/schedule/periods.seed.ts (11 ประเทศที่พบจริง:
 * CHINA, VIETNAM, HONG KONG, JAPAN, TAIWAN, GEORGIA, TURKIYE, SINGAPORE, EGYPT, EUROPE, SCANDINAVIA)
 * จึงต้องจับคู่ (countryNames) ด้วยรหัสอังกฤษเหล่านี้ ส่วน labelTh มีไว้แสดงผลในตารางอ้างอิงเท่านั้น
 * ประเทศที่ไม่อยู่ในตารางนี้ (เช่น VIETNAM, EGYPT) จะไม่มีอัตราให้คำนวณอัตโนมัติ — กรอกเองได้ตามปกติ
 */

export interface PerDiemRateGroup {
  /** ข้อความแสดงผลภาษาไทยในตารางอ้างอิง */
  labelTh: string;
  /** รหัสประเทศภาษาอังกฤษตัวพิมพ์ใหญ่ที่ใช้จับคู่กับ TourPeriodMaster.countryName จริง */
  countryNames: string[];
  rateTHB: number;
}

export const PER_DIEM_RATES: PerDiemRateGroup[] = [
  { labelTh: 'ฮ่องกง', countryNames: ['HONG KONG'], rateTHB: 800 },
  { labelTh: 'ไต้หวัน, เกาหลี', countryNames: ['TAIWAN', 'KOREA', 'SOUTH KOREA'], rateTHB: 900 },
  {
    labelTh: 'จีน, บาหลี, อินเดีย, รัสเซีย, ตุรกี, ดูไบ',
    countryNames: ['CHINA', 'BALI', 'INDONESIA', 'INDIA', 'RUSSIA', 'TURKIYE', 'TURKEY', 'DUBAI', 'UAE'],
    rateTHB: 1000,
  },
  { labelTh: 'ญี่ปุ่น, ฮอกไกโด, จอร์เจีย, คาซัคสถาน', countryNames: ['JAPAN', 'GEORGIA', 'KAZAKHSTAN'], rateTHB: 1000 },
  { labelTh: 'สิงคโปร์', countryNames: ['SINGAPORE'], rateTHB: 1150 },
  {
    labelTh: 'ยุโรป, อเมริกา, อังกฤษ, โครเอเชีย',
    countryNames: ['EUROPE', 'SCANDINAVIA', 'AMERICA', 'USA', 'UNITED STATES', 'UK', 'UNITED KINGDOM', 'BRITAIN', 'CROATIA'],
    rateTHB: 1500,
  },
];

/** หาอัตราเบี้ยเลี้ยง/วัน จากรหัสประเทศภาษาอังกฤษของ TourPeriodMaster.countryName (ไม่สนตัวพิมพ์เล็ก/ใหญ่) */
export function findPerDiemRate(countryName: string | null | undefined): number | undefined {
  if (!countryName) return undefined;
  const needle = countryName.trim().toUpperCase();
  if (!needle) return undefined;
  const hit = PER_DIEM_RATES.find((group) => group.countryNames.includes(needle));
  return hit?.rateTHB;
}
