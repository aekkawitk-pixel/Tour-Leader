/**
 * ช่วงของทริป — กติกาเดียวของทั้งระบบ (เดิมแต่ละหน้าเทียบวันเองไม่ตรงกัน: บางหน้าใช้ < บางหน้าใช้ <=)
 *
 *   ออกเดินทางแล้ว   = วันนี้ ≥ วันไป
 *   กำลังเดินทาง     = วันไป ≤ วันนี้ ≤ วันกลับ (รวมวันกลับ — วันนั้นยังอยู่ระหว่างทาง เครื่องอาจลงดึก)
 *   จบทริปแล้ว       = วันนี้ ≥ วันกลับ (รวมวันกลับ — ส่งอนุมัติเบี้ยเลี้ยง/เคลียร์เงิน/บันทึกย้อนหลังได้ตั้งแต่วันกลับ)
 *
 * วันกลับจึงเป็นทั้ง "กำลังเดินทาง" และ "จบทริปแล้ว" โดยตั้งใจ — กรุ๊ปขึ้นทั้งแท็บระหว่างทางและหลังเดินทาง
 * ในวันนั้น ไม่มีวันไหนที่กรุ๊ปหายไปจากทั้งสองแท็บ
 * วันกลับว่าง (ข้อมูลไม่ครบ) → ใช้วันไปแทน
 * วันที่ทั้งหมดเป็น ISO (yyyy-mm-dd) เทียบเป็นข้อความได้ตรง ๆ
 */

export interface TripDates {
  startDate: string;
  endDate?: string | null;
}

const returnDate = (p: TripDates) => p.endDate || p.startDate;

export function tripStarted(p: TripDates, today: string): boolean {
  return p.startDate <= today;
}

export function tripOngoing(p: TripDates, today: string): boolean {
  return p.startDate <= today && returnDate(p) >= today;
}

export function tripEnded(p: TripDates, today: string): boolean {
  return returnDate(p) <= today;
}
