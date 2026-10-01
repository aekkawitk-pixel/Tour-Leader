/**
 * เก็บซองเงิน (จัดซอง/ส่งมอบ/รับ) ถาวรในเบราว์เซอร์ — รีเฟรชแล้วไม่หาย
 *
 * แบ่งเหมือน expenseStore: ตัวข้อมูล (ไม่รวมรูป) → localStorage · ลายเซ็น/รูปหลักฐาน (data URL) → IndexedDB
 * เพราะรูปหลักร้อย KB ต่อซอง (และทุกทอดการรับส่งต้องมีรูป) localStorage จะเต็มเร็ว
 * เขียนไม่สำเร็จ → โยน error พร้อมสาเหตุ (writeJson) ห้ามแสดงว่าบันทึกแล้วทั้งที่ไม่ได้บันทึก
 */

import { readJson, writeJson } from '@/services/browserStorage';
import { normalizeEnvelope, type CashEnvelope } from '@/lib/logic/cashEnvelope';

const KEY = 'cashEnvelopes';
const DB_NAME = 'cashEnvelopeMedia';
const STORE = 'media';

/**
 * รูปหลักฐานของแต่ละทอด — [ส่วนของซอง, ชื่อฟิลด์รูป] · คีย์ใน IndexedDB = `${envelopeId}:${ชื่อคีย์}`
 * คีย์ของ handover คงชื่อเดิม (signature / photo) ให้รูปที่เก็บไว้ก่อนหน้านี้ยังอ่านได้
 */
const MEDIA_FIELDS = [
  { key: 'signature', part: 'handover', field: 'signature' },
  { key: 'photo', part: 'handover', field: 'photo' },
  { key: 'staffAck', part: 'staffAck', field: 'photo' },
  { key: 'staffHandoff', part: 'staffHandoff', field: 'photo' },
  { key: 'staffReturn', part: 'staffReturn', field: 'photo' },
  { key: 'lastReturn', part: 'lastReturn', field: 'photo' },
  { key: 'lastReturnReceived', part: 'lastReturn', field: 'receivedPhoto' },
  { key: 'leaderAck', part: 'leaderAck', field: 'photo' },
] as const;

type Part = Record<string, unknown> | undefined;
const partOf = (env: CashEnvelope, part: string): Part => (env as unknown as Record<string, Part>)[part];

/** ตัดรูปทั้งหมด (ลายเซ็น/รูปหลักฐานทุกทอด/หลักฐานส่งแลนด์) ออกก่อนลง localStorage — รูปไปอยู่ IndexedDB */
function strip(env: CashEnvelope): CashEnvelope {
  const out: Record<string, unknown> = { ...env };
  for (const { part, field } of MEDIA_FIELDS) {
    const p = out[part] as Part;
    if (p && field in p) {
      const rest = { ...p };
      delete rest[field];
      out[part] = rest;
    }
  }
  if (env.landPayments) {
    out.landPayments = env.landPayments.map(({ evidenceImage: _e, ...rest }) => (void _e, rest));
  }
  out.history = env.history.map(({ photo: _p, ...rest }) => (void _p, rest));
  return out as unknown as CashEnvelope;
}

/** คีย์รูปของรายการประวัติ — ประวัติเพิ่มต่อท้ายอย่างเดียว ไม่ถูกแก้/ลบ ลำดับจึงใช้เป็นคีย์ได้ */
const historyKey = (envId: string, i: number) => `${envId}:h:${i}`;

export function loadEnvelopes(): CashEnvelope[] {
  const rows = readJson<unknown>(KEY, []);
  return Array.isArray(rows) ? (rows as CashEnvelope[]).map(normalizeEnvelope) : [];
}

export async function persistEnvelope(env: CashEnvelope): Promise<void> {
  const rest = loadEnvelopes().filter((e) => e.id !== env.id);
  writeJson(KEY, [strip(env), ...rest]);
  for (const { key, part, field } of MEDIA_FIELDS) {
    const data = partOf(env, part)?.[field];
    if (typeof data === 'string' && data) await putMedia(`${env.id}:${key}`, data);
    else await deleteMedia(`${env.id}:${key}`);
  }
  for (const lp of env.landPayments ?? []) {
    if (lp.evidenceImage) await putMedia(`${env.id}:land:${lp.id}`, lp.evidenceImage);
  }
  // รูปของรายการประวัติ — เขียนเฉพาะรายการที่มีรูป (รูปเดิมไม่ลบ เพราะประวัติไม่ถูกแก้ย้อนหลัง)
  for (const [i, h] of env.history.entries()) {
    if (h.photo) await putMedia(historyKey(env.id, i), h.photo);
  }
}

/** ลบซอง (เฉพาะซองที่ยังไม่ปิด — ผู้เรียกตรวจเอง) พร้อมรูปที่เกี่ยวข้อง */
export async function removeEnvelope(env: CashEnvelope): Promise<void> {
  writeJson(KEY, loadEnvelopes().filter((e) => e.id !== env.id));
  for (const { key } of MEDIA_FIELDS) await deleteMedia(`${env.id}:${key}`);
  for (const i of env.history.keys()) await deleteMedia(historyKey(env.id, i));
}

/* ------------------------------ IndexedDB ------------------------------ */

function canUseIdb(): boolean {
  try { return typeof window !== 'undefined' && !!window.indexedDB; } catch { return false; }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('เปิดพื้นที่เก็บหลักฐานการรับเงินไม่สำเร็จ'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('อ่าน/เขียนหลักฐานการรับเงินไม่สำเร็จ'));
    t.oncomplete = () => db.close();
  }));
}

async function putMedia(key: string, dataUrl: string): Promise<void> {
  if (!canUseIdb()) throw new Error('เบราว์เซอร์นี้เก็บลายเซ็น/รูปหลักฐานไม่ได้');
  await tx('readwrite', (s) => s.put({ key, dataUrl }) as IDBRequest<IDBValidKey>);
}

async function deleteMedia(key: string): Promise<void> {
  if (!canUseIdb()) return;
  await tx('readwrite', (s) => s.delete(key) as IDBRequest<undefined>);
}

/** ลายเซ็น/รูปหลักฐานทั้งหมด — `${envelopeId}:${คีย์}` → data URL */
export async function loadEnvelopeMedia(): Promise<Map<string, string>> {
  if (!canUseIdb()) return new Map();
  try {
    const rows = await tx<{ key: string; dataUrl: string }[]>('readonly', (s) => s.getAll() as IDBRequest<{ key: string; dataUrl: string }[]>);
    return new Map(rows.map((r) => [r.key, r.dataUrl]));
  } catch {
    return new Map();
  }
}

export function attachMedia(env: CashEnvelope, media: Map<string, string>): CashEnvelope {
  const out: Record<string, unknown> = { ...env };
  for (const { key, part, field } of MEDIA_FIELDS) {
    const p = out[part] as Part;
    const data = media.get(`${env.id}:${key}`);
    if (p && p[field] === undefined && data) out[part] = { ...p, [field]: data };
  }
  if (env.landPayments) {
    out.landPayments = env.landPayments.map((lp) => ({ ...lp, evidenceImage: lp.evidenceImage ?? media.get(`${env.id}:land:${lp.id}`) }));
  }
  out.history = env.history.map((h, i) => {
    const photo = h.photo ?? media.get(historyKey(env.id, i));
    return photo ? { ...h, photo } : h;
  });
  return out as unknown as CashEnvelope;
}
