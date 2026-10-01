/** กติกาการเปลี่ยนสถานะของแต่ละ workflow — แยกจาก UI เพื่อให้ย้ายไป backend ได้ทันที */

import type {
  AppointmentStatus,
  ExpenseStatus,
  JobStatus,
  SettlementStatus,
  StatusEvent,
} from '@/types';

/* -------------------------------- งานทัวร์ -------------------------------- */

const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['need_leader'],
  need_leader: ['offered', 'draft', 'cancelled'],
  offered: ['accepted', 'rejected', 'need_leader', 'cancelled'],
  rejected: ['offered', 'need_leader', 'cancelled'], // เสนอซ้ำคนเดิม หรือปล่อยกลับไปจัดคนใหม่
  accepted: ['traveling', 'need_leader', 'cancelled'],
  traveling: ['awaiting_settlement', 'cancelled'],
  awaiting_settlement: ['closed'],
  closed: [],
  cancelled: [], // กรุ๊ปถูกยกเลิก — ถ้ามีไกด์ Assign อยู่แล้ว ระบบจะบันทึกประวัติถูกยกเลิกงานให้อัตโนมัติ
};

export function nextJobStatuses(status: JobStatus): JobStatus[] {
  return JOB_TRANSITIONS[status];
}

/* -------------------------------- ใบเบิก --------------------------------- */

const EXPENSE_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'revise', 'rejected', 'cancelled'], // cancelled = ผู้ขอเบิกยกเลิกเอง (เช่น บันทึกซ้ำ)
  revise: ['submitted'],
  rejected: [],
  approved: ['awaiting_payment'],
  awaiting_payment: ['paid'],
  paid: [],
  cancelled: [],
};

export function nextExpenseStatuses(status: ExpenseStatus): ExpenseStatus[] {
  return EXPENSE_TRANSITIONS[status];
}

/* ------------------------------- เคลียร์งาน ------------------------------- */

const SETTLEMENT_TRANSITIONS: Record<SettlementStatus, SettlementStatus[]> = {
  awaiting_docs: ['under_review'],
  under_review: ['docs_incomplete', 'appointment_set', 'awaiting_settle_payment'],
  docs_incomplete: ['under_review'],
  appointment_set: ['awaiting_settle_payment', 'docs_incomplete'],
  awaiting_settle_payment: ['settled'],
  settled: ['closed'],
  closed: [],
};

export function nextSettlementStatuses(status: SettlementStatus): SettlementStatus[] {
  return SETTLEMENT_TRANSITIONS[status];
}

/* -------------------------------- นัดหมาย -------------------------------- */

const APPOINTMENT_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ['confirmed', 'rescheduled', 'cancelled'],
  confirmed: ['attended', 'rescheduled', 'cancelled'],
  rescheduled: ['confirmed', 'cancelled'],
  attended: [],
  cancelled: [],
};

export function nextAppointmentStatuses(status: AppointmentStatus): AppointmentStatus[] {
  return APPOINTMENT_TRANSITIONS[status];
}

/* ------------------------------ ประวัติสถานะ ------------------------------ */

let eventSeq = 0;

/** สร้างรายการประวัติสถานะ (จำลอง) */
export function makeStatusEvent(
  from: string | null,
  to: string,
  by: string,
  at: string,
  note?: string,
): StatusEvent {
  eventSeq += 1;
  return { id: `EVT-${Date.now()}-${eventSeq}`, at, from, to, by, note };
}
