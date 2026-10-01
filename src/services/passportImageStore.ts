/**
 * Passport Image Store (§9) — พื้นที่เก็บรูปหนังสือเดินทางแบบส่วนตัว
 *
 * ตั้งแต่รวมที่เก็บเอกสาร ไฟล์นี้เป็น "หน้ากาก" บาง ๆ ของ documentImageStore
 * ซึ่งใช้ร่วมกันได้ทุกชนิดเอกสาร — ชื่อฟังก์ชันเดิมคงไว้เพื่อไม่ให้ UI ต้องแก้ตาม
 *
 * ข้อจำกัดและกติกาทั้งหมด (IndexedDB · blob: URL · การตรวจสิทธิ์ที่ผู้เรียก)
 * อยู่ที่ documentImageStore จุดเดียว
 */

import {
  deleteDocumentImage,
  getDocumentImageMeta,
  openDocumentImageUrl,
  saveDocumentImage,
  type StoredDocumentImage,
} from './documentImageStore';

export { releaseImageUrl } from './documentImageStore';

/** รูปหนังสือเดินทาง 1 รูปที่เก็บไว้ — โครงเดียวกับเอกสารชนิดอื่น */
export type StoredPassportImage = StoredDocumentImage;

/** บันทึกรูปต้นฉบับ — คืน imageId สำหรับอ้างอิงในเล่ม (ห้ามเก็บรูปลงในตัวเล่มโดยตรง) */
export function savePassportImage(
  file: Blob, meta: { tourLeaderId: string; fileName: string; uploadedBy: string; uploadedAt: string },
): Promise<string> {
  return saveDocumentImage(file, { ...meta, kind: 'passport' });
}

/**
 * เปิดดูรูป — ต้องผ่านการตรวจสิทธิ์จากผู้เรียก (§9 จำกัดสิทธิ์ตาม Role)
 * คืน blob: URL ชั่วคราว · ผู้เรียกต้องเรียก releaseImageUrl เมื่อเลิกใช้
 */
export function openPassportImageUrl(
  imageId: string, viewer: { canView: boolean; by: string; at: string; tourLeaderId: string },
): Promise<string | null> {
  return openDocumentImageUrl(imageId, viewer);
}

/** ข้อมูลไฟล์ (ไม่รวมตัวรูป) — ใช้แสดงชื่อไฟล์/ขนาดในประวัติ */
export function getPassportImageMeta(imageId: string): Promise<Omit<StoredPassportImage, 'blob'> | null> {
  return getDocumentImageMeta(imageId);
}

/** ลบรูป (ใช้เมื่อผู้ใช้ยกเลิกก่อนบันทึก — ไม่ลบอัตโนมัติเมื่อ OCR ล้มเหลว §8) */
export function deletePassportImage(imageId: string): Promise<void> {
  return deleteDocumentImage(imageId);
}
