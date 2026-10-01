/**
 * ประเภทกรุ๊ปที่ถนัด (§2/§3/§7/§8) — Master group_expertise_types + Logic
 *
 * ทุกรายการมีสถานะเท่ากันหมด — เป็น "ประเภทกรุ๊ป" ที่ผู้ใช้กำหนดรายการเอง
 * เพิ่ม/แก้รายการได้ที่ GROUP_EXPERTISE_TYPES จุดเดียว ตรรกะด้านล่างไม่ผูกกับรายการใดเป็นพิเศษ
 *
 * ⚠️ กันซ้ำ (§8): ห้ามบันทึก ALL พร้อมกับประเภทเฉพาะ
 *   - เลือก ALL → เก็บ ['ALL'] อย่างเดียว
 *   - เลือกประเภทเฉพาะครบทุกประเภท → แปลงเป็น ['ALL'] อัตโนมัติ (§3)
 */

export type GroupExpertiseCode =
  | 'ALL' | 'RETAIL' | 'PRIVATE' | 'SALES' | 'VIP' | 'ENTERTAIN' | 'HISTORY';

export interface GroupExpertiseType {
  code: GroupExpertiseCode;
  nameTh: string;
  descTh: string;
  displayOrder: number;
}

/** Master ประเภทกรุ๊ป (§8) — แก้รายการที่นี่ที่เดียว */
export const GROUP_EXPERTISE_TYPES: GroupExpertiseType[] = [
  { code: 'ALL', nameTh: 'ทุกประเภท', descTh: 'สามารถดูแลได้ทุกประเภทกรุ๊ปในรายการนี้', displayOrder: 0 },
  { code: 'RETAIL', nameTh: 'กรุ๊ปหน้าร้าน', descTh: 'กรุ๊ปที่รวมลูกค้าจากหลายการจองหรือหลายครอบครัว เดินทางตามโปรแกรมที่บริษัทกำหนด', displayOrder: 1 },
  { code: 'PRIVATE', nameTh: 'กรุ๊ปเหมา', descTh: 'กรุ๊ปที่เดินทางเป็นกลุ่มเดียวกัน เช่น บริษัท องค์กร ครอบครัว โรงเรียน หรือกลุ่มส่วนตัว', displayOrder: 2 },
  { code: 'SALES', nameTh: 'กรุ๊ปเน้นยอดขาย / ลงร้าน', descTh: 'กรุ๊ปที่มีเป้าหมายยอดขายและมีคิวลงร้านตามโปรแกรม', displayOrder: 3 },
  { code: 'VIP', nameTh: 'กรุ๊ป VIP', descTh: 'ลูกค้าคาดหวังการดูแลใกล้ชิดและบริการเฉพาะบุคคล', displayOrder: 4 },
  { code: 'ENTERTAIN', nameTh: 'กรุ๊ปเน้น Entertain', descTh: 'ต้องสร้างบรรยากาศระหว่างเดินทาง เช่น เล่นเกม ร้องเพลง ดูแลอารมณ์กรุ๊ป', displayOrder: 5 },
  { code: 'HISTORY', nameTh: 'กรุ๊ปเน้นประวัติศาสตร์', descTh: 'ลูกค้าต้องการเนื้อหาเชิงลึกด้านประวัติศาสตร์และวัฒนธรรม', displayOrder: 6 },
];

/** ประเภทเฉพาะทั้งหมด (ทุกรายการที่ไม่ใช่ "ทุกประเภท") — อ่านจาก Master ไม่ฮาร์ดโค้ด */
export const SPECIFIC_GROUP_CODES: GroupExpertiseCode[] = GROUP_EXPERTISE_TYPES
  .filter((t) => t.code !== 'ALL')
  .map((t) => t.code);

export const groupExpertiseName = (code: GroupExpertiseCode): string =>
  GROUP_EXPERTISE_TYPES.find((t) => t.code === code)?.nameTh ?? code;

/** §3/§8 กันซ้ำ + ครบทุกประเภท = ALL — คืนค่าที่บันทึกจริง */
export function normalizeGroupExpertise(codes: GroupExpertiseCode[]): GroupExpertiseCode[] {
  const set = new Set(codes);
  if (set.has('ALL')) return ['ALL'];

  const specifics = SPECIFIC_GROUP_CODES.filter((c) => set.has(c));
  // §3 เลือกครบทุกประเภท → ทุกประเภท
  if (specifics.length === SPECIFIC_GROUP_CODES.length) return ['ALL'];
  return specifics;
}

/** toggle 1 ตัวเลือกตาม §3 (ALL ↔ เฉพาะ · เลือกเฉพาะหลัง ALL → ยกเลิก ALL) */
export function toggleGroupExpertise(
  codes: GroupExpertiseCode[],
  code: GroupExpertiseCode,
): GroupExpertiseCode[] {
  const set = new Set(normalizeGroupExpertise(codes));
  if (code === 'ALL') {
    return set.has('ALL') ? [] : ['ALL'];
  }
  set.delete('ALL'); // เลือกประเภทเฉพาะ → ยกเลิก ALL อัตโนมัติ
  if (set.has(code)) set.delete(code); else set.add(code);
  return normalizeGroupExpertise([...set]);
}

export const isAllGroups = (codes: GroupExpertiseCode[]): boolean =>
  normalizeGroupExpertise(codes).includes('ALL');

/** ข้อความจำนวนใน Card (§6): ALL = ครอบคลุมทุกประเภท · อื่น ๆ = "N ประเภท" */
export function groupExpertiseCountLabel(codes: GroupExpertiseCode[]): string {
  const norm = normalizeGroupExpertise(codes);
  if (norm.length === 0) return 'ยังไม่ระบุ';
  if (isAllGroups(norm)) return `ครอบคลุม ${SPECIFIC_GROUP_CODES.length} ประเภท`;
  return `${norm.length} ประเภท`;
}

/**
 * §7 ความเหมาะสมกับงาน — true = เหมาะ · false = ไม่ตรง · null = ยังไม่มีข้อมูล (ไม่ตัดออก)
 * งาน RETAIL เหมาะกับผู้เลือก RETAIL หรือ ALL · งาน PRIVATE เหมาะกับ PRIVATE หรือ ALL
 */
export function matchesGroupType(
  leaderCodes: GroupExpertiseCode[],
  jobType: 'RETAIL' | 'PRIVATE',
): boolean | null {
  const norm = normalizeGroupExpertise(leaderCodes);
  if (norm.length === 0) return null; // ยังไม่มีข้อมูลความถนัด
  if (norm.includes('ALL')) return true;
  return norm.includes(jobType);
}
