/**
 * Document Image Store — พื้นที่เก็บรูปต้นฉบับของเอกสารประจำตัวทุกชนิดแบบส่วนตัว
 *
 * เดิมรองรับเฉพาะหนังสือเดินทาง (passportImageStore) — ตรรกะเหมือนกันทุกชนิด
 * จึงยกขึ้นมาเป็นของกลาง แล้วให้ passportImageStore เรียกต่อ
 *
 * ข้อจำกัดที่ต้องรู้ (Demo ไม่มี backend):
 *   • เก็บใน IndexedDB ของเครื่องผู้ใช้ — ไม่ถูกอัปโหลดออกนอกเครื่อง ไม่มี Public URL
 *   • การจำกัดสิทธิ์ทำที่ชั้นแอป (ผู้เรียกต้องส่ง canView ที่ตรวจ Role มาแล้ว) — ไม่ใช่ ACL ฝั่งเซิร์ฟเวอร์จริง
 *   • เปิดดูแต่ละครั้งสร้าง blob: URL ชั่วคราวและต้อง revoke เมื่อเลิกใช้ (releaseImageUrl)
 * เมื่อย้ายขึ้น backend: เปลี่ยนเฉพาะไฟล์นี้ให้ยิง signed URL ที่หมดอายุได้ โดย UI ไม่ต้องแก้
 *
 * ⚠️ ชื่อฐานข้อมูลคงเดิม (passportPrivateStore) โดยตั้งใจ — เปลี่ยนแล้วรูปที่ผู้ใช้
 *    เคยอัปโหลดไว้จะหาไม่เจอ
 */

import type { DocKind } from '@/data/leaders/documentSchemas';
import { logPassportImageAccess } from '@/lib/logic/passportAudit';

const DB_NAME = 'passportPrivateStore';
const DB_VERSION = 1;
const STORE = 'images';

export interface StoredDocumentImage {
  imageId: string;
  tourLeaderId: string;
  /** ชนิดเอกสารที่รูปนี้สังกัด — รูปเก่าที่บันทึกก่อนรวมที่เก็บจะไม่มีค่า (ถือเป็นหนังสือเดินทาง) */
  kind?: DocKind;
  blob: Blob;
  fileName: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

function canUseIdb(): boolean {
  try { return typeof window !== 'undefined' && !!window.indexedDB; } catch { return false; }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'imageId' });
        os.createIndex('tourLeaderId', 'tourLeaderId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('เปิดพื้นที่เก็บรูปไม่สำเร็จ'));
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('อ่าน/เขียนพื้นที่เก็บรูปไม่สำเร็จ'));
    t.oncomplete = () => db.close();
  }));
}

/** รหัสรูป — หนังสือเดินทางคงคำนำหน้าเดิม (PPIMG-) เพื่อให้อ่านคู่กับข้อมูลเก่าได้ */
function newImageId(kind: DocKind): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${kind === 'passport' ? 'PPIMG' : 'DOCIMG'}-${rand}`;
}

export interface SaveImageMeta {
  tourLeaderId: string;
  kind: DocKind;
  fileName: string;
  uploadedBy: string;
  uploadedAt: string;
}

/** บันทึกรูปต้นฉบับ — คืน imageId สำหรับอ้างอิงในเอกสาร (ห้ามเก็บรูปลงในตัวเอกสารโดยตรง) */
export async function saveDocumentImage(file: Blob, meta: SaveImageMeta): Promise<string> {
  if (!canUseIdb()) throw new Error('เบราว์เซอร์นี้ไม่รองรับพื้นที่เก็บรูปแบบส่วนตัว');
  const imageId = newImageId(meta.kind);
  const record: StoredDocumentImage = {
    imageId,
    tourLeaderId: meta.tourLeaderId,
    kind: meta.kind,
    blob: file,
    fileName: meta.fileName,
    mimeType: file.type || 'application/octet-stream',
    byteSize: file.size,
    uploadedBy: meta.uploadedBy,
    uploadedAt: meta.uploadedAt,
  };
  await tx('readwrite', (s) => s.put(record) as IDBRequest<IDBValidKey>);
  logPassportImageAccess(meta.tourLeaderId, 'upload_image', meta.uploadedBy, meta.uploadedAt);
  return imageId;
}

/**
 * เปิดดูรูป — ต้องผ่านการตรวจสิทธิ์จากผู้เรียก (จำกัดสิทธิ์ตาม Role)
 * คืน blob: URL ชั่วคราว · ผู้เรียกต้องเรียก releaseImageUrl เมื่อเลิกใช้
 */
export async function openDocumentImageUrl(
  imageId: string, viewer: { canView: boolean; by: string; at: string; tourLeaderId: string },
): Promise<string | null> {
  if (!viewer.canView) return null;
  if (!canUseIdb()) return null;
  const rec = await tx<StoredDocumentImage | undefined>('readonly', (s) => s.get(imageId) as IDBRequest<StoredDocumentImage | undefined>);
  if (!rec) return null;
  logPassportImageAccess(viewer.tourLeaderId, 'view_image', viewer.by, viewer.at);
  return URL.createObjectURL(rec.blob);
}

/** คืนหน่วยความจำของ blob: URL (สำคัญ — กันรูปค้างอยู่ในหน่วยความจำ) */
export function releaseImageUrl(url: string | null): void {
  if (url) URL.revokeObjectURL(url);
}

/** ข้อมูลไฟล์ (ไม่รวมตัวรูป) — ใช้แสดงชื่อไฟล์/ขนาดในประวัติ */
export async function getDocumentImageMeta(imageId: string): Promise<Omit<StoredDocumentImage, 'blob'> | null> {
  if (!canUseIdb()) return null;
  const rec = await tx<StoredDocumentImage | undefined>('readonly', (s) => s.get(imageId) as IDBRequest<StoredDocumentImage | undefined>);
  if (!rec) return null;
  const { blob: _blob, ...meta } = rec;
  void _blob;
  return meta;
}

/** ลบรูป (ใช้เมื่อผู้ใช้ยกเลิกก่อนบันทึก — ไม่ลบอัตโนมัติเมื่อ OCR ล้มเหลว) */
export async function deleteDocumentImage(imageId: string): Promise<void> {
  if (!canUseIdb()) return;
  await tx('readwrite', (s) => s.delete(imageId) as IDBRequest<undefined>);
}
