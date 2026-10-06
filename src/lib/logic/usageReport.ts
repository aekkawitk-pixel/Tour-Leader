/**
 * ใบเสร็จค่าใช้จ่ายจริงของหัวหน้าทัวร์ = "รายงานการใช้เงิน" ตามรายการในใบเบิกเงินทดรองของกรุ๊ป (EXPOP…)
 * ไม่ใช่เอกสารเบิกใบใหม่ — เงินจ่ายไปแล้วผ่านซอง จึงไม่มีขั้น อนุมัติ → รอจ่าย → จ่ายแล้ว
 * สถานะที่ใช้: รอตรวจ (submitted) · ให้แก้ไข (revise) · ตรวจแล้ว (approved) · ปฏิเสธ (rejected)
 * ส่วนต่าง (คืนเงิน / จ่ายส่วนที่เกิน) ไปจัดการตอนเคลียร์เงินกรุ๊ป
 */

import { EXPENSE_STATUS, type StatusMeta } from '../labels';
import type { ExpenseLine, ExpenseRequest, ExpenseStatus } from '@/types';
import { budgetItemsForGroup, budgetUseOfItem, type BudgetItem, type BudgetUse } from './groupBudget';

/**
 * ชื่อรายการสำหรับแสดง — หัวหน้าทัวร์บันทึกเป็น "<รายการเบิก> — <รายละเอียด>" บางทีสองฝั่งเหมือนกัน
 * (เช่น "ค่าทางด่วน — ค่าทางด่วน") → แสดงครั้งเดียว
 */
export function lineTitle(line: Pick<ExpenseLine, 'purpose' | 'expenseType'>): string {
  const text = (line.purpose || line.expenseType || '').trim();
  const [head, ...rest] = text.split(' — ');
  return rest.length === 1 && rest[0].trim() === head.trim() ? head.trim() : text;
}

/** เป็นรายงานการใช้เงินของหัวหน้าทัวร์หรือไม่ (ไม่ใช่เบี้ยเลี้ยง / ค่าส่งกรุ๊ป / เอกสารเบิกนำเข้า) */
export function isUsageReport(e: ExpenseRequest): boolean {
  return e.category === 'actual' && !e.sourceDoc && !e.claimMonth && e.requesterKind !== 'sendoff' && e.claimKind !== 'per_diem';
}

const USAGE_STATUS: Partial<Record<ExpenseStatus, StatusMeta>> = {
  submitted: { label: 'รอตรวจ', tone: 'violet' },
  approved: { label: 'ตรวจแล้ว', tone: 'green' },
};

/** ป้ายสถานะ — รายงานการใช้เงินใช้คำของตัวเอง · status ไม่ส่ง = สถานะปัจจุบัน (ส่งเพื่อแปลสถานะใน Timeline) */
export function expenseStatusMeta(e: ExpenseRequest, status: ExpenseStatus = e.status): StatusMeta {
  return (isUsageReport(e) ? USAGE_STATUS[status] : undefined) ?? EXPENSE_STATUS[status];
}

/** ใบเบิกเงินทดรองที่รายงานนี้อ้างอิง + ชื่อรายการเบิก (ตามลำดับที่พบ ไม่ซ้ำ) · ไม่ผูกรายการเบิก = ว่าง */
export function usageRefsOf(expenses: ExpenseRequest[], report: ExpenseRequest): { docIds: string[]; itemNames: string[] } {
  const ids = new Set(report.lines.map((l) => l.budgetLineId).filter(Boolean));
  const items = budgetItemsForGroup(expenses, report.jobId).filter((b) => ids.has(b.line.id));
  return {
    docIds: [...new Set(items.map((b) => b.expenseId))],
    itemNames: [...new Set(items.map((b) => b.line.purpose || b.line.expenseType))],
  };
}

/* ------------------------------------------------------------------ */
/* ตรวจทั้งกรุ๊ปในหน้าเดียว — จัดใบเสร็จตามรายการเบิก                       */
/* ------------------------------------------------------------------ */

const NO_EVIDENCE = new Set(['', 'ไม่มีหลักฐาน', 'รอแนบหลักฐาน']);

/** บรรทัดนี้มีหลักฐาน (รูป หรือไฟล์ที่แนบ) */
export function hasEvidence(line: ExpenseLine): boolean {
  return Boolean(line.evidenceImage) || !NO_EVIDENCE.has(line.evidenceFileName ?? '');
}

export interface UsageRow {
  report: ExpenseRequest;
  line: ExpenseLine;
  /** รอตรวจ และบรรทัดนี้ยังไม่ถูกตีตก */
  pending: boolean;
}

export interface UsageSection {
  /** รายการเบิก (null = นอกรายการเบิก) */
  item: BudgetItem | null;
  use: BudgetUse | null;
  rows: UsageRow[];
}

/**
 * ใบเสร็จทั้งกรุ๊ป จัดตามรายการในใบเบิกเงินทดรอง (ตามลำดับในใบเบิก) · ไม่ผูกรายการเบิก = หัวข้อท้ายสุด
 * idle = รายการเบิกที่ยังไม่มีใบเสร็จเลย (ให้ผู้ตรวจเห็นว่ายังขาดอะไร)
 */
export function groupUsageReview(expenses: ExpenseRequest[], groupId: string): { sections: UsageSection[]; idle: BudgetItem[] } {
  const rows: UsageRow[] = expenses
    .filter((e) => isUsageReport(e) && e.jobId === groupId && e.status !== 'draft' && e.status !== 'cancelled')
    .flatMap((report) => report.lines.map((line) => ({ report, line, pending: report.status === 'submitted' && !line.rejected })));
  const items = budgetItemsForGroup(expenses, groupId);
  const known = new Set(items.map((b) => b.line.id));
  const sections: UsageSection[] = items
    .map((item) => ({ item, use: budgetUseOfItem(expenses, groupId, item.line.id), rows: rows.filter((r) => r.line.budgetLineId === item.line.id) }))
    .filter((s) => s.rows.length > 0);
  const outside = rows.filter((r) => !r.line.budgetLineId || !known.has(r.line.budgetLineId));
  if (outside.length > 0) sections.push({ item: null, use: null, rows: outside });
  return { sections, idle: items.filter((b) => !rows.some((r) => r.line.budgetLineId === b.line.id)) };
}

/** key ของแถว (เลขบรรทัดซ้ำข้ามการส่งได้) */
export function usageRowKey(r: UsageRow): string {
  return `${r.report.id}|${r.line.id}`;
}

/** ผ่านได้ทันทีโดยไม่ต้องเปิดดู — รอตรวจ · มีหลักฐาน · รายการเบิกใช้ครบหรือไม่เกิน (เกิน / นอกรายการเบิก ต้องดูเอง) */
export function autoPassable(section: UsageSection, row: UsageRow): boolean {
  return row.pending && hasEvidence(row.line) && (section.use?.kind === 'full' || section.use?.kind === 'under');
}

/**
 * เลือกใบเสร็จ = เลือกทั้งการส่ง — ใบที่ส่งมาพร้อมกัน (การส่งเดียวกัน) ที่รอตรวจถูกเลือก/เอาออกไปด้วยกัน
 * (ตรวจผ่านเป็นหน่วยการส่ง จึงไม่มีกรณีเลือกครึ่ง ๆ) · คืน key ของทุกใบที่รอตรวจในการส่งที่เกี่ยวข้อง
 */
export function withSiblings(rows: UsageRow[], keys: Iterable<string>): string[] {
  const picked = new Set(keys);
  const reports = new Set(rows.filter((r) => picked.has(usageRowKey(r))).map((r) => r.report.id));
  return rows.filter((r) => r.pending && reports.has(r.report.id)).map(usageRowKey);
}

/** ใบที่เลือกให้ล่วงหน้า — การส่งที่ทุกใบรอตรวจผ่านได้ทันที (ไม่เกินงบ · มีหลักฐาน · อยู่ในรายการเบิก) */
export function autoReadyKeys(sections: UsageSection[]): string[] {
  const pairs = sections.flatMap((s) => s.rows.filter((r) => r.pending).map((r) => ({ r, ok: autoPassable(s, r) })));
  const blocked = new Set(pairs.filter((p) => !p.ok).map((p) => p.r.report.id));
  return pairs.filter((p) => !blocked.has(p.r.report.id)).map((p) => usageRowKey(p.r));
}

/**
 * ตรวจผ่านที่เลือก — ตรวจผ่านได้ทีละการส่ง (ทั้งการส่ง) จึงผ่านเฉพาะการส่งที่เลือกครบทุกบรรทัดที่รอตรวจ
 * เลือกไม่ครบ = partial (ให้เลือกให้ครบ หรือเปิดตรวจรายใบเพื่อตีตกบางบรรทัด)
 */
export function approvalPlan(rows: UsageRow[], selected: ReadonlySet<string>): { ready: string[]; partial: string[] } {
  const byReport = new Map<string, UsageRow[]>();
  for (const r of rows) if (r.pending) byReport.set(r.report.id, [...(byReport.get(r.report.id) ?? []), r]);
  const ready: string[] = [];
  const partial: string[] = [];
  for (const [id, rs] of byReport) {
    const n = rs.filter((r) => selected.has(usageRowKey(r))).length;
    if (n === rs.length) ready.push(id);
    else if (n > 0) partial.push(id);
  }
  return { ready, partial };
}

/* ------------------------------------------------------------------ */
/* รายการกรุ๊ป (แท็บค่าใช้จ่ายจริง) — 1 แถว = 1 กรุ๊ป รองรับหลักพันกรุ๊ป         */
/* ------------------------------------------------------------------ */

export type UsageGroupStatus = 'pending' | 'revise' | 'done';

export const USAGE_GROUP_STATUS: Record<UsageGroupStatus, StatusMeta> = {
  pending: { label: 'รอตรวจ', tone: 'violet' },
  // คำเดียวกับป้ายของใบเสร็จ (รอตรวจ / ให้แก้ไข / ตรวจแล้ว)
  revise: { label: 'ให้แก้ไข', tone: 'amber' },
  done: { label: 'ตรวจแล้ว', tone: 'green' },
};

export interface UsageGroupSummary {
  jobId: string;
  reports: ExpenseRequest[];
  /** ใบเสร็จ (บรรทัด) ทั้งหมดของกรุ๊ป · รอตรวจ · รอหัวหน้าทัวร์แก้ */
  receipts: number;
  pending: number;
  revise: number;
  /** รายการเบิกที่ใช้เกิน · ใบเสร็จนอกรายการเบิก */
  over: number;
  outside: number;
  /** ส่งล่าสุด (ISO) */
  latest: string;
  status: UsageGroupStatus;
}

const STATUS_ORDER: Record<UsageGroupStatus, number> = { pending: 0, revise: 1, done: 2 };

/**
 * สรุปรายงานการใช้เงินต่อกรุ๊ป — reports = รายงานที่ผ่านคำค้นแล้ว · all = ใบทั้งระบบ (ใช้หาใบเบิกเงินทดรองของกรุ๊ป)
 * จัดกลุ่มใบตามกรุ๊ปครั้งเดียว ไม่ไล่ทั้งระบบซ้ำทุกกรุ๊ป · เรียง: รอตรวจ → รอแก้ → ตรวจครบ แล้วส่งล่าสุดก่อน
 */
export function summarizeUsageGroups(reports: ExpenseRequest[], all: ExpenseRequest[]): UsageGroupSummary[] {
  const jobIds = new Set(reports.filter(isUsageReport).map((e) => e.jobId));
  const byJob = new Map<string, ExpenseRequest[]>();
  for (const e of all) if (jobIds.has(e.jobId)) byJob.set(e.jobId, [...(byJob.get(e.jobId) ?? []), e]);
  return [...jobIds]
    .map((jobId) => {
      const docs = byJob.get(jobId) ?? [];
      const { sections } = groupUsageReview(docs, jobId);
      const rows = sections.flatMap((s) => s.rows);
      const pending = rows.filter((r) => r.pending).length;
      const revise = rows.filter((r) => r.report.status === 'revise').length;
      const groupReports = [...new Set(rows.map((r) => r.report))];
      return {
        jobId,
        reports: groupReports,
        receipts: rows.length,
        pending,
        revise,
        over: sections.filter((s) => s.use?.kind === 'over').length,
        outside: sections.find((s) => !s.item)?.rows.length ?? 0,
        latest: groupReports.map((e) => e.submittedAt ?? e.requestedAt).sort().at(-1) ?? '',
        status: (pending > 0 ? 'pending' : revise > 0 ? 'revise' : 'done') as UsageGroupStatus,
      };
    })
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.latest.localeCompare(a.latest));
}

/** ใบเบิกเงินทดรองของทุกกรุ๊ป จัดเป็นดัชนีครั้งเดียว: รายการเบิก → เลขใบเบิก (ใช้ค้นหาด้วยเลข EXPOP โดยไม่ไล่ทั้งระบบทุกแถว) */
export function advanceDocIndex(all: ExpenseRequest[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of all) if (e.category === 'advance' && e.status !== 'rejected' && e.status !== 'cancelled') for (const l of e.lines) m.set(`${e.jobId}|${l.id}`, e.id);
  return m;
}
