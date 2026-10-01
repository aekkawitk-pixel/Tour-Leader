/**
 * แหล่งเก็บ "ข้อมูลหัวหน้าทัวร์ที่ผู้ใช้เพิ่ม/แก้ไข" — คงอยู่ใน localStorage (Demo)
 *
 * เก็บแบบ **ส่วนต่าง (delta)** ไม่ใช่ทั้งชุด:
 *   • รายการที่ผู้ใช้ "เพิ่มใหม่" → เก็บทั้ง record
 *   • รายการนำเข้าที่ผู้ใช้ "แก้ไข" → เก็บ record ล่าสุดทับตอนโหลด
 *   • รายการนำเข้าที่ยังไม่เคยแก้ → ไม่เก็บ (อ่านจากไฟล์นำเข้าตามเดิม)
 * จึงกินพื้นที่น้อย และไม่ค้างข้อมูลเก่าเมื่อไฟล์นำเข้าถูกอัปเดต
 *
 * ทุกฟังก์ชัน:
 *   • ปลอดภัยกับ SSR / เบราว์เซอร์ที่ปิด localStorage
 *   • JSON เสีย → ไม่ทำให้หน้าเว็บพัง และไม่เขียนทับข้อมูลเดิม
 *   • เขียนไม่สำเร็จ → โยน StorageWriteError (UI ต้องไม่ขึ้นว่าบันทึกสำเร็จ)
 * เปลี่ยนไปใช้ REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import type { TourLeader } from '@/types';
import { readJson, writeJson } from './browserStorage';
import { migrateLanguages } from '@/modules/tour-leaders/languageMigration';

/** §1 Key เดียวทั้งระบบ */
export const LEADER_STORAGE_KEY = 'tourLeaderRecords';

function isLeaderRow(value: unknown): value is TourLeader {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as TourLeader).id === 'string' &&
    (value as TourLeader).id.trim() !== ''
  );
}

/**
 * §2 อ่านรายการที่บันทึกไว้ (รายการที่เพิ่มใหม่เรียงใหม่สุดขึ้นก่อน)
 *
 * ⚠️ ทาบ languages ผ่าน migrateLanguageSkill เสมอ — record ที่เคยบันทึกไว้ก่อนโครงสร้างภาษา
 * เปลี่ยน (มาตรฐานตามภาษา) อาจมีรูปแบบเดิมค้างอยู่ใน localStorage ของเบราว์เซอร์ผู้ใช้จริง
 * ต้องทำให้เป็นรูปแบบปัจจุบันตั้งแต่จุดโหลดข้อมูล ไม่ใช่รอให้ทุกจุดที่แสดงผลกันเองทีหลัง
 * (เดิมยึดตามธรรมเนียมที่ "ฝั่งแสดงผลไม่ต้อง migrate" — แต่ตอนนี้ standard/levelRank เป็นฟิลด์บังคับ
 * ที่ไม่มี fallback แบบเดิมอีกแล้ว ค้างรูปแบบเก่าไว้จะทำหน้าเว็บพังตอนแสดงผล ไม่ใช่แค่ข้อมูลไม่ครบ)
 */
export function loadLeaderRecords(): TourLeader[] {
  const parsed = readJson<unknown>(LEADER_STORAGE_KEY, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isLeaderRow).map((l) => normalizeUsage({ ...l, languages: migrateLanguages(l.languages) }));
}

const USAGE_STATUSES: ReadonlySet<string> = new Set<TourLeader['usageStatus']>(['active', 'suspended', 'ended']);

/**
 * record ที่บันทึกไว้ก่อนมีฟิลด์ usageStatus (หรือค่าเสีย) → เติมจาก active ที่มีอยู่เดิม
 * ไม่งั้นหน้ารายชื่อ (อ่าน active) เห็นเป็น "ใช้งาน" แต่หน้าการจัดสเก็ต (อ่าน usageStatus) ตัดคนนั้นทิ้งเงียบ ๆ
 * และบังคับ active ให้ตรงกับ usageStatus เสมอ (false เฉพาะ "สิ้นสุดการใช้งาน")
 */
function normalizeUsage(l: TourLeader): TourLeader {
  const usageStatus = USAGE_STATUSES.has(l.usageStatus) ? l.usageStatus : l.active === false ? 'ended' : 'active';
  const active = usageStatus !== 'ended';
  return usageStatus === l.usageStatus && active === l.active ? l : { ...l, usageStatus, active };
}

/** §2 เขียนรายการทั้งชุด — โยน StorageWriteError เมื่อเขียนไม่สำเร็จ */
export function saveLeaderRecords(rows: TourLeader[]): void {
  writeJson(LEADER_STORAGE_KEY, rows);
}

/**
 * §3/§4 เพิ่มหรือแก้ไขตาม id (upsert)
 *   • id เดิม → เขียนทับ "ที่ตำแหน่งเดิม" (กดบันทึกซ้ำกี่ครั้งก็ไม่เกิดรายการซ้ำ)
 *   • id ใหม่ → ใส่ไว้บนสุด (ให้ขึ้นก่อนในรายการเหมือนตอนบันทึกในหน้าจอ)
 * อ่านค่าล่าสุดจาก storage ก่อนเสมอ → ไม่ทับข้อมูลที่แท็บอื่นบันทึกไว้
 */
export function upsertLeaderRecord(leader: TourLeader): TourLeader[] {
  const rows = loadLeaderRecords();
  const idx = rows.findIndex((l) => l.id === leader.id);
  const next = idx >= 0 ? rows.map((l, i) => (i === idx ? leader : l)) : [leader, ...rows];
  saveLeaderRecords(next);
  return next;
}

/** ลบรายการที่บันทึกไว้ (คืนค่ากลับไปใช้ข้อมูลนำเข้า) */
export function removeLeaderRecord(id: string): TourLeader[] {
  const next = loadLeaderRecords().filter((l) => l.id !== id);
  saveLeaderRecords(next);
  return next;
}

/**
 * §5 รวมข้อมูลนำเข้ากับส่วนต่างที่บันทึกไว้ — ฟังก์ชันบริสุทธิ์ (ทดสอบแยกได้)
 *   ลำดับผลลัพธ์: รายการที่เพิ่มใหม่ (ใหม่สุดก่อน) → รายการนำเข้าตามลำดับเดิม (ทาบค่าที่แก้แล้ว)
 *   ไม่ทำให้จำนวนรายการนำเข้าหาย และไม่เกิดรายการซ้ำ id
 */
export function mergeLeaderRecords(base: TourLeader[], stored: TourLeader[]): TourLeader[] {
  if (stored.length === 0) return base;
  const storedById = new Map(stored.map((l) => [l.id, l]));
  const baseIds = new Set(base.map((l) => l.id));
  const created = stored.filter((l) => !baseIds.has(l.id));
  const merged = base.map((l) => storedById.get(l.id) ?? l);
  return [...created, ...merged];
}
