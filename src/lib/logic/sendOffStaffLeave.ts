/**
 * วันลาของเจ้าหน้าที่ส่งกรุ๊ป — คำขอลา (ประเภท/ช่วงวัน/เหตุผล) พร้อมขั้นตอนอนุมัติ
 *
 * แยกจาก sendOffStaff.ts เพราะเป็นข้อมูล "เหตุการณ์" (บันทึกเพิ่มเรื่อย ๆ) คนละแบบกับ
 * ข้อมูลตัวเจ้าหน้าที่เอง (แก้ทับค่าเดิม) — ตรรกะล้วน ไม่แตะเบราว์เซอร์/เครือข่าย
 */

export type SendOffLeaveType = 'sick' | 'personal' | 'vacation' | 'other';

export const SEND_OFF_LEAVE_TYPE: Record<SendOffLeaveType, { label: string; tone: 'blue' | 'amber' | 'violet' | 'slate' }> = {
  sick: { label: 'ลาป่วย', tone: 'amber' },
  personal: { label: 'ลากิจ', tone: 'blue' },
  vacation: { label: 'ลาพักร้อน', tone: 'violet' },
  other: { label: 'อื่นๆ', tone: 'slate' },
};

export const SEND_OFF_LEAVE_TYPE_ORDER: SendOffLeaveType[] = ['sick', 'personal', 'vacation', 'other'];

/**
 * สถานะคำขอลา — คนละเรื่องกับสถานะจัดกรุ๊ป (การจัดกรุ๊ปไม่มีสถานะย่อยแล้ว จัดแล้ว = คอนเฟิร์มทันที)
 * เพิ่ม cancelled แยกจาก rejected เพราะความหมายต่างกัน: ปฏิเสธ = ผู้จัดไม่ให้ลา ส่วนยกเลิก = เจ้าตัว/ผู้จัดถอนคำขอเอง
 */
export type SendOffLeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export const SEND_OFF_LEAVE_STATUS: Record<SendOffLeaveStatus, { label: string; tone: 'amber' | 'green' | 'red' | 'slate'; note: string }> = {
  pending: { label: 'รอคอนเฟิร์ม', tone: 'amber', note: 'ยังไม่มีผล — รอผู้จัดตรวจสอบ' },
  approved: { label: 'คอนเฟิร์มแล้ว', tone: 'green', note: 'มีผลตามช่วงวันที่ระบุ' },
  rejected: { label: 'ปฏิเสธ', tone: 'red', note: 'ไม่มีผล — เจ้าหน้าที่ยังจัดกรุ๊ปในช่วงนี้ได้ตามปกติ' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'slate', note: 'ถอนคำขอแล้ว — ไม่มีผล' },
};

export const SEND_OFF_LEAVE_STATUS_ORDER: SendOffLeaveStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

export interface SendOffLeaveRecord {
  id: string;
  staffId: string;
  type: SendOffLeaveType;
  /** ช่วงวันที่ลา (ISO yyyy-mm-dd) — ลาวันเดียว startDate = endDate */
  startDate: string;
  endDate: string;
  reason: string;
  status: SendOffLeaveStatus;
  requestedBy: string;
  /** ISO datetime */
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

/** ลานี้คาบวันที่ระบุอยู่หรือไม่ (เทียบช่วงวันแบบรวมหัวท้าย) */
export function leaveCoversDate(r: Pick<SendOffLeaveRecord, 'startDate' | 'endDate'>, date: string): boolean {
  return date >= r.startDate && date <= r.endDate;
}

/** จำนวนวันลา (รวมหัวท้าย) — ใช้แสดงในรายการ */
export function leaveDayCount(r: Pick<SendOffLeaveRecord, 'startDate' | 'endDate'>): number {
  const start = new Date(`${r.startDate}T00:00:00`);
  const end = new Date(`${r.endDate}T00:00:00`);
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

/** รายการลาของคนคนนี้ — เรียงล่าสุดก่อน (วันที่ยื่นคำขอ) */
export function leaveRecordsForStaff(all: SendOffLeaveRecord[], staffId: string): SendOffLeaveRecord[] {
  return all.filter((r) => r.staffId === staffId).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}
