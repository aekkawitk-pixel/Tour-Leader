/**
 * อ่านไฟล์ "เอกสารเบิกค่าใช้จ่ายกรุ๊ป" (.xls ที่ export จากระบบเดิม เช่น EXPOP26090218.xls)
 *
 * โครงไฟล์ (ตำแหน่งคอลัมน์ไม่ตายตัว — หาจากป้ายกำกับเสมอ):
 *   หัวเอกสาร   : "พิมพ์โดย :", "วันที่พิมพ์ :", "ผู้ติดต่อ :", "วันที่เดินทาง :", "รหัสกรุ๊ป :", "Ref :",
 *                 "ชื่อรายการทัวร์ :", "Pax :" — ค่าอยู่ในเซลล์ถัดไปทางขวาที่ไม่ว่าง
 *   หัวตาราง    : แถวที่มี "No." · "รายการ" · "คำอธิบาย" · "จำนวน" · "ราคา / หน่วย" · "ส่วนลด" · "สกุลเงิน"
 *                 · "อัตราแลกเปลี่ยน" · "จำนวนเงินรวม"
 *   แถวหมวด     : ไม่มีเลข No. มีแค่ชื่อหมวดในคอลัมน์ "รายการ" (เช่น ค่าเข้าชมสถานที่)
 *   แถวรายการ   : มีเลข No.
 *   แถวยอดรวม   : มีแค่ตัวเลขในคอลัมน์ "จำนวนเงินรวม" → ใช้ตรวจว่าอ่านครบ
 *
 * ไม่ผูกกับ Store/UI — คืนผลลัพธ์ดิบ + คำเตือน ให้หน้านำเข้าแสดงตัวอย่างก่อนยืนยัน
 */

import { read, utils } from 'xlsx';

export interface ParsedAdvanceItem {
  no: number;
  category: string;
  purpose: string;
  description: string;
  quantity?: number;
  unitPrice?: number;
  discount: number;
  currency: string;
  fxRate: number;
  amount: number;
}

export interface ParsedAdvanceDoc {
  fileName: string;
  ref: string;
  groupCode: string;
  programName: string;
  travelDates: string;
  pax: string;
  printedBy: string;
  printedAt: string;
  contact: string;
  items: ParsedAdvanceItem[];
  /** ยอดรวมท้ายเอกสารตามไฟล์ (null = ไม่พบแถวยอดรวม) */
  fileTotal: number | null;
  /** ยอดรวมที่คำนวณจากรายการ แยกสกุลเงิน */
  totalsByCurrency: Record<string, number>;
  warnings: string[];
}

type Cell = string | number | boolean | null | undefined;

const text = (v: Cell) => (v === null || v === undefined ? '' : String(v)).replace(/\s+/g, ' ').trim();
const num = (v: Cell): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const t = text(v).replace(/,/g, '');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};
/** ป้ายกำกับแบบไม่สนช่องว่าง/โคลอน — "Ref : " ตรงกับ "Ref" */
const norm = (v: Cell) => text(v).replace(/[:\s]/g, '').toLowerCase();

function findLabelValue(rows: Cell[][], label: string): string {
  const want = norm(label);
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (norm(row[c]) !== want) continue;
      for (let k = c + 1; k < row.length; k++) {
        const v = text(row[k]);
        if (v) return v;
      }
      return '';
    }
  }
  return '';
}

export class AdvanceXlsError extends Error {}

export function parseAdvanceXls(data: ArrayBuffer, fileName: string): ParsedAdvanceDoc {
  let rows: Cell[][];
  try {
    const wb = read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: '' });
  } catch {
    throw new AdvanceXlsError('เปิดไฟล์ไม่ได้ — ต้องเป็นไฟล์ Excel (.xls / .xlsx)');
  }

  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'no.'));
  if (headerIdx < 0) throw new AdvanceXlsError('ไม่พบหัวตาราง "No." — ไม่ใช่รูปแบบเอกสารเบิกค่าใช้จ่ายกรุ๊ป');

  const header = rows[headerIdx];
  const col = (label: string) => header.findIndex((c) => norm(c) === norm(label));
  const C = {
    no: col('No.'),
    purpose: col('รายการ'),
    description: col('คำอธิบาย'),
    quantity: col('จำนวน'),
    unitPrice: col('ราคา / หน่วย'),
    discount: col('ส่วนลด'),
    currency: col('สกุลเงิน'),
    fxRate: col('อัตราแลกเปลี่ยน'),
    total: col('จำนวนเงินรวม'),
  };
  const missingCols = (['purpose', 'total'] as const).filter((k) => C[k] < 0);
  if (missingCols.length > 0) throw new AdvanceXlsError('หัวตารางไม่ครบ — ต้องมีคอลัมน์ "รายการ" และ "จำนวนเงินรวม"');

  const head = rows.slice(0, headerIdx);
  // สกุลเงินหลักของใบ เช่น "สกุลเงิน ( JPY)" ที่หัวเอกสาร — ใช้เมื่อแถวรายการไม่ระบุสกุลเงิน
  const docCurrency =
    head.flat().map(text).map((t) => /สกุลเงิน\s*\(\s*([A-Z]{3})\s*\)/.exec(t)?.[1]).find(Boolean) ?? 'THB';

  const get = (row: Cell[], idx: number) => (idx >= 0 ? row[idx] : undefined);
  const items: ParsedAdvanceItem[] = [];
  const warnings: string[] = [];
  let category = '';
  let fileTotal: number | null = null;

  for (const row of rows.slice(headerIdx + 1)) {
    const cells = row.map(text);
    if (cells.every((c) => !c)) continue;
    if (cells.some((c) => c === 'ผู้จัดทำ')) break; // ส่วนลงชื่อท้ายเอกสาร

    const no = num(get(row, C.no));
    const purpose = text(get(row, C.purpose));
    const total = num(get(row, C.total));

    if (no !== undefined && purpose) {
      const quantity = num(get(row, C.quantity));
      const unitPrice = num(get(row, C.unitPrice));
      const discount = num(get(row, C.discount)) ?? 0;
      const computed = quantity !== undefined && unitPrice !== undefined ? quantity * unitPrice - discount : undefined;
      const amount = total ?? computed ?? 0;
      if (computed !== undefined && total !== undefined && Math.abs(computed - total) > 0.01) {
        warnings.push(`รายการที่ ${no} (${purpose}): จำนวน × ราคา − ส่วนลด = ${computed} ไม่ตรงกับยอดรวมในไฟล์ ${total} — ใช้ยอดตามไฟล์`);
      }
      items.push({
        no,
        category: category || 'อื่น ๆ',
        purpose,
        description: text(get(row, C.description)),
        quantity,
        unitPrice,
        discount,
        currency: text(get(row, C.currency)) || docCurrency,
        fxRate: num(get(row, C.fxRate)) ?? 1,
        amount,
      });
      continue;
    }

    if (purpose && no === undefined && total === undefined) {
      category = purpose; // แถวหมวด
      continue;
    }

    if (!purpose && total !== undefined) fileTotal = total; // แถวยอดรวมท้ายตาราง
  }

  if (items.length === 0) throw new AdvanceXlsError('ไม่พบรายการในไฟล์');

  const totalsByCurrency: Record<string, number> = {};
  for (const it of items) totalsByCurrency[it.currency] = (totalsByCurrency[it.currency] ?? 0) + it.amount;
  const sum = items.reduce((s, it) => s + it.amount, 0);
  if (fileTotal !== null && Math.abs(sum - fileTotal) > 0.01) {
    warnings.push(`ยอดรวมรายการ ${sum} ไม่ตรงกับยอดรวมท้ายเอกสาร ${fileTotal} — ตรวจสอบว่าไฟล์ครบหรือไม่`);
  }

  const ref = findLabelValue(head, 'Ref');
  const groupCode = findLabelValue(head, 'รหัสกรุ๊ป').toUpperCase();
  if (!ref) warnings.push('ไม่พบเลขที่เอกสาร (Ref) — ระบบจะตั้งเลขให้จากชื่อไฟล์');
  if (!groupCode) warnings.push('ไม่พบรหัสกรุ๊ปในไฟล์ — ต้องเลือกกรุ๊ปเอง');

  return {
    fileName,
    ref: ref || fileName.replace(/\.[^.]+$/, ''),
    groupCode,
    programName: findLabelValue(head, 'ชื่อรายการทัวร์'),
    travelDates: findLabelValue(head, 'วันที่เดินทาง'),
    pax: findLabelValue(head, 'Pax'),
    printedBy: findLabelValue(head, 'พิมพ์โดย'),
    printedAt: findLabelValue(head, 'วันที่พิมพ์'),
    contact: findLabelValue(head, 'ผู้ติดต่อ'),
    items,
    fileTotal,
    totalsByCurrency,
    warnings,
  };
}
