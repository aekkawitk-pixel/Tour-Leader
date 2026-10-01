/**
 * Period Attachment Store (§8 เอกสารทริป) — เก็บ "ไฟล์แนบ" ของพีเรียด แยกจาก Tour Period Master
 *
 * Tour Period Master นำเข้า/ซิงก์จากไฟล์ต้นทางเป็นระยะ (importedAt/lastSyncedAt/sourceFileName) —
 * ห้ามเก็บไฟล์แนบเป็นฟิลด์ในตัว Master เอง เพราะจะถูกเขียนทับเมื่อ sync ใหม่ (§9) เก็บแยกใน
 * localStorage คีย์ด้วย periodId แล้ว join ตอนอ่านเสมอ (รูปแบบเดียวกับ guideAssignmentStore.ts)
 * เป็นข้อมูลจำลอง ไม่มีการอัปโหลดไฟล์จริงใน Demo — ผู้จัด/ผู้ประสาน (canManage) เป็นผู้เพิ่ม/ลบ
 * ฝั่งหัวหน้าทัวร์เห็นได้อย่างเดียวที่ /guide/jobs/[id]
 *
 * แต่ละไฟล์อยู่ในหมวด (category) — มีหมวดเริ่มต้นให้ครบทุกพีเรียดเสมอ (TRIP_DOC_DEFAULT_CATEGORIES)
 * เจ้าหน้าที่เพิ่มหมวดใหม่นอกเหนือจากนี้ได้เอง — category เป็น string อิสระ ไม่ได้ผูก enum ตายตัว
 * หมวดใหม่จะไม่ถูกลืม (แม้ยังไม่มีไฟล์) เพราะ getPeriodDocCategories() รวมหมวดที่เคยเพิ่มไว้เสมอ
 */

import type { Attachment } from '@/types';
import { readJson, writeJson } from './browserStorage';

export interface PeriodAttachment extends Attachment {
  periodId: string;
  category: string;
  uploadedBy: string;
}

/** หมวดเอกสารทริปเริ่มต้น — แสดงเสมอทุกพีเรียดแม้ยังไม่มีไฟล์ */
export const TRIP_DOC_DEFAULT_CATEGORIES: string[] = ['โปรแกรมทัวร์', 'ใบนัด', 'Roomlist', 'ประกัน'];

const ATTACH_KEY = 'periodAttachments';
/** หมวดที่เจ้าหน้าที่เพิ่มเองต่อพีเรียด — เก็บแยกจากไฟล์ เพื่อให้หมวดว่างเปล่ายังแสดงอยู่ได้ (ไม่หายไปเมื่อไฟล์ในหมวดถูกลบหมด) */
const CATEGORY_KEY = 'periodAttachmentCategories';

function loadAllAttachments(): PeriodAttachment[] {
  const parsed = readJson<PeriodAttachment[]>(ATTACH_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function loadCustomCategories(): Record<string, string[]> {
  const parsed = readJson<Record<string, string[]>>(CATEGORY_KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

export function getPeriodAttachments(periodId: string): PeriodAttachment[] {
  return loadAllAttachments()
    .filter((a) => a.periodId === periodId)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/** หมวดที่ต้องแสดงของพีเรียดนี้ — หมวดเริ่มต้นเสมอ + หมวดที่เจ้าหน้าที่เพิ่มเอง (เรียงตามลำดับที่เพิ่ม) */
export function getPeriodDocCategories(periodId: string): string[] {
  const custom = loadCustomCategories()[periodId] ?? [];
  const usedInFiles = getPeriodAttachments(periodId).map((a) => a.category);
  const extra = [...new Set([...custom, ...usedInFiles])].filter((c) => !TRIP_DOC_DEFAULT_CATEGORIES.includes(c));
  return [...TRIP_DOC_DEFAULT_CATEGORIES, ...extra];
}

/** เพิ่มหมวดใหม่ (ยังไม่มีไฟล์ก็เพิ่มได้) — ไม่ทำอะไรถ้ามีอยู่แล้ว (หมวดเริ่มต้นหรือเพิ่มไปแล้ว) */
export function addPeriodDocCategory(periodId: string, category: string): void {
  const name = category.trim();
  if (!name) return;
  const map = loadCustomCategories();
  const existing = map[periodId] ?? [];
  if (TRIP_DOC_DEFAULT_CATEGORIES.includes(name) || existing.includes(name)) return;
  map[periodId] = [...existing, name];
  writeJson(CATEGORY_KEY, map);
}

export function addPeriodAttachment(periodId: string, category: string, name: string, size: string, uploadedBy: string, uploadedAt: string): PeriodAttachment[] {
  addPeriodDocCategory(periodId, category);
  const all = loadAllAttachments();
  const rec: PeriodAttachment = { id: `ATT-${periodId}-${all.length + 1}-${Date.now()}`, periodId, category, name, size, uploadedAt, uploadedBy };
  const next = [...all, rec];
  writeJson(ATTACH_KEY, next);
  return next.filter((a) => a.periodId === periodId);
}

export function removePeriodAttachment(periodId: string, attachmentId: string): PeriodAttachment[] {
  const next = loadAllAttachments().filter((a) => a.id !== attachmentId);
  writeJson(ATTACH_KEY, next);
  return next.filter((a) => a.periodId === periodId);
}
