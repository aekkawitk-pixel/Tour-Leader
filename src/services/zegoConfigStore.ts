/**
 * Zego Config Store — ค่าตั้งการเชื่อมต่อที่ผู้ใช้กรอกในหน้า "โปรแกรมทัวร์ (Zego)"
 *
 * ⚠️ เก็บใน localStorage ของเครื่องนั้น — ใครเปิด DevTools ที่เครื่องนั้นได้ก็อ่าน Token ได้
 *    ใช้กับงานจริงควรตั้ง ZEGO_API_TOKEN ฝั่งเซิร์ฟเวอร์แทน (env var ชนะค่าตรงนี้เสมอ)
 *    ที่ทำช่องกรอกไว้เพราะตั้งค่าแล้วใช้ได้ทันที ไม่ต้องแตะไฟล์และรีสตาร์ทเซิร์ฟเวอร์
 *
 * เปลี่ยนเป็น REST/DB ได้ที่ไฟล์นี้จุดเดียว
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'zegoApiConfig';

/** ขอบเขตที่จะดึงข้อมูล — ตรงกับ endpoint ที่ Zego API มีให้ */
export type ZegoScopeKind = 'all' | 'country' | 'iso' | 'product';

export interface ZegoConfig {
  /** Token สำหรับ header auth-token ('' = ยังไม่ได้ตั้ง) */
  token: string;
  scopeKind: ZegoScopeKind;
  /** ค่าประกอบขอบเขต เช่นรหัสประเทศ JP หรือรหัสโปรแกรม — scopeKind 'all' ไม่ใช้ */
  scopeValue: string;
}

export const EMPTY_ZEGO_CONFIG: ZegoConfig = { token: '', scopeKind: 'all', scopeValue: '' };

export function loadZegoConfig(): ZegoConfig {
  const parsed = readJson<Partial<ZegoConfig> | null>(KEY, null);
  if (!parsed || typeof parsed !== 'object') return EMPTY_ZEGO_CONFIG;
  const kind = parsed.scopeKind;
  return {
    token: typeof parsed.token === 'string' ? parsed.token : '',
    scopeKind: kind === 'country' || kind === 'iso' || kind === 'product' ? kind : 'all',
    scopeValue: typeof parsed.scopeValue === 'string' ? parsed.scopeValue : '',
  };
}

/** บันทึกค่าตั้ง — เขียนไม่สำเร็จจะโยน StorageWriteError (UI ต้องไม่บอกว่าสำเร็จ) */
export function saveZegoConfig(config: ZegoConfig): void {
  writeJson(KEY, config);
}

export function clearZegoConfig(): void {
  writeJson(KEY, EMPTY_ZEGO_CONFIG);
}

/** Query string ของขอบเขตที่เลือก — ต่อท้าย /api/zego/programtours ได้เลย */
export function scopeQuery(config: ZegoConfig): string {
  const value = config.scopeValue.trim();
  if (config.scopeKind === 'all' || !value) return '';
  return `?${config.scopeKind}=${encodeURIComponent(value)}`;
}

/** คำอธิบายขอบเขตแบบอ่านได้ — เก็บติดไปกับข้อมูลที่นำเข้า ให้รู้ว่าชุดนั้นครอบคลุมแค่ไหน */
export function scopeLabel(config: ZegoConfig): string {
  const value = config.scopeValue.trim();
  if (config.scopeKind === 'all' || !value) return 'ทั้งหมด';
  if (config.scopeKind === 'country') return `ประเทศ ${value}`;
  if (config.scopeKind === 'iso') return `ประเทศ (ISO) ${value}`;
  return `โปรแกรม ${value}`;
}

/** ปิดบัง Token ให้เหลือแค่ปลายท้าย — ใช้ยืนยันว่าใส่ถูกตัวโดยไม่ต้องโชว์ทั้งเส้น */
export function maskToken(token: string): string {
  const t = token.trim();
  if (t.length <= 8) return '••••';
  return `••••${t.slice(-6)}`;
}
