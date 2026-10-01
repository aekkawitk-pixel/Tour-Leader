/**
 * เวลาเครื่องออกที่กรอกเอง — ใช้เฉพาะกรุ๊ปที่ยังไม่มีข้อมูลเที่ยวบินในระบบ
 *
 * เวลาบินจริงมาจาก Sector ของพีเรียด ซึ่งปัจจุบันมีเฉพาะข้อมูลที่นำเข้าจาก Zego
 * กรุ๊ปที่มาจาก CSV จึงไม่มีเวลาบิน และคำนวณเวลาไปส่ง (เครื่องออก − 3 ชม.) ไม่ได้
 *
 * ที่เก็บนี้ให้ผู้จัดกรอกเวลาเองไปก่อนเพื่อให้จัดงานต่อได้
 * ⚠️ เวลาจริงจาก Sector ต้องชนะค่าที่กรอกเองเสมอ — ค่าที่กรอกเองเป็นเพียงตัวแทนชั่วคราว
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'sendOffManualFlightTimes';

/** periodId → เวลาเครื่องออก "HH:MM" */
export type ManualFlightTimes = Record<string, string>;

export function loadManualFlightTimes(): ManualFlightTimes {
  const parsed = readJson<ManualFlightTimes | null>(KEY, null);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

/** บันทึกเวลาที่กรอกเอง — ค่าว่างหรือรูปแบบไม่ถูกต้อง = ลบค่าเดิมทิ้ง */
export function setManualFlightTime(periodId: string, time: string): ManualFlightTimes {
  const rows = { ...loadManualFlightTimes() };
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) rows[periodId] = time.trim();
  else delete rows[periodId];
  writeJson(KEY, rows);
  return rows;
}
