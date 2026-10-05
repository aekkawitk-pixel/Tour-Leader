/**
 * บัญชีผู้ใช้สำหรับเข้าสู่ระบบของหัวหน้าทัวร์ (User name / Login) — แท็บ "บัญชีผู้ใช้" ในหน้าโปรไฟล์
 *
 * ⚠️ ไม่เก็บรหัสผ่านในระบบนี้เด็ดขาด — การตั้ง/รีเซ็ตรหัสผ่านทำผ่าน "ส่งลิงก์ตั้งรหัสผ่าน" ให้หัวหน้าทัวร์ตั้งเอง
 *    (Demo: บันทึกเฉพาะว่าส่งลิงก์ไปช่องทางไหน เมื่อไร ไม่ได้ส่งจริง)
 * เก็บใน localStorage เหมือน Store อื่นของ Demo · เปลี่ยนเป็น REST/DB (ระบบ Auth จริง) ได้ที่ไฟล์นี้จุดเดียว
 */

import { readJson, writeJson } from './browserStorage';

const KEY = 'leaderLoginAccounts';

export type LeaderAccountStatus = 'active' | 'locked' | 'disabled';
export const LEADER_ACCOUNT_STATUS: Record<LeaderAccountStatus, { label: string; tone: 'green' | 'amber' | 'slate' }> = {
  active: { label: 'ใช้งานได้', tone: 'green' },
  locked: { label: 'ถูกล็อก', tone: 'amber' },
  disabled: { label: 'ปิดการใช้งาน', tone: 'slate' },
};

export type LeaderAccountAction = 'create' | 'rename' | 'send_setup' | 'send_reset' | 'lock' | 'unlock' | 'disable' | 'enable';
export const LEADER_ACCOUNT_ACTION: Record<LeaderAccountAction, string> = {
  create: 'สร้างบัญชี',
  rename: 'เปลี่ยน User name',
  send_setup: 'ส่งลิงก์ตั้งรหัสผ่าน',
  send_reset: 'ส่งลิงก์รีเซ็ตรหัสผ่าน',
  lock: 'ล็อกบัญชี',
  unlock: 'ปลดล็อกบัญชี',
  disable: 'ปิดการใช้งาน',
  enable: 'เปิดการใช้งาน',
};

export interface LeaderAccountEvent {
  at: string;
  by: string;
  action: LeaderAccountAction;
  note?: string;
}

export interface LeaderAccount {
  leaderId: string;
  username: string;
  status: LeaderAccountStatus;
  /** ยังไม่ได้ตั้งรหัสผ่าน / ต้องตั้งใหม่ (หลังส่งลิงก์รีเซ็ต) */
  passwordPending: boolean;
  lastLoginAt?: string;
  createdAt: string;
  createdBy: string;
  history: LeaderAccountEvent[];
}

/** User name: a–z 0–9 . _ - · 4–30 ตัว · ขึ้นต้นด้วยตัวอักษร (เก็บเป็นตัวพิมพ์เล็กเสมอ) */
export const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{3,29}$/;
export const normalizeUsername = (v: string) => v.trim().toLowerCase();

export function loadLeaderAccounts(): Record<string, LeaderAccount> {
  const raw = readJson<unknown>(KEY, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, LeaderAccount>) : {};
}

export function getLeaderAccount(leaderId: string): LeaderAccount | null {
  return loadLeaderAccounts()[leaderId] ?? null;
}

/** User name ซ้ำกับบัญชีอื่นหรือไม่ (ไม่สนตัวพิมพ์) */
export function usernameTaken(username: string, exceptLeaderId?: string): boolean {
  const u = normalizeUsername(username);
  return Object.values(loadLeaderAccounts()).some((a) => a.leaderId !== exceptLeaderId && a.username === u);
}

export function saveLeaderAccount(acc: LeaderAccount): LeaderAccount {
  const all = loadLeaderAccounts();
  if (usernameTaken(acc.username, acc.leaderId)) throw new Error(`User name “${acc.username}” ถูกใช้แล้ว`);
  all[acc.leaderId] = acc;
  writeJson(KEY, all);
  return acc;
}

/** User name แนะนำ — ชื่ออังกฤษ.ตัวแรกนามสกุล (เช่น suphamitr.s) · ไม่มีชื่ออังกฤษใช้รหัสหัวหน้าทัวร์ · ซ้ำเติมเลข */
export function suggestUsername(leader: { id: string; firstNameEn?: string; lastNameEn?: string }): string {
  const first = (leader.firstNameEn ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const last = (leader.lastNameEn ?? '').toLowerCase().replace(/[^a-z]/g, '');
  let base = first ? `${first}${last ? `.${last[0]}` : ''}` : leader.id.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!/^[a-z]/.test(base)) base = `tl${base}`;
  base = base.slice(0, 26);
  if (base.length < 4) base = base.padEnd(4, '0');
  let candidate = base;
  for (let n = 2; usernameTaken(candidate, leader.id); n += 1) candidate = `${base}${n}`;
  return candidate;
}
