/**
 * Guide Assignment Store (§7) — เก็บ "การจัดหัวหน้าทัวร์" อ้างอิง Tour Period Master ด้วย periodId เท่านั้น
 *
 * ห้ามเก็บข้อมูลพีเรียดซ้ำ (groupCode/tourName/วันเดินทาง/บัส/airline ฯลฯ) — Join จาก Master ทุกครั้ง (§7)
 * assignmentId = GA-<role>-<periodId> (deterministic · 1 lead ต่อ 1 พีเรียด) — reassign คง id เดิม
 * Persist ใน localStorage (SSR-safe) · ไม่เก็บข้อมูลสำคัญ · Invalidate ได้เมื่อ Master เปลี่ยน
 */

import type { BoardStatus } from '@/lib/logic/guideBoard';

export type AssignmentBoardStatus = Exclude<BoardStatus, 'UNASSIGNED'>;

/** Snapshot พีเรียด ณ เวลามอบหมาย (§7 เก็บเพื่อ Audit/ตรวจการเปลี่ยนแปลง — ไม่ใช่ข้อมูลปัจจุบัน) */
export interface PeriodSnapshot {
  startDate: string;
  endDate: string;
  bus: string | null;
  countryName: string;
  saleStatus: string;
}

export interface GuidePeriodAssignment {
  assignmentId: string;
  periodId: string; // อ้างอิง Tour Period Master
  tourLeaderId: string;
  role: 'lead' | 'assistant';
  assignmentStatus: AssignmentBoardStatus;
  assignedBy: string;
  assignedAt: string;
  confirmedAt: string | null;
  note?: string;
  /** เหตุผลที่ผู้จัดตั้ง “ต้องเปลี่ยนหัวหน้าทัวร์” (ใช้คู่กับ assignmentStatus = REASSIGN_REQUIRED) */
  reassignReason?: string;
  /** §7 Snapshot สำหรับ Audit/ตรวจ Master เปลี่ยน (§9) — ห้ามใช้เป็นข้อมูลปัจจุบัน */
  snapshot?: PeriodSnapshot;
  /**
   * หัวหน้าทัวร์เปิดดูรายละเอียดงานนี้แล้วเมื่อไร — ว่าง = ยังไม่เคยเปิด (ขึ้นเป็น "ได้รับงานใหม่" ในกระดิ่ง)
   * เก็บไว้กับตัวงาน ไม่ใช่กับเครื่อง — เมื่อย้ายข้อมูลไปฐานข้อมูลกลางจะจำข้ามเครื่องได้ทันที
   * เปลี่ยนหัวหน้าทัวร์ = ล้างค่า (คนใหม่ยังไม่เคยเห็น)
   */
  leaderSeenAt?: string;

  /* ---- การถอดหัวหน้าทัวร์ (§5/§6) — ถอดแล้วยัง "เก็บ Record ไว้" ไม่ลบทิ้ง ---- */
  /** เวลาที่ถูกถอด — มีค่า = ถอดแล้ว (ไม่นับเป็นงานที่ครองเวลาของหัวหน้าทัวร์อีกต่อไป) */
  removedAt?: string;
  removedBy?: string;
  removedReason?: string;
  /** สถานะการจัดก่อนถูกถอด (เก็บไว้ตรวจย้อนหลัง §6) */
  statusBeforeRemove?: AssignmentBoardStatus;
  /** สถานะขายของพีเรียด ณ เวลาที่ถอด — ใช้แยกว่าถอดเพราะ NO SELL หรือเหตุอื่น */
  saleStatusAtRemove?: string;
}

/** ข้อความเดียวที่ใช้ทั้งระบบเมื่อปฏิเสธการจัดงานให้พีเรียด NO SELL */
export const NO_SELL_ASSIGN_ERROR = 'ไม่สามารถจัดหัวหน้าทัวร์ได้ เนื่องจากโปรแกรมนี้มีสถานะขายเป็น NO SELL';

/** ผลของการบันทึก — ปฏิเสธได้พร้อมเหตุผล (UI ต้องไม่ขึ้นว่าบันทึกสำเร็จเมื่อ ok = false) */
export type AssignResult =
  | { ok: true; rows: GuidePeriodAssignment[] }
  | { ok: false; error: string; rows: GuidePeriodAssignment[] };

export interface GuideAssignmentAudit {
  id: string;
  assignmentId: string;
  periodId: string;
  action: 'assign' | 'reassign' | 'status' | 'unassign';
  tourLeaderId: string | null;
  from?: string | null;
  to?: string | null;
  by: string;
  at: string;
  reason?: string;
}

const ASSIGN_KEY = 'guidePeriodAssignments';
const AUDIT_KEY = 'guidePeriodAssignmentAudit';

function canUseStorage(): boolean {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}
function readJSON<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch { return fallback; }
}
function writeJSON(key: string, value: unknown): void {
  if (!canUseStorage()) return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota/private mode */ }
}

/** ทุก Assignment รวมรายการที่ถูกถอดแล้ว — ใช้กับประวัติ/ตรวจย้อนหลังเท่านั้น */
export function loadGuideAssignments(): GuidePeriodAssignment[] {
  return readJSON<GuidePeriodAssignment[]>(ASSIGN_KEY, []);
}

/**
 * §3 Soft delete — รายการที่ "ยังมีผล" คือรายการที่ยังไม่ถูกถอดออก
 * รายการที่ถอดแล้วมี removedAt เสมอ (เก็บไว้เพื่อตรวจย้อนหลัง ไม่ใช่งานที่ใช้งานอยู่)
 */
function isActive(a: GuidePeriodAssignment): boolean {
  return !a.removedAt;
}

/**
 * §1 Assignment ที่ยัง "มีผล" — แหล่งข้อมูลเดียวของทุกหน้าจอที่แสดงตาราง/นับงาน/ตรวจงานชน
 *
 * ทุกฟังก์ชันที่เขียนข้อมูลก็คืนค่าผ่านตัวกรองชุดเดียวกันนี้ (activeRows) — ผู้เรียกจึงเอาผลลัพธ์
 * ไปตั้ง state ได้ตรง ๆ โดยไม่มีทางเผลอนำรายการที่ถอดแล้วกลับมาแสดง
 * ประวัติของรายการที่ถอดแล้วอ่านได้ที่ loadGuideAssignments() และ Audit Log เท่านั้น
 */
export function loadActiveGuideAssignments(): GuidePeriodAssignment[] {
  return activeRows(loadGuideAssignments());
}

/** กรอง + กันรายการซ้ำ assignmentId (เก็บรายการหลังสุด) ก่อนส่งให้ผู้เรียกไป render */
function activeRows(rows: GuidePeriodAssignment[]): GuidePeriodAssignment[] {
  const byId = new Map<string, GuidePeriodAssignment>();
  for (const a of rows) if (isActive(a)) byId.set(a.assignmentId, a);
  return [...byId.values()];
}

/** ตรวจว่าพีเรียดนี้จัดหัวหน้าทัวร์ได้หรือไม่ — ชั้นบันทึก (ไม่พึ่งการซ่อนที่ UI) */
function rejectIfNoSell(saleStatus: string | undefined | null): string | null {
  return String(saleStatus ?? '').toUpperCase().replace(/[\s-]/g, '_') === 'NO_SELL' ? NO_SELL_ASSIGN_ERROR : null;
}
export function loadGuideAssignmentAudit(): GuideAssignmentAudit[] {
  return readJSON<GuideAssignmentAudit[]>(AUDIT_KEY, []);
}

function appendAudit(entry: Omit<GuideAssignmentAudit, 'id'>): void {
  const all = loadGuideAssignmentAudit();
  all.push({ ...entry, id: `AUD-${all.length + 1}-${entry.assignmentId}` });
  writeJSON(AUDIT_KEY, all);
}

/**
 * มอบหมายพีเรียดให้หัวหน้าทัวร์ (สร้าง/แทนที่ lead) — สถานะเริ่ม "รอคอนเฟิร์ม"
 *
 * ตรวจสถานะขายซ้ำที่ชั้นบันทึกเสมอ — หน้าจอที่เปิดค้างไว้หรือข้อมูลเก่าจะจัดงานให้พีเรียด
 * NO SELL ไม่ได้ แม้ UI จะยอมให้กด (ปฏิเสธการบันทึกและคืนเหตุผลกลับไป)
 * สถานะขายอ่านจาก snapshot ที่ผู้เรียกอ่านมาจาก Master ณ ตอนกดบันทึก
 */
export function assignPeriod(periodId: string, tourLeaderId: string, by: string, at: string, note?: string, snapshot?: PeriodSnapshot): AssignResult {
  const all = loadGuideAssignments();
  const rejected = rejectIfNoSell(snapshot?.saleStatus);
  if (rejected) return { ok: false, error: rejected, rows: activeRows(all) };

  const assignmentId = `GA-lead-${periodId}`;
  const existing = all.find((a) => a.assignmentId === assignmentId);
  const rec: GuidePeriodAssignment = {
    assignmentId, periodId, tourLeaderId, role: 'lead',
    // มอบหมายแล้วถือว่าคอนเฟิร์มทันที — ไม่มีขั้นตอนรอคอนเฟิร์มแยกต่างหากอีกต่อไป
    assignmentStatus: 'CONFIRMED', assignedBy: by, assignedAt: at, confirmedAt: at, note, snapshot,
  };
  // จัดใหม่ให้พีเรียดที่เคยถอดไป → เริ่มรายการใหม่ ไม่สืบทอดร่องรอยการถอดเดิม (ประวัติอยู่ที่ Audit)
  const next = existing ? all.map((a) => (a.assignmentId === assignmentId ? rec : a)) : [...all, rec];
  writeJSON(ASSIGN_KEY, next);
  appendAudit({ assignmentId, periodId, action: existing ? 'reassign' : 'assign', tourLeaderId, from: existing?.tourLeaderId ?? null, to: tourLeaderId, by, at, reason: note });
  return { ok: true, rows: activeRows(next) };
}

/** เปลี่ยนหัวหน้าทัวร์ของ assignment เดิม (drag/เปลี่ยนคน) — ต้องคอนเฟิร์มใหม่ · พีเรียด NO SELL ห้ามเปลี่ยนคน */
export function reassignPeriod(assignmentId: string, newLeaderId: string, by: string, at: string, reason: string, saleStatus?: string): AssignResult {
  const all = loadGuideAssignments();
  // ต้องเป็นรายการที่ยังมีผลเท่านั้น — รายการที่ถอดไปแล้วห้ามถูกปลุกกลับมาด้วยการเปลี่ยนคน
  const cur = all.find((a) => a.assignmentId === assignmentId && isActive(a));
  if (!cur) return { ok: false, error: 'ไม่พบรายการมอบหมายที่ยังใช้งานอยู่', rows: activeRows(all) };
  const rejected = rejectIfNoSell(saleStatus ?? cur.snapshot?.saleStatus);
  if (rejected) return { ok: false, error: rejected, rows: activeRows(all) };

  // เปลี่ยนหัวหน้าทัวร์แล้วถือว่าคอนเฟิร์มทันทีเช่นกัน — สอดคล้องกับ assignPeriod
  const next = all.map((a) => (a.assignmentId === assignmentId ? { ...a, tourLeaderId: newLeaderId, assignmentStatus: 'CONFIRMED' as const, confirmedAt: at, assignedBy: by, assignedAt: at, reassignReason: undefined, leaderSeenAt: undefined } : a));
  writeJSON(ASSIGN_KEY, next);
  appendAudit({ assignmentId, periodId: cur.periodId, action: 'reassign', tourLeaderId: newLeaderId, from: cur.tourLeaderId, to: newLeaderId, by, at, reason });
  return { ok: true, rows: activeRows(next) };
}

/** เปลี่ยนสถานะการจัด (คอนเฟิร์ม/ปฏิเสธ/ต้องเปลี่ยน) */
export function setAssignmentStatus(assignmentId: string, status: AssignmentBoardStatus, by: string, at: string, reason?: string): GuidePeriodAssignment[] {
  const all = loadGuideAssignments();
  const cur = all.find((a) => a.assignmentId === assignmentId && isActive(a));
  if (!cur) return activeRows(all); // ถอดไปแล้ว/ไม่มีอยู่ → ไม่ทำอะไรและไม่ปลุกกลับมา
  // เหตุผล “ต้องเปลี่ยนหัวหน้าทัวร์” เก็บเฉพาะตอนอยู่สถานะนั้น — เปลี่ยนเป็นสถานะอื่นแล้วล้างทิ้ง
  const next = all.map((a) => (a.assignmentId === assignmentId
    ? { ...a, assignmentStatus: status, confirmedAt: status === 'CONFIRMED' ? at : a.confirmedAt, reassignReason: status === 'REASSIGN_REQUIRED' ? reason : undefined }
    : a));
  writeJSON(ASSIGN_KEY, next);
  appendAudit({ assignmentId, periodId: cur.periodId, action: 'status', tourLeaderId: cur.tourLeaderId, from: cur.assignmentStatus, to: status, by, at, ...(reason ? { reason } : {}) });
  return activeRows(next);
}

/** แจ้งให้กระดิ่งของพอร์ทัลหัวหน้าทัวร์นับใหม่ทันทีหลังเปิดดูงาน */
export const ASSIGNMENT_SEEN_EVENT = 'guide-assignment-seen';

/** หัวหน้าทัวร์เปิดดูรายละเอียดงานแล้ว — ไม่ใช่ "งานใหม่" อีก · ไม่ลง Audit (ไม่ใช่การเปลี่ยนแปลงการจัดงาน) */
export function markAssignmentSeen(assignmentId: string, at: string): void {
  const all = loadGuideAssignments();
  const cur = all.find((a) => a.assignmentId === assignmentId && isActive(a));
  if (!cur || cur.leaderSeenAt) return;
  writeJSON(ASSIGN_KEY, all.map((a) => (a.assignmentId === assignmentId ? { ...a, leaderSeenAt: at } : a)));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(ASSIGNMENT_SEEN_EVENT));
}

/** รับทราบการเปลี่ยนแปลงจากต้นทาง (§9) — อัปเดต snapshot ให้ตรง Master ปัจจุบัน + บันทึก Audit */
export function acknowledgeChange(assignmentId: string, snapshot: PeriodSnapshot, by: string, at: string): GuidePeriodAssignment[] {
  const all = loadGuideAssignments();
  const cur = all.find((a) => a.assignmentId === assignmentId && isActive(a));
  if (!cur) return activeRows(all); // ถอดไปแล้ว/ไม่มีอยู่ → ไม่ทำอะไรและไม่ปลุกกลับมา
  const next = all.map((a) => (a.assignmentId === assignmentId ? { ...a, snapshot } : a));
  writeJSON(ASSIGN_KEY, next);
  appendAudit({ assignmentId, periodId: cur.periodId, action: 'status', tourLeaderId: cur.tourLeaderId, from: 'MASTER_CHANGED', to: 'ACKNOWLEDGED', by, at });
  return activeRows(next);
}

/**
 * ถอดหัวหน้าทัวร์ออกจากพีเรียด — พีเรียดกลับเป็น "ยังไม่ระบุหัวหน้าทัวร์"
 *
 * ⚠️ ไม่ลบ Record ออกจากที่เก็บ — ทำเครื่องหมาย removedAt/removedBy/เหตุผล ไว้แทน
 * เพื่อให้ตรวจสอบย้อนหลังได้ว่าใครเคยถูกจัด สถานะก่อนถอดคืออะไร และถอดเพราะอะไร
 * รายการที่ถอดแล้วจะไม่ถูกนับเป็นงานอีก ช่วงเวลาของหัวหน้าทัวร์จึงกลับมาว่างทันที
 */
export function unassignPeriod(assignmentId: string, by: string, at: string, reason?: string, saleStatusAtRemove?: string): GuidePeriodAssignment[] {
  const all = loadGuideAssignments();
  const cur = all.find((a) => a.assignmentId === assignmentId && isActive(a));
  if (!cur) return activeRows(all); // ถอดไปแล้ว/ไม่มีอยู่ → ไม่ทำอะไรและไม่ปลุกกลับมา
  const next = all.map((a) => (a.assignmentId === assignmentId
    ? { ...a, removedAt: at, removedBy: by, removedReason: reason, statusBeforeRemove: a.assignmentStatus, saleStatusAtRemove }
    : a));
  writeJSON(ASSIGN_KEY, next);
  appendAudit({ assignmentId, periodId: cur.periodId, action: 'unassign', tourLeaderId: cur.tourLeaderId, from: cur.assignmentStatus, to: null, by, at, reason });
  return activeRows(next);
}
