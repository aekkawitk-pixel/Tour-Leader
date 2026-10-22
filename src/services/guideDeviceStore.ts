/**
 * การตั้งค่าอุปกรณ์ของหัวหน้าทัวร์ (โปรไฟล์ → อุปกรณ์) — เก็บในเบราว์เซอร์นี้ แยกตามรหัสหัวหน้าทัวร์
 *
 * Demo: ไม่มีระบบ Login/อุปกรณ์จริง — "เครื่องอื่น" เป็นข้อมูลตัวอย่าง (iPad Air) ให้ลองออกจากระบบได้
 * PIN เก็บเป็นแฮชเท่านั้น (ดู hashPin) · ระบบจริงต้องย้ายไปฝั่งแอป/เซิร์ฟเวอร์
 */

import { addDays } from '@/lib/format';
import { DEFAULT_AUTO_LOCK_MINUTES, type DeviceKind } from '@/lib/logic/guideDevice';
import { readJson, writeJson } from './browserStorage';

const KEY = 'guideDeviceSettings';

export interface OtherDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  /** วันที่ใช้งานล่าสุด (ISO date) */
  lastActiveAt: string;
}

export interface GuideDeviceSettings {
  /** แฮช PIN (null = ยังไม่ได้ตั้ง) */
  pinHash: string | null;
  /** วันที่ตั้ง/เปลี่ยน PIN ล่าสุด (ISO date) */
  pinUpdatedAt: string | null;
  autoLockMinutes: number;
  /** ปลดล็อกด้วยใบหน้า (Face ID) — ต้องตั้ง PIN ก่อน เพราะ PIN เป็นทางสำรองเมื่อสแกนไม่ผ่าน */
  faceUnlock: boolean;
  /** เก็บข้อมูลไว้ใช้ตอนไม่มีสัญญาณในเครื่องนี้ */
  offline: boolean;
  /** เครื่องอื่นที่ยังเข้าสู่ระบบอยู่ */
  otherDevices: OtherDevice[];
}

/** ค่าเริ่มต้นของคนที่ยังไม่เคยตั้ง — มีเครื่องอื่นตัวอย่าง 1 เครื่อง (ใช้ล่าสุด 4 วันก่อน) */
export function defaultDeviceSettings(today: string): GuideDeviceSettings {
  return {
    pinHash: null,
    pinUpdatedAt: null,
    autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    faceUnlock: false,
    offline: false,
    otherDevices: [{ id: 'DEV-IPAD-AIR', name: 'iPad Air', kind: 'tablet', lastActiveAt: addDays(today, -4) }],
  };
}

function loadAll(): Record<string, Partial<GuideDeviceSettings>> {
  const parsed = readJson<Record<string, Partial<GuideDeviceSettings>>>(KEY, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/** การตั้งค่าของหัวหน้าทัวร์คนนี้ (ช่องที่ขาด/เสียใช้ค่าเริ่มต้น) */
export function readDeviceSettings(leaderId: string, today: string): GuideDeviceSettings {
  const base = defaultDeviceSettings(today);
  const saved = loadAll()[leaderId];
  if (!saved || typeof saved !== 'object') return base;
  return {
    pinHash: typeof saved.pinHash === 'string' ? saved.pinHash : null,
    pinUpdatedAt: typeof saved.pinUpdatedAt === 'string' ? saved.pinUpdatedAt : null,
    autoLockMinutes: typeof saved.autoLockMinutes === 'number' ? saved.autoLockMinutes : base.autoLockMinutes,
    faceUnlock: saved.faceUnlock === true,
    offline: saved.offline === true,
    otherDevices: Array.isArray(saved.otherDevices) ? saved.otherDevices : base.otherDevices,
  };
}

/** บันทึกทั้งชุด — เขียนไม่สำเร็จโยน error ให้ผู้เรียกแจ้งผู้ใช้ */
export function writeDeviceSettings(leaderId: string, settings: GuideDeviceSettings): void {
  writeJson(KEY, { ...loadAll(), [leaderId]: settings });
}

/** ลืมเครื่องนี้ — ล้างการตั้งค่าทั้งหมดของหัวหน้าทัวร์คนนี้ในเครื่อง (PIN · ล็อก · ใบหน้า · ออฟไลน์) */
export function forgetDeviceSettings(leaderId: string): void {
  const all = loadAll();
  delete all[leaderId];
  writeJson(KEY, all);
}
