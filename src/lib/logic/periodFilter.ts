/**
 * ตัวกรองพีเรียดที่ใช้ร่วมกันในหน้าต่างจัดงาน
 * ทั้งการจัดหัวหน้าทัวร์และการจัดเจ้าหน้าที่ส่งกรุ๊ปต้องค้นเจอกรุ๊ปเดียวกันด้วยคำค้นเดียวกัน
 * ถ้าแยกกันเขียน คนใช้จะเจอว่าพิมพ์แบบเดิมแล้วผลไม่เหมือนกันในสองหน้าต่าง
 */

import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

export function departsWithin(p: TourPeriodMaster, start: string, end: string): boolean {
  return p.startDate >= start && p.startDate <= end;
}

/** ป้ายสรุปประเทศที่เลือก — ไม่เลือกอะไร = ทุกประเทศ */
export function countryLabel(selected: string[]): string {
  return selected.length === 0 ? 'ทุกประเทศ' : selected.join(', ');
}

/**
 * ปรับข้อความให้เทียบกันได้ — ตัวพิมพ์เล็ก + ตัดขีด/ช่องว่าง
 * ทำให้พิมพ์ Group Code โดยมีหรือไม่มีขีดก็เจอ เช่น "DAD-260806B-VN" = "dad260806bvn"
 */
export function squash(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, '');
}

/**
 * งานนี้ตรงกับคำค้นหาหรือไม่ — ค้นจากฟิลด์จริงของ Tour Period Master
 *   groupCode · displayName (ชื่อโปรแกรม ไทย/อังกฤษ) · programCode (เสริม)
 * คำค้นว่าง = ไม่กรอง · ค้นแบบบางส่วน ไม่แยกตัวพิมพ์เล็ก–ใหญ่
 */
export function matchesQuery(p: TourPeriodMaster, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const plain = q.toLowerCase();
  // ชื่อโปรแกรมไทยมีช่องว่างในตัว จึงเทียบทั้งแบบเดิมและแบบตัดขีด/ช่องว่าง
  const fields = [p.groupCode, p.displayName, p.programCode ?? ''];
  return fields.some((f) => f.toLowerCase().includes(plain) || squash(f).includes(squash(q)));
}
