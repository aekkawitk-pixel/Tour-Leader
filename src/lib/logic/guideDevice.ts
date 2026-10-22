/**
 * อุปกรณ์และความปลอดภัยของแอปหัวหน้าทัวร์ (โปรไฟล์ → อุปกรณ์) — ตรรกะล้วน ทดสอบได้
 *
 * Demo: เว็บล็อกแอปจริงไม่ได้ ค่าเหล่านี้จึงเป็นการตั้งค่าที่จำไว้ในเครื่องเท่านั้น
 * ระบบจริงต้องย้ายไปเก็บฝั่งแอป/เซิร์ฟเวอร์ (PIN ห้ามเก็บในเบราว์เซอร์)
 */

export type DeviceKind = 'phone' | 'tablet' | 'desktop';

export interface DetectedDevice {
  /** ชื่อที่แสดง เช่น iPhone · SM-A556E · คอมพิวเตอร์ Windows */
  name: string;
  kind: DeviceKind;
  /** ใช้เลือกคำเรียก "Face ID" (iOS) หรือ "ปลดล็อกด้วยใบหน้า" (ระบบอื่น) */
  os: 'ios' | 'android' | 'other';
}

/**
 * เดาเครื่องจาก User-Agent — ใช้แสดงชื่อ "เครื่องนี้" เท่านั้น ไม่ใช้ตัดสินสิทธิ์ใด ๆ
 * iPad รุ่นใหม่แสร้งเป็น Mac (Macintosh + จอสัมผัส) จึงต้องดู maxTouchPoints ประกอบ
 */
export function detectDevice(userAgent: string, maxTouchPoints = 0): DetectedDevice {
  const ua = userAgent || '';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return { name: 'iPad', kind: 'tablet', os: 'ios' };
  if (/iPhone/.test(ua)) return { name: 'iPhone', kind: 'phone', os: 'ios' };
  if (/Android/.test(ua)) {
    // "Android 14; SM-A556E)" หรือ "Android 14; SM-A556E Build/..." → รุ่นเครื่อง · ไม่มี/ถูกซ่อน ("K") → "Android"
    const model = ua.match(/Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?[;)]/)?.[1]?.trim();
    const name = model && model !== 'K' && !/^wv$/i.test(model) ? model : 'Android';
    return { name, kind: /Mobile/.test(ua) ? 'phone' : 'tablet', os: 'android' };
  }
  if (/Windows/.test(ua)) return { name: 'คอมพิวเตอร์ Windows', kind: 'desktop', os: 'other' };
  if (/Macintosh/.test(ua)) return { name: 'Mac', kind: 'desktop', os: 'other' };
  if (/Linux|CrOS/.test(ua)) return { name: 'คอมพิวเตอร์', kind: 'desktop', os: 'other' };
  return { name: 'เบราว์เซอร์นี้', kind: 'desktop', os: 'other' };
}

/** ตัวเลือกล็อกอัตโนมัติ (นาทีที่ไม่ได้ใช้งาน) — 0 = ล็อกทันทีที่ออกจากแอป */
export const AUTO_LOCK_OPTIONS: readonly { minutes: number; label: string }[] = [
  { minutes: 0, label: 'ทันที' },
  { minutes: 1, label: '1 นาที' },
  { minutes: 5, label: '5 นาที' },
  { minutes: 15, label: '15 นาที' },
  { minutes: 30, label: '30 นาที' },
];

export const DEFAULT_AUTO_LOCK_MINUTES = 5;

export function autoLockLabel(minutes: number): string {
  return AUTO_LOCK_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes} นาที`;
}

export const PIN_LENGTH = 6;

/**
 * ตรวจ PIN ใหม่ — คืนข้อความผิดพลาด (แสดงต่อผู้ใช้ได้) หรือ null เมื่อใช้ได้
 * กติกา: ตัวเลข 6 หลัก · ห้ามเลขเดียวกันทั้งหมด · ห้ามเรียงขึ้น/ลง · สองช่องต้องตรงกัน
 */
export function validateNewPin(pin: string, confirm: string): string | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return `PIN ต้องเป็นตัวเลข ${PIN_LENGTH} หลัก`;
  if (/^(\d)\1+$/.test(pin)) return 'PIN ง่ายเกินไป — ห้ามใช้เลขเดียวกันทั้งหมด';
  const digits = [...pin].map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  if (steps.every((s) => s === 1) || steps.every((s) => s === -1)) return 'PIN ง่ายเกินไป — ห้ามใช้เลขเรียงกัน';
  if (pin !== confirm) return 'PIN ใหม่ทั้งสองช่องไม่ตรงกัน';
  return null;
}

/**
 * แฮช PIN สำหรับ Demo (FNV-1a 32 บิต ผูกกับรหัสหัวหน้าทัวร์) — ไม่เก็บ PIN ตรง ๆ ในเครื่อง
 * ⚠️ ไม่ใช่การเข้ารหัสที่ปลอดภัย ใช้กันไม่ให้ PIN โผล่ใน localStorage เท่านั้น
 */
export function hashPin(leaderId: string, pin: string): string {
  let h = 0x811c9dc5;
  for (const ch of `zego-pin:${leaderId}:${pin}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
