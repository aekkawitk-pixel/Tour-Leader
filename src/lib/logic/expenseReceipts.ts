/**
 * ใบเบิกค่าใช้จ่ายจริงของหัวหน้าทัวร์ — ส่ง 1 ครั้ง = ใบเบิก 1 ใบ (เลข EXP เดียว) มีหลายใบเสร็จข้างใน
 *
 * หัวหน้าทัวร์บันทึกร่างทีละใบเสร็จ (ร่างละ 1 record) → "ส่งอนุมัติทั้งหมด" รวมร่างเป็นใบเบิกเดียว
 * ใช้เลขของร่างที่เลขน้อยสุด · ทุกบรรทัดจำว่ามาจากใบเสร็จไหน (ExpenseLine.receiptId = เลขร่างเดิม)
 * ใบเสร็จ 1 ใบมีได้หลายบรรทัด (ใช้วันที่ใบเสร็จ / รูปหลักฐาน / รายการเบิกที่ผูกร่วมกัน)
 * บัญชีตรวจในใบเดียว: อนุมัติทั้งใบ · ไม่อนุมัติบางบรรทัด · ส่งกลับแก้ทั้งใบโดยชี้ใบเสร็จที่ต้องแก้ (needsFix)
 */

import type { ExpenseLine, ExpenseRequest } from '@/types';

const byIdNumeric = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true });

/** รวมร่างใบเสร็จหลายใบเป็นใบเบิกเดียว (ยังเป็นร่าง — ผู้เรียกเปลี่ยนสถานะ/ต่อ history เอง) */
export function mergeDraftReceipts(drafts: ExpenseRequest[]): ExpenseRequest {
  const sorted = [...drafts].sort((a, b) => byIdNumeric(a.id, b.id));
  const base = sorted[0];
  const seen = new Set<string>();
  const lines: ExpenseLine[] = sorted.flatMap((d) =>
    d.lines.map((l, i) => {
      // หมายเหตุของร่าง → ติดไว้ที่บรรทัดแรกของใบเสร็จนั้น (ใบเบิกรวมไม่มีหมายเหตุรวม)
      const note = [l.note, i === 0 ? d.note?.trim() : ''].filter(Boolean).join(' · ');
      const id = seen.has(l.id) ? `${d.id}-${l.id}` : l.id;
      seen.add(id);
      return { ...l, id, receiptId: l.receiptId ?? d.id, ...(note ? { note } : {}) };
    }),
  );
  return {
    ...base,
    requestedAt: sorted.map((d) => d.requestedAt).sort()[0],
    lines,
    totalTHB: lines.reduce((s, l) => s + l.amountTHB, 0),
    note: '',
  };
}

export interface ReceiptGroup {
  /** receiptId ของบรรทัด ('' = ใบเบิกใบเสร็จเดียวแบบเดิม) */
  key: string;
  lines: ExpenseLine[];
}

/** แยกบรรทัดของใบเบิกตามใบเสร็จ — เรียงตามลำดับที่ปรากฏ */
export function receiptGroups(lines: ExpenseLine[]): ReceiptGroup[] {
  const out: ReceiptGroup[] = [];
  for (const l of lines) {
    const key = l.receiptId ?? '';
    const g = out.find((x) => x.key === key);
    if (g) g.lines.push(l);
    else out.push({ key, lines: [l] });
  }
  return out;
}

/** ใบเบิกนี้รวมหลายใบเสร็จหรือไม่ */
export function hasManyReceipts(expense: ExpenseRequest): boolean {
  return receiptGroups(expense.lines).length > 1;
}
