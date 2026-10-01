/**
 * Guide Group (§10) — จัดกลุ่มหัวหน้าทัวร์แบบ Many-to-Many
 *
 * ไม่เก็บกลุ่มเป็นข้อความเดียวในข้อมูลหัวหน้าทัวร์ (ตามข้อกำหนด) — สมาชิกกลุ่ม "คำนวณ" จากข้อมูลจริง
 * ที่มีอยู่แล้ว: ประเทศ/เส้นทางที่หัวหน้าทัวร์ถนัด (assignedCountries) + ประเภทหัวหน้าทัวร์ (leaderType)
 * หัวหน้าทัวร์ 1 คนอยู่ได้หลายกลุ่ม (เช่น JAPAN + ASIA) — คืนเป็น array ของ groupId
 */

export interface GuideGroup {
  id: string;
  label: string;
}

/** กลุ่มที่ระบบรู้จัก (อ้างอิงจากไฟล์ Excel เดิม) — เรียงตามลำดับที่ต้องการแสดง */
export const GUIDE_GROUPS: GuideGroup[] = [
  { id: 'JAPAN', label: 'JAPAN' },
  { id: 'CHINA', label: 'CHINA' },
  { id: 'ASIA', label: 'ASIA' },
  { id: 'EUROPE', label: 'EUROPE' },
  { id: 'AGENCY', label: 'AGENCY' },
  { id: 'OTHER', label: 'อื่น ๆ' },
];

const REGION_MATCHERS: { id: string; re: RegExp }[] = [
  { id: 'JAPAN', re: /ญี่ปุ่น|japan/i },
  { id: 'CHINA', re: /จีน|china|ฮ่องกง|hong\s*kong|มาเก๊า|macau|ไต้หวัน|taiwan/i },
  { id: 'ASIA', re: /เกาหลี|korea|เวียดนาม|vietnam|สิงคโปร์|singapore|มาเลเซีย|malaysia|ลาว|laos|กัมพูชา|cambodia|พม่า|เมียนมา|myanmar|อินเดีย|india|ภูฏาน|bhutan|เนปาล|nepal|บาหลี|bali|อินโดนีเซีย|indonesia|ฟิลิปปินส์|philippines|ดูไบ|dubai/i },
  { id: 'EUROPE', re: /ยุโรป|europe|อังกฤษ|england|ฝรั่งเศส|france|อิตาลี|italy|สวิ|swiss|เยอรมัน|german|สเปน|spain|รัสเซีย|russia|กรีซ|greece|ตุรกี|turkey/i },
];

/**
 * กลุ่มของหัวหน้าทัวร์หนึ่งคน (§10) — Many-to-Many คำนวณจาก:
 *   ชื่อประเทศที่ถนัด (map → ภูมิภาค) + ประเภท agent (→ AGENCY) · ไม่มีเลย → OTHER
 */
export function guideGroupsForLeader(countryNames: string[], leaderType: string): string[] {
  const set = new Set<string>();
  if (leaderType === 'agent') set.add('AGENCY');
  for (const name of countryNames) {
    for (const m of REGION_MATCHERS) if (m.re.test(name)) set.add(m.id);
  }
  if (set.size === 0) set.add('OTHER');
  return [...set];
}
