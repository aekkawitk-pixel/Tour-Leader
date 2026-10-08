/**
 * ใบเบิกเงินทดรองที่นำเข้าจากไฟล์ "เอกสารเบิกค่าใช้จ่ายกรุ๊ป" (.xls)
 *
 * ใบเบิกทั่วไปใน Demo อยู่ในหน่วยความจำเท่านั้น (refresh แล้วกลับเป็นข้อมูลตั้งต้น) แต่ใบที่นำเข้าเก็บลง
 * localStorage — ตั้งใจให้เป็นข้อมูลตัวอย่างของแต่ละกรุ๊ปที่อยู่ถาวร ไม่ต้องนำเข้าซ้ำทุกครั้งที่เปิดหน้า
 * เก็บแยก Key ของตัวเอง แล้ว DemoStore ทาบลงบนรายการใบเบิกตอนโหลด (id ซ้ำ = ใช้ของที่นำเข้า)
 */

import { toISODateTime, shortDateToISO } from '@/lib/format';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { ADVANCE_SAMPLE_DOCS } from '@/data/advanceSamples';
import type { ParsedAdvanceDoc } from '@/lib/import/advanceXls';
import type { ExpenseRequest } from '@/types';

export const ADVANCE_IMPORT_STORAGE_KEY = 'importedAdvanceDocs';

function canUseStorage(): boolean {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

/** เลข Ref ซ้ำในชุดเดียวกัน (เช่น เลือก 2 ไฟล์ที่เป็น Ref เดียวกัน) → เหลือใบเดียว ฉบับหลังสุดชนะ */
export function uniqueAdvanceDocs(docs: ExpenseRequest[]): ExpenseRequest[] {
  return [...new Map(docs.map((d) => [d.id, d])).values()];
}

export function loadImportedAdvanceDocs(): ExpenseRequest[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(ADVANCE_IMPORT_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // ข้อมูลเก่าอาจมี Ref ซ้ำค้างอยู่ (ก่อนแก้) — ตัดตอนอ่าน
    return Array.isArray(parsed) ? uniqueAdvanceDocs(parsed as ExpenseRequest[]) : [];
  } catch { return []; }
}

/** บันทึกแบบ upsert ตาม id (เลข Ref) — นำเข้าไฟล์เดิมซ้ำ = แทนที่ของเดิม ไม่เกิดใบซ้ำ */
export function upsertImportedAdvanceDocs(input: ExpenseRequest[]): ExpenseRequest[] {
  const docs = uniqueAdvanceDocs(input);
  const ids = new Set(docs.map((d) => d.id));
  const next = [...docs, ...loadImportedAdvanceDocs().filter((d) => !ids.has(d.id))];
  if (canUseStorage()) {
    // quota เต็ม → throw ให้ผู้เรียกแจ้งผู้ใช้ ไม่แสดงว่าสำเร็จทั้งที่ไม่ได้บันทึก
    window.localStorage.setItem(ADVANCE_IMPORT_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function removeImportedAdvanceDoc(id: string): void {
  if (!canUseStorage()) return;
  const next = loadImportedAdvanceDocs().filter((d) => d.id !== id);
  window.localStorage.setItem(ADVANCE_IMPORT_STORAGE_KEY, JSON.stringify(next));
}

/** แปลงผลอ่านไฟล์ → ใบเบิกเงินทดรอง (category 'advance') ของกรุ๊ปที่เลือก พร้อมใช้เป็นรายการงบ */
export function advanceDocToExpense(
  doc: ParsedAdvanceDoc,
  periodId: string,
  importer: { id: string; name: string },
  /** line id ต่อรายการ (จาก diffAdvanceDoc ตอนนำเข้า Ref ซ้ำ) — ไม่ส่ง = "Ref-ลำดับ" ตามปกติ */
  lineIds?: string[],
): ExpenseRequest {
  const now = toISODateTime(new Date());
  const printedISO = shortDateToISO(doc.printedAt.split(' ')[0] ?? '');
  const lines = doc.items.map((it, i) => ({
    id: lineIds?.[i] ?? `${doc.ref}-${it.no}`,
    expenseType: it.category,
    purpose: it.purpose,
    ...(it.description ? { description: it.description } : {}),
    ...(it.quantity !== undefined ? { quantity: it.quantity } : {}),
    ...(it.unitPrice !== undefined ? { unitPrice: it.unitPrice } : {}),
    ...(it.discount ? { discount: it.discount } : {}),
    amount: it.amount,
    currency: it.currency,
    fxRate: it.fxRate,
    amountTHB: Math.round(it.amount * it.fxRate),
    receiptNo: '—',
    evidenceFileName: doc.fileName,
  }));
  return {
    id: doc.ref,
    jobId: periodId,
    category: 'advance',
    requesterId: importer.id,
    requesterName: doc.printedBy || importer.name,
    requestedAt: printedISO ?? now.slice(0, 10),
    submittedAt: now,
    lines,
    totalTHB: lines.reduce((s, l) => s + l.amountTHB, 0),
    bankAccount: { bank: '', accountNoMasked: '', accountName: '', branch: '' },
    note: '',
    status: 'approved',
    history: [makeStatusEvent(null, 'approved', importer.name, now, `นำเข้าจากไฟล์ ${doc.fileName}`)],
    sourceDoc: {
      sourceFileName: doc.fileName,
      importedAt: now,
      groupCode: doc.groupCode,
      programName: doc.programName || undefined,
      travelDates: doc.travelDates || undefined,
      pax: doc.pax || undefined,
      printedBy: doc.printedBy || undefined,
      printedAt: doc.printedAt || undefined,
      contact: doc.contact || undefined,
    },
  };
}

/**
 * ใบเบิกตัวอย่างที่ติดมากับระบบ (src/data/advanceSamples.ts) — ผูกกับพีเรียดที่ "รหัสกรุ๊ป" ตรงกัน ณ ตอนโหลด
 * กรุ๊ปไม่มีในข้อมูลโปรแกรมทัวร์ของเครื่องนี้ = ข้าม · id ที่นำเข้าเองไว้แล้ว = ข้าม (ของที่นำเข้าชนะ)
 */
export function sampleAdvanceDocs(skipIds: ReadonlySet<string>): ExpenseRequest[] {
  const periods = getTourPeriods();
  return ADVANCE_SAMPLE_DOCS.flatMap((doc) => {
    if (skipIds.has(doc.ref)) return [];
    const period = periods.find((p) => p.groupCode === doc.groupCode);
    return period ? [advanceDocToExpense(doc, period.internalId, { id: 'SYSTEM', name: 'ข้อมูลตัวอย่าง' })] : [];
  });
}
