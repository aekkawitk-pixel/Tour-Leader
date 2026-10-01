/**
 * สนามบินขาไปที่กรอกเอง — ใช้เฉพาะกรุ๊ปที่ยังไม่มีข้อมูลเที่ยวบินในระบบ
 *
 * สนามบินจริงมาจาก Sector ของพีเรียด ซึ่งปัจจุบันมีเฉพาะข้อมูลที่นำเข้าจาก Zego
 * กรุ๊ปที่มาจาก CSV จึงไม่มีสนามบิน ต่อให้กรอกเวลาเครื่องออกเองแล้ว (ดู sendOffFlightTimeStore)
 * ก็ยังตรวจกฎ "สนามบินเดียวกัน/คนละสนามบิน" กับงานอื่นของคนเดียวกันไม่ได้ — ค้างเป็น "ยังไม่รู้สนามบิน"
 * ตลอดไป เพราะ Zego ไม่มีข้อมูลของกรุ๊ปนี้อยู่แล้วตั้งแต่แรก ไม่ใช่แค่ยังไม่เข้ามา
 *
 * ที่เก็บนี้ให้ผู้จัดกรอกสนามบินเองไปก่อนเพื่อให้ตรวจกฎได้ครบ เช่นเดียวกับเวลาเครื่องออก
 * ⚠️ สนามบินจริงจาก Sector ต้องชนะค่าที่กรอกเองเสมอ — ค่าที่กรอกเองเป็นเพียงตัวแทนชั่วคราว
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'sendOffManualAirports';

/** periodId → รหัสสนามบิน (IATA 3 ตัวอักษร) */
export type ManualAirports = Record<string, string>;

export function loadManualAirports(): ManualAirports {
  const parsed = readJson<ManualAirports | null>(KEY, null);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/** บันทึกสนามบินที่กรอกเอง — ค่าว่างหรือไม่ใช่รหัส 3 ตัวอักษร = ลบค่าเดิมทิ้ง */
export function setManualAirport(periodId: string, code: string): ManualAirports {
  const rows = { ...loadManualAirports() };
  const normalized = code.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(normalized)) rows[periodId] = normalized;
  else delete rows[periodId];
  writeJson(KEY, rows);
  return rows;
}
