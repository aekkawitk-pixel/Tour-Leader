/**
 * ป้ายชื่อสนามบิน — รหัส IATA คู่กับชื่อที่คนเรียกกันจริง
 *
 * BKK = สุวรรณภูมิ · DMK = ดอนเมือง — สองสนามบินนี้อยู่คนละฝั่งกรุงเทพฯ
 * คนจัดต้องแยกออกทันทีว่ากรุ๊ปนี้ไปส่งที่ไหน ลำพังรหัส 3 ตัวอ่านพลาดกันได้
 *
 * ชื่อมาจาก Airport Master ชุดเดียวกับที่ใช้ทั้งระบบ ไม่ได้เขียนคู่ไว้ที่นี่
 */

import { airportByIata } from '@/data/airports';

/** "BKK" → "BKK · สุวรรณภูมิ" · รหัสที่ไม่รู้จักหรือว่าง คืนค่าเดิม ไม่เดาชื่อให้ */
export function airportLabel(iata: string | null | undefined): string {
  const code = (iata ?? '').trim();
  if (!code || code === '-') return code || '-';
  const name = airportByIata(code)?.nameTh?.trim();
  return name ? `${code} · ${name}` : code;
}

/** ชื่อสนามบินอย่างเดียว — ไม่รู้จักก็ใช้รหัสแทน (ไม่คืนค่าว่าง) */
export function airportName(iata: string | null | undefined): string {
  const code = (iata ?? '').trim();
  if (!code || code === '-') return '-';
  return airportByIata(code)?.nameTh?.trim() || code;
}

/** สนามบินสองแห่งนี้คนละที่กันหรือไม่ — ไม่รู้ฝั่งใดฝั่งหนึ่ง = ตอบไม่ได้ (false) */
export function isDifferentAirport(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').trim().toUpperCase();
  const y = (b ?? '').trim().toUpperCase();
  if (!x || !y || x === '-' || y === '-') return false;
  return x !== y;
}
