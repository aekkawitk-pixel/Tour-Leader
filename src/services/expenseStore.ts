/**
 * เก็บใบเบิก/ค่าใช้จ่ายที่บันทึกหรือเปลี่ยนสถานะในเบราว์เซอร์ — รีเฟรชแล้วไม่หาย
 *
 * แยกเก็บสองที่ตามขนาดข้อมูล:
 *   • ตัวรายการ (ไม่รวมรูป) → localStorage (key: savedExpenses) — upsert ตาม id
 *   • รูปหลักฐาน (evidenceImage, data URL หลักร้อย KB) → IndexedDB (expenseEvidenceStore)
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
  const image = expense.lines.find((l) => l.evidenceImage)?.evidenceImage;
  if (image) await putEvidence({ expenseId: expense.id, dataUrl: image });
  else await deleteEvidence(expense.id);
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

async function deleteEvidence(expenseId: string): Promise<void> {
  if (!canUseIdb()) return;
  await tx('readwrite', (s) => s.delete(expenseId) as IDBRequest<undefined>);
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
