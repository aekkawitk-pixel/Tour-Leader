/** โครงสร้างข้อมูลพีเรียดจากไฟล์ CSV "Query All Period Aug To Sep 2026.csv" (ไม่มี Ticket Stock/PNR) */

/** สถานะขาย — ค่าในระบบ (UI แสดง SELL / NO SELL / CLOSED) */
export type SaleStatus = 'SELL' | 'NO_SELL' | 'CLOSED';

/** สถานะพีเรียด (ประเภท/ที่มา) — เป็น Tag รอง ไม่ใช่สถานะขาย · null = ไม่มี */
export type PeriodStatus = 'COL' | 'INC';

/** ข้อมูลดิบตามคอลัมน์ใน CSV (1 แถว = 1 พีเรียด) — โหลดโดย CSV Loader */
export interface RawPeriod {
  countryName: string;
  tourCode: string;
  bus: string | null;
  tourStatus: string;
  sellStatus: string;
  tourName: string;
  incName: string | null;
  startDate: string; // ดิบจาก CSV รูปแบบ d/m/yyyy
  endDate: string; // ดิบจาก CSV รูปแบบ d/m/yyyy
  price: number | null;
  seat: number | null;
  bookingBalance: number | null;
  visaRegularPrice: number | null;
  comStandard: string | null;
}

/** ข้อมูลพร้อมแสดง (หลังผ่าน Data Normalizer + Sale Status Mapper) */
export interface SchedulePeriod {
  id: string; // = tourCode
  internalId: string; // = tourCode-programCode-startDate-rowIndex (ใช้เป็น React key · Group Code อาจซ้ำได้)
  countryName: string;
  tourCode: string; // Group Code
  programCode: string | null; // แยกจากส่วนหน้า " : " ของ tourName (ไม่ใช่ groupCode)
  bus: string | null;
  tourName: string; // ชื่อดิบเต็ม (จาก CSV)
  displayName: string; // ชื่อที่ตัด programCode + [STATUS] ออกแล้ว
  incName: string | null; // ข้อความดิบใน IncName
  periodStatus: PeriodStatus; // ประเภทกรุ๊ป: INC หรือ COL เท่านั้น (แยกแกนกับสถานะขาย)
  systemNote: string | null; // ข้อความอื่นที่ไม่ใช่ INC/COL → "หมายเหตุจากระบบ"
  startDate: string; // ISO yyyy-mm-dd
  endDate: string; // ISO
  durationDays: number;
  price: number | null;
  seat: number | null;
  bookingBalance: number | null;
  bookingCount: number | null; // = seat − bookingBalance
  visaRegularPrice: number | null;
  comStandard: string | null;
  saleStatus: SaleStatus;
  airlineCode: string | null; // ท้าย tourCode
}
