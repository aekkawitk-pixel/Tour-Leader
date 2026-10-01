/**
 * แหล่งข้อมูลกลางของโปรแกรม/พีเรียด Zego (Data Source Layer)
 *
 * ลำดับที่ใช้:
 *   1) ข้อมูลที่ผู้ใช้กด "นำเข้า" จาก Zego API ไว้ (zegoImportStore) — ถ้ามี
 *   2) seed ที่แปลงมาจากไฟล์ PDF (zegoPeriods.seed.ts) — ค่าตั้งต้นของ Demo
 *
 * ทุกหน้าจออ่านผ่านสองฟังก์ชันนี้จุดเดียว จึงสลับแหล่งข้อมูลได้โดยไม่ต้องแก้ Normalizer/Display
 * (ฝั่งเซิร์ฟเวอร์อ่าน localStorage ไม่ได้ → ได้ seed เสมอ ซึ่งเป็นพฤติกรรมที่ถูกต้อง
 *  เพราะข้อมูลที่นำเข้าเป็นของผู้ใช้แต่ละเครื่อง ไม่ใช่ข้อมูลร่วมของทั้งระบบ)
 */

import { loadZegoImport } from '@/services/zegoImportStore';
import { zegoPeriods, zegoPrograms } from './zegoPeriods.seed';
import type { ZegoPeriod, ZegoProgram } from './types';

/** พีเรียดทั้งหมด — จากข้อมูลที่นำเข้า ถ้ายังไม่เคยนำเข้าจะใช้ไฟล์ตัวอย่าง (Seq 1–94) */
export function getZegoPeriods(): ZegoPeriod[] {
  const imported = loadZegoImport();
  return imported && imported.periods.length > 0 ? imported.periods : zegoPeriods;
}

/** โปรแกรมทัวร์ (จัดกลุ่มพีเรียดด้วย programCode) */
export function getZegoPrograms(): ZegoProgram[] {
  const imported = loadZegoImport();
  return imported && imported.programs.length > 0 ? imported.programs : zegoPrograms;
}

/** กำลังใช้ข้อมูลจาก Zego API อยู่หรือไม่ (false = ข้อมูลตัวอย่างจากไฟล์) */
export function isUsingImportedZegoData(): boolean {
  const imported = loadZegoImport();
  return Boolean(imported && imported.programs.length > 0);
}
