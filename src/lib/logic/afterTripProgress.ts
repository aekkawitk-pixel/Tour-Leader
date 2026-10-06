/**
 * ความคืบหน้าหลังเดินทางของแต่ละกรุ๊ป — ใช้ที่แท็บ "หลังเดินทาง" (หน้าบัญชี-การเงิน ฝั่งหัวหน้าทัวร์)
 * บอกว่ากรุ๊ปไหนค้างขั้นไหน และขั้นต่อไปต้องทำอะไร โดยไม่ต้องเปิดดูทีละหน้า
 *
 * ลำดับขั้น: ใบเสร็จ → เบี้ยเลี้ยง → นัดเคลียร์เงิน (ทำครบแล้วหัวหน้าทัวร์ขอนัดเองได้ที่หน้าตรวจสอบ · หรือการเงินนัดมา แล้วหัวหน้าทัวร์ยืนยัน)
 * กรุ๊ปที่การเงินปิดเคลียร์แล้ว = เสร็จ ไม่ต้องแสดงในรายการค้าง
 */

import type { Appointment, ExpenseRequest } from '@/types';

export type StepState = 'todo' | 'action' | 'waiting' | 'done';

export interface AfterTripStep {
  label: string;
  value: string;
  state: StepState;
}

export interface AfterTripProgress {
  steps: AfterTripStep[];
  /** ขั้นต่อไป — มี href = หัวหน้าทัวร์ต้องทำ · ไม่มี = รอฝั่งการเงิน/บัญชี */
  next: { label: string; href?: string };
  /** บันทึกใบเสร็จของกรุ๊ปนี้ — มีให้กดเสมอ (ไม่มีใบเสร็จเลยก็ได้ จึงไม่บังคับเป็นขั้น) */
  recordHref: string;
}

export function afterTripProgress(input: {
  periodId: string;
  /** ใบเสร็จค่าใช้จ่ายของกรุ๊ปนี้ (ไม่รวมที่ยกเลิก) */
  receipts: ExpenseRequest[];
  /** ใบเบิกเบี้ยเลี้ยงที่ยังมีผล — null = ยังไม่ทำ */
  perDiem: ExpenseRequest | null;
  /** นัดเคลียร์เงินของกรุ๊ปนี้ (ไม่รวมที่ยกเลิก) — ล่าสุดก่อน */
  clearAppointment: Appointment | null;
  formatWhen: (a: Appointment) => string;
}): AfterTripProgress {
  const { periodId, receipts, perDiem, clearAppointment: apt } = input;
  const recordHref = `/guide/expenses/record?filter=after&period=${encodeURIComponent(periodId)}`;

  // 1) ใบเสร็จ
  const revise = receipts.filter((r) => r.status === 'revise').length;
  const receiptStep: AfterTripStep = revise > 0
    ? { label: 'ใบเสร็จ', value: `${receipts.length} รายการ · ต้องแก้ ${revise}`, state: 'action' }
    : { label: 'ใบเสร็จ', value: receipts.length > 0 ? `${receipts.length} รายการ` : 'ยังไม่มี', state: receipts.length > 0 ? 'done' : 'todo' };

  // 2) เบี้ยเลี้ยง
  const perDiemStep: AfterTripStep = !perDiem
    ? { label: 'เบี้ยเลี้ยง', value: 'ยังไม่ทำ', state: 'todo' }
    : perDiem.status === 'draft' ? { label: 'เบี้ยเลี้ยง', value: 'ร่าง ยังไม่ส่ง', state: 'action' }
    : perDiem.status === 'revise' ? { label: 'เบี้ยเลี้ยง', value: 'ต้องแก้ไข', state: 'action' }
    : perDiem.status === 'submitted' ? { label: 'เบี้ยเลี้ยง', value: 'รอบัญชีตรวจ', state: 'waiting' }
    : { label: 'เบี้ยเลี้ยง', value: perDiem.status === 'paid' ? 'จ่ายแล้ว' : 'อนุมัติแล้ว', state: 'done' };

  // 3) นัดเคลียร์เงิน — การเงินเป็นผู้นัด
  const aptStep: AfterTripStep = !apt
    ? { label: 'นัดเคลียร์', value: 'ยังไม่นัด', state: 'todo' }
    : apt.status === 'pending' && apt.requestedByLeader ? { label: 'นัดเคลียร์', value: `${input.formatWhen(apt)} · รอการเงินยืนยัน`, state: 'waiting' }
    : apt.status === 'pending' ? { label: 'นัดเคลียร์', value: `${input.formatWhen(apt)} · รอคุณยืนยัน`, state: 'action' }
    : apt.status === 'attended' ? { label: 'นัดเคลียร์', value: 'เข้าพบแล้ว', state: 'done' }
    : { label: 'นัดเคลียร์', value: `${input.formatWhen(apt)}${apt.status === 'rescheduled' ? ' · ขอเลื่อนแล้ว' : ''}`, state: 'waiting' };

  const steps = [receiptStep, perDiemStep, aptStep];

  // ขั้นต่อไป — ไล่ตามลำดับ เจอเรื่องที่หัวหน้าทัวร์ต้องทำก่อนชนะ
  let next: AfterTripProgress['next'];
  if (revise > 0) next = { label: 'แก้ไขใบเสร็จ', href: `/guide/settlement/claim?period=${encodeURIComponent(periodId)}` };
  // นัดรอยืนยันมีวันเวลากำกับ — ต้องตอบก่อนเรื่องอื่นที่ไม่มีกำหนด
  else if (apt?.status === 'pending' && !apt.requestedByLeader) next = { label: 'ยืนยันนัดเคลียร์เงิน', href: '/guide/settlement/appointments' };
  else if (!perDiem || perDiem.status === 'draft' || perDiem.status === 'revise') next = { label: perDiem ? 'ส่งใบเบิกเบี้ยเลี้ยง' : 'เบิกเบี้ยเลี้ยง', href: '/guide/settlement/allowance' };
  // ส่งเบี้ยเลี้ยงแล้ว ยังไม่มีนัด → ไปหน้าตรวจสอบ (เช็กครบทุกหัวข้อ แล้วกดนัดเคลียร์เงินได้ที่นั่น)
  else if (!apt) next = { label: 'นัดเคลียร์เงิน', href: `/guide/settlement/claim?period=${encodeURIComponent(periodId)}` };
  else if (apt.status === 'pending') next = { label: 'รอการเงินยืนยันนัด' };
  else if (apt.status === 'attended') next = { label: 'รอการเงินปิดเคลียร์' };
  else next = { label: `เข้าพบตามนัด ${input.formatWhen(apt)}` };

  return { steps, next, recordHref };
}
