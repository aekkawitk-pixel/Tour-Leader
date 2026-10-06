/**
 * เก็บใบเบิก/ค่าใช้จ่ายที่บันทึกหรือเปลี่ยนสถานะในเบราว์เซอร์ — รีเฟรชแล้วไม่หาย
 *
 * แยกเก็บสองที่ตามขนาดข้อมูล:
 *   • ตัวรายการ (ไม่รวมรูป) → localStorage (key: savedExpenses) — upsert ตาม id
 *   • รูปหลักฐาน (evidenceImage, data URL หลักร้อย KB) → IndexedDB (expenseEvidenceStore) — ใบเสร็จละ 1 รูป
 *     key = <เลขใบเบิก>#<receiptId> (ใบเสร็จเดียว = <เลขใบเบิก>#) · key เก่าแบบ <เลขใบเบิก> ยังอ่านได้
 *     localStorage มีที่ราว 5 MB ถ้าเก็บรูปรวมไปด้วยจะเต็มหลังบันทึกไม่กี่สิบใบ
 * DemoStore ทาบรายการที่เก็บไว้ลงบนข้อมูลตั้งต้นตอนโหลด (id ซ้ำ = ใช้ของที่เก็บไว้) แล้วค่อยเติมรูปตามมา
 *
 * เขียนไม่สำเร็จ → โยน error พร้อมสาเหตุ (ผ่าน writeJson) ห้ามให้ UI ขึ้นว่าบันทึกแล้วทั้งที่ไม่ได้บันทึก
 */

import { readJson, writeJson } from '@/services/browserStorage';
import type { ExpenseRequest } from '@/types';

export const EXPENSE_STORAGE_KEY = 'savedExpenses';

const DB_NAME = 'expenseEvidenceStore';
const DB_VERSION = 1;
const STORE = 'images';

interface StoredEvidence {
  expenseId: string;
  dataUrl: string;
}

/** ตัดรูปออกจากทุกบรรทัด — รูปไปอยู่ IndexedDB แทน */
function stripImages(e: ExpenseRequest): ExpenseRequest {
  return { ...e, lines: e.lines.map(({ evidenceImage: _img, ...rest }) => (void _img, rest)) };
}

export function loadSavedExpenses(): ExpenseRequest[] {
  const rows = readJson<unknown>(EXPENSE_STORAGE_KEY, []);
  return Array.isArray(rows) ? (rows as ExpenseRequest[]) : [];
}

/** บันทึก 1 ใบ (upsert) — ตัวรายการลง localStorage ก่อน แล้วรูปลง IndexedDB */
export async function persistExpense(expense: ExpenseRequest): Promise<void> {
  const rest = loadSavedExpenses().filter((e) => e.id !== expense.id);
  writeJson(EXPENSE_STORAGE_KEY, [stripImages(expense), ...rest]);
  await deleteEvidenceOf(expense.id);
  const images = new Map<string, string>();
  for (const l of expense.lines) {
    const key = evidenceKey(expense.id, l.receiptId);
    if (l.evidenceImage && !images.has(key)) images.set(key, l.evidenceImage);
  }
  for (const [key, dataUrl] of images) await putEvidence({ expenseId: key, dataUrl });
}

/** key รูปหลักฐานของใบเสร็จ */
export function evidenceKey(expenseId: string, receiptId?: string): string {
  return `${expenseId}#${receiptId ?? ''}`;
}

/** ลบใบที่เก็บไว้ตามเลข (พร้อมรูป) — ใช้ตอนรวมร่างหลายใบเป็นใบเบิกเดียว */
export async function discardSavedExpenses(ids: string[]): Promise<void> {
  writeJson(EXPENSE_STORAGE_KEY, loadSavedExpenses().filter((e) => !ids.includes(e.id)));
  for (const id of ids) await deleteEvidenceOf(id);
}

/** ลบใบที่เก็บไว้ทุกใบที่ keep ไม่เก็บ (พร้อมรูปหลักฐาน) — ใช้รีเซ็ตเพื่อทดสอบใหม่ · คืน id ที่ลบ */
export async function clearSavedExpenses(keep: (e: ExpenseRequest) => boolean): Promise<string[]> {
  const all = loadSavedExpenses();
  const removed = all.filter((e) => !keep(e)).map((e) => e.id);
  writeJson(EXPENSE_STORAGE_KEY, all.filter(keep));
  for (const id of removed) await deleteEvidenceOf(id);
  return removed;
}

/* ------------------------------ IndexedDB ------------------------------ */

function canUseIdb(): boolean {
  try { return typeof window !== 'undefined' && !!window.indexedDB; } catch { return false; }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'expenseId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('เปิดพื้นที่เก็บรูปหลักฐานไม่สำเร็จ'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('อ่าน/เขียนรูปหลักฐานไม่สำเร็จ'));
    t.oncomplete = () => db.close();
  }));
}

async function putEvidence(rec: StoredEvidence): Promise<void> {
  if (!canUseIdb()) return; // ไม่รองรับ → เก็บได้แค่ตัวรายการ (ชื่อไฟล์ยังอยู่) ไม่ถือว่าบันทึกล้มเหลว
  await tx('readwrite', (s) => s.put(rec) as IDBRequest<IDBValidKey>);
}

/** ลบรูปทุกใบเสร็จของใบเบิกนี้ (รวม key แบบเก่า) */
async function deleteEvidenceOf(expenseId: string): Promise<void> {
  if (!canUseIdb()) return;
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>);
  for (const k of keys) {
    if (k === expenseId || (typeof k === 'string' && k.startsWith(`${expenseId}#`))) {
      await tx('readwrite', (s) => s.delete(k) as IDBRequest<undefined>);
    }
  }
}

/** รูปหลักฐานทั้งหมด — expenseId → data URL (อ่านไม่ได้ = คืนว่าง รายการยังแสดงชื่อไฟล์ได้ตามปกติ) */
export async function loadEvidenceImages(): Promise<Map<string, string>> {
  if (!canUseIdb()) return new Map();
  try {
    const rows = await tx<StoredEvidence[]>('readonly', (s) => s.getAll() as IDBRequest<StoredEvidence[]>);
    return new Map(rows.map((r) => [r.expenseId, r.dataUrl]));
  } catch {
    return new Map();
  }
}
