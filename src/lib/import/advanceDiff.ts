/**
 * เทียบใบเบิกฉบับใหม่ (จากไฟล์) กับฉบับเดิมที่มี Ref เดียวกันในระบบ — ใช้ตอนนำเข้า Ref ซ้ำ
 *
 * ปัญหาที่แก้: ใบเสร็จของหัวหน้าทัวร์ผูกกับรายการงบด้วย line id ถ้าสร้าง id จาก "Ref + ลำดับที่" ตรง ๆ
 * ฉบับแก้ไขที่แทรก/ลบรายการจะทำให้ลำดับเลื่อน → ใบเสร็จเดิมไปผูกผิดรายการเงียบ ๆ
 * จึงจับคู่รายการใหม่กับรายการเดิมด้วย "เนื้อหา" แล้วใช้ id เดิมต่อ (ใบเสร็จเดิมยังชี้ถูกรายการ)
 *
 * ลำดับการจับคู่:
 *   รอบ 1 — หมวด + รายการ + คำอธิบาย ตรงกันทุกตัว (ซ้ำกันหลายแถว = จับคู่ตามลำดับที่ปรากฏ)
 *   รอบ 2 — ที่เหลือ: หมวด + รายการ ตรงกัน (คำอธิบายเปลี่ยน เช่น "Hotel Koyo 2 คืน" → "3 คืน")
 *   ไม่เจอคู่ = รายการเพิ่มใหม่ (id ใหม่ที่ไม่ชนของเดิม) / รายการเดิมที่ไม่มีคู่ = ถูกลบ
 */

import type { ParsedAdvanceItem } from './advanceXls';
import type { ExpenseLine } from '@/types';

export interface AdvanceDiffChange {
  item: ParsedAdvanceItem;
  oldLine: ExpenseLine;
  /** สิ่งที่เปลี่ยน — ว่าง = เหมือนเดิม (อาจแค่ลำดับเลื่อน) */
  changes: string[];
  receipts: number;
}

export interface AdvanceDiff {
  /** line id ของรายการใหม่ทุกแถว เรียงตาม items — ใช้แทน "Ref-ลำดับ" ตอนสร้างใบเบิก */
  lineIds: string[];
  added: ParsedAdvanceItem[];
  removed: { line: ExpenseLine; receipts: number }[];
  /** จับคู่ได้และมีบางอย่างเปลี่ยน (ยอด / จำนวน / ราคา / คำอธิบาย / สกุลเงิน) */
  changed: AdvanceDiffChange[];
  unchangedCount: number;
  /** ใบเสร็จที่จะหลุดจากรายการเบิก (รายการที่ผูกอยู่ถูกลบในฉบับใหม่) */
  orphanedReceipts: number;
}

const clean = (v: string | undefined) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const keyFull = (category: string, purpose: string, description: string | undefined) =>
  `${clean(category)}|${clean(purpose)}|${clean(description)}`;
const keyLoose = (category: string, purpose: string) => `${clean(category)}|${clean(purpose)}`;

export function diffAdvanceDoc(
  ref: string,
  oldLines: ExpenseLine[],
  items: ParsedAdvanceItem[],
  /** จำนวนใบเสร็จที่ผูกกับ line id นี้อยู่ */
  receiptsFor: (lineId: string) => number,
): AdvanceDiff {
  const matchOf: (ExpenseLine | undefined)[] = items.map(() => undefined);
  const usedOld = new Set<string>();

  const pass = (keyItem: (it: ParsedAdvanceItem) => string, keyOld: (l: ExpenseLine) => string) => {
    items.forEach((it, i) => {
      if (matchOf[i]) return;
      const k = keyItem(it);
      const hit = oldLines.find((l) => !usedOld.has(l.id) && keyOld(l) === k);
      if (hit) {
        matchOf[i] = hit;
        usedOld.add(hit.id);
      }
    });
  };
  pass((it) => keyFull(it.category, it.purpose, it.description), (l) => keyFull(l.expenseType, l.purpose, l.description));
  pass((it) => keyLoose(it.category, it.purpose), (l) => keyLoose(l.expenseType, l.purpose));

  // id ใหม่ต้องไม่ชนกับ id เดิมทุกตัว (รวมที่ถูกลบ — ใบเสร็จเก่าอาจยังอ้างถึงอยู่)
  const taken = new Set(oldLines.map((l) => l.id));
  const freshId = (no: number) => {
    let id = `${ref}-${no}`;
    for (let n = 2; taken.has(id); n++) id = `${ref}-${no}-v${n}`;
    taken.add(id);
    return id;
  };

  const lineIds: string[] = [];
  const added: ParsedAdvanceItem[] = [];
  const changed: AdvanceDiffChange[] = [];
  let unchangedCount = 0;

  items.forEach((it, i) => {
    const old = matchOf[i];
    if (!old) {
      lineIds.push(freshId(it.no));
      added.push(it);
      return;
    }
    lineIds.push(old.id);
    const changes: string[] = [];
    if (old.amount !== it.amount) changes.push(`ยอด ${old.amount} → ${it.amount}`);
    if (old.currency !== it.currency) changes.push(`สกุลเงิน ${old.currency} → ${it.currency}`);
    if ((old.quantity ?? null) !== (it.quantity ?? null)) changes.push(`จำนวน ${old.quantity ?? '—'} → ${it.quantity ?? '—'}`);
    if ((old.unitPrice ?? null) !== (it.unitPrice ?? null)) changes.push(`ราคา/หน่วย ${old.unitPrice ?? '—'} → ${it.unitPrice ?? '—'}`);
    if (clean(old.description) !== clean(it.description)) changes.push(`คำอธิบาย "${old.description ?? ''}" → "${it.description}"`);
    if (changes.length > 0) changed.push({ item: it, oldLine: old, changes, receipts: receiptsFor(old.id) });
    else unchangedCount++;
  });

  const removed = oldLines.filter((l) => !usedOld.has(l.id)).map((line) => ({ line, receipts: receiptsFor(line.id) }));

  return {
    lineIds,
    added,
    removed,
    changed,
    unchangedCount,
    orphanedReceipts: removed.reduce((s, r) => s + r.receipts, 0),
  };
}
