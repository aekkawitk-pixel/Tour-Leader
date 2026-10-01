/**
 * Send-off Assignment Store — การจัดเจ้าหน้าที่ไปส่งกรุ๊ป
 *
 * คู่ขนานกับ guideAssignmentStore (การจัดหัวหน้าทัวร์) แต่คนละเรื่องกัน
 *   • หัวหน้าทัวร์  → ครองทั้งพีเรียด ไป-กลับหลายวัน
 *   • เจ้าหน้าที่ส่ง → ครองแค่ "ตอนไปส่ง" ในวันออกเดินทางวันเดียว
 * จึงแยกที่เก็บกัน ไม่เอามาปนในระเบียนเดียว
 *
 * จัดแล้ว = "รอคอนเฟิร์ม" ก่อนเสมอ (ดู SendOffAssignStatus ใน sendOffStaff.ts) — ผู้จัดตารางต้องกดยืนยัน
 * เองหลังคุยกับเจ้าหน้าที่นอกระบบแล้วเท่านั้นถึงจะกลายเป็น "คอนเฟิร์มแล้ว" ไม่มีสถานะ "ปฏิเสธ" แยก —
 * ถ้าเจ้าหน้าที่ไม่รับงาน ผู้จัดถอดคน (unassignSendOff) ไปหาคนใหม่เหมือนเดิม
 *
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import { SEND_OFF_ASSIGN_STATUS_DEFAULT, type SendOffAssignStatus } from '@/lib/logic/sendOffStaff';
import { readJson, writeJson } from './browserStorage';

export interface SendOffAssignment {
  assignmentId: string;
  /** อ้างอิง Tour Period Master (internalId) */
  periodId: string;
  /** อ้างอิงทะเบียนเจ้าหน้าที่ส่งกรุ๊ป (SOS-xxx) */
  staffId: string;
  /**
   * เวลาที่ต้องไปถึงสนามบิน ณ ตอนที่จัด (HH:MM) — null = ตอนนั้นยังไม่รู้เวลาเครื่องออก
   *
   * เก็บค่า ณ ตอนจัดไว้เพื่อให้เห็นสิ่งที่ผู้จัดเห็นตอนตัดสินใจ
   * ⚠️ ห้ามใช้เป็นค่าปัจจุบัน — เวลาบินอาจถูกแก้ที่ต้นทางหลังจากนั้น ให้คำนวณใหม่จากพีเรียดเสมอ
   */
  arrivalTime: string | null;
  /** -1 = ต้องไปตั้งแต่คืนก่อนวันเดินทาง */
  dayOffset: number;
  /** รอคอนเฟิร์ม → คอนเฟิร์มแล้ว — จัดแล้วยังไม่ใช่ตกลง ต้องให้ผู้จัดกดยืนยันหลังคุยกับเจ้าหน้าที่แล้วเท่านั้น */
  status: SendOffAssignStatus;
  assignedBy: string;
  assignedAt: string;
  /** เวลาที่กดยืนยัน — ยังไม่คอนเฟิร์ม = null */
  confirmedAt: string | null;
  confirmedBy?: string;
  note?: string;
}

const KEY = 'sendOffAssignments';

/**
 * การจัดทั้งหมด — ยังไม่เคยจัด = รายการว่าง (ไม่มีชุดตัวอย่าง)
 * รายการที่บันทึกไว้ก่อนมีสถานะ (ตอนนั้น "มี assignment" แปลว่าคอนเฟิร์มแล้วทันที) — เติมให้เป็นคอนเฟิร์มแล้ว
 * ไม่งั้นของเก่าจะกลายเป็นรอคอนเฟิร์มทั้งหมดทั้งที่ผู้จัดตกลงกับเจ้าหน้าที่ไปแล้วจริง ๆ
 */
export function loadSendOffAssignments(): SendOffAssignment[] {
  const parsed = readJson<SendOffAssignment[] | null>(KEY, null);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((r) => (r.status ? r : {
    ...r, status: 'CONFIRMED' as SendOffAssignStatus, confirmedAt: r.assignedAt, confirmedBy: r.assignedBy,
  }));
}

function save(rows: SendOffAssignment[]): SendOffAssignment[] {
  writeJson(KEY, rows);
  return rows;
}

/** เลขที่รายการถัดไป — SOA-001, SOA-002 … */
function nextId(rows: SendOffAssignment[]): string {
  const max = rows.reduce((acc, r) => {
    const n = Number(r.assignmentId.replace(/\D/g, ''));
    return Number.isFinite(n) && n > acc ? n : acc;
  }, 0);
  return `SOA-${String(max + 1).padStart(3, '0')}`;
}

/**
 * จัดเจ้าหน้าที่ไปส่งกรุ๊ปนี้ — เริ่มที่ "รอคอนเฟิร์ม" เสมอ ต้องกด confirmSendOff แยกอีกขั้นหลังคุยกับเจ้าหน้าที่แล้ว
 *
 * 1 กรุ๊ปมีคนไปส่งได้หลายคน (กรุ๊ปใหญ่บางกรุ๊ปต้องใช้มากกว่า 1 คน) — จัดคนใหม่ที่ยังไม่เคยอยู่ในกรุ๊ปนี้
 * คือ "เพิ่มคน" ไม่ใช่แทนที่ของเดิม ส่วนจัดคนเดิมซ้ำที่กรุ๊ปเดิม (คน+กรุ๊ปตรงกันทั้งคู่) ถือเป็น "จัดใหม่ทับของเดิม"
 * ของคนคนนั้นเท่านั้น (กันแถวซ้ำซ้อนของคนเดียวกัน ไม่กระทบแถวของคนอื่นในกรุ๊ปเดียวกัน)
 */
export function assignSendOff(input: {
  periodId: string;
  staffId: string;
  arrivalTime: string | null;
  dayOffset: number;
  by: string;
  at: string;
  note?: string;
}): SendOffAssignment[] {
  const rows = loadSendOffAssignments().filter((r) => !(r.periodId === input.periodId && r.staffId === input.staffId));
  rows.push({
    assignmentId: nextId(loadSendOffAssignments()),
    periodId: input.periodId,
    staffId: input.staffId,
    arrivalTime: input.arrivalTime,
    dayOffset: input.dayOffset,
    status: SEND_OFF_ASSIGN_STATUS_DEFAULT,
    assignedBy: input.by,
    assignedAt: input.at,
    confirmedAt: null,
    note: input.note,
  });
  return save(rows);
}

/**
 * ยืนยันว่าเจ้าหน้าที่รับงานแล้ว — กดหลังคุยกับเจ้าหน้าที่นอกระบบ (โทร/LINE) เสร็จเท่านั้น
 * ไม่มีพอร์ทัลให้เจ้าหน้าที่ส่งกรุ๊ปกดตอบรับเอง จึงเป็นผู้จัดตารางที่กดแทน (คนละแบบกับหัวหน้าทัวร์)
 */
export function confirmSendOff(assignmentId: string, by: string, at: string): SendOffAssignment[] {
  return save(loadSendOffAssignments().map((r) => (
    r.assignmentId === assignmentId ? { ...r, status: 'CONFIRMED' as SendOffAssignStatus, confirmedAt: at, confirmedBy: by } : r
  )));
}

/**
 * ยกเลิกคอนเฟิร์ม กลับไปเป็น "รอคอนเฟิร์ม" — ใช้เมื่อกดยืนยันผิดคนหรือเจ้าหน้าที่กลับคำทีหลัง
 * ไม่ใช่การถอดคน (unassignSendOff) — คนที่จัดไว้ยังเป็นคนเดิม แค่สถานะถอยกลับไปรอคอนเฟิร์มเท่านั้น
 */
export function unconfirmSendOff(assignmentId: string): SendOffAssignment[] {
  return save(loadSendOffAssignments().map((r) => (
    r.assignmentId === assignmentId ? { ...r, status: SEND_OFF_ASSIGN_STATUS_DEFAULT, confirmedAt: null, confirmedBy: undefined } : r
  )));
}

/**
 * ถอดเจ้าหน้าที่ออกจากกรุ๊ป — กรุ๊ปนั้นกลับไปอยู่แถว "ยังไม่มีคนไปส่ง"
 * ทางเดียวที่เปลี่ยนคนได้ — ไม่ว่าจะเพราะเจ้าหน้าที่แจ้งไม่รับงานหรือเหตุผลอื่น (ไม่ว่าจะยังรอคอนเฟิร์มหรือคอนเฟิร์มไปแล้ว) ผู้จัดถอดแล้วไปจัดใหม่เอง
 */
export function unassignSendOff(assignmentId: string): SendOffAssignment[] {
  return save(loadSendOffAssignments().filter((r) => r.assignmentId !== assignmentId));
}

/** ลบรายการที่อ้างพีเรียดซึ่งไม่มีอยู่แล้ว — ใช้หลังข้อมูลต้นทางเปลี่ยน */
export function clearOrphanSendOffAssignments(livePeriodIds: Set<string>): SendOffAssignment[] {
  return save(loadSendOffAssignments().filter((r) => livePeriodIds.has(r.periodId)));
}
