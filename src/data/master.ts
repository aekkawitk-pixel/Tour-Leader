/**
 * ⚠️ ข้อมูลจำลองสำหรับ Demo เท่านั้น — ไม่ใช่ข้อมูลจริงขององค์กร
 * ข้อมูลตั้งต้น (Master data) ของระบบตั้งค่า
 *
 * หมายเหตุ: "ประเทศ" และ "เส้นทาง" ย้ายไปอยู่ที่ src/data/geo.ts
 * เพราะเป็นข้อมูลลำดับชั้น (ประเทศ → ภูมิภาค/เมือง/สนามบิน/เส้นทางทัวร์)
 */

import type { MasterDataMap } from '@/types';

let seq = 0;
const item = (code: string, name: string, order: number, extra?: string, active = true) => {
  seq += 1;
  return { id: `M-${String(seq).padStart(3, '0')}`, code, name, extra, order, active };
};

export const masterData: MasterDataMap = {
  /**
   * ภาษา — 10 รายการแรกสร้างด้วย item() (ครอง id M-001..M-010, seq=10)
   * เพื่อให้กลุ่มถัดไป (customerGroups) ยังเริ่มที่ M-011 ตามที่ seed อ้างอิงไว้
   * ภาษาที่เพิ่มใหม่ใช้ id ช่วง M-1xx (ไม่กระทบ seq · id ภาษาอ้างอิงด้วยชื่อไม่ใช่ id)
   */
  languages: [
    // 10 รายการแรก — item() ครอง id M-001..M-010 (seq=10)
    item('EN', 'อังกฤษ', 2),
    item('JA', 'ญี่ปุ่น', 5),
    item('KO', 'เกาหลี', 6),
    item('ZH', 'จีนกลาง', 3),
    item('VI', 'เวียดนาม', 13),
    item('FR', 'ฝรั่งเศส', 7),
    item('IT', 'อิตาลี', 10),
    item('DE', 'เยอรมัน', 8),
    item('RU', 'รัสเซีย', 11),
    item('ES', 'สเปน', 9),
    // ภาษาที่เพิ่มใหม่ — id ช่วง M-1xx (ไม่กระทบ seq)
    { id: 'M-101', code: 'TH', name: 'ไทย', order: 1, active: true },
    { id: 'M-102', code: 'YUE', name: 'จีนกวางตุ้ง', order: 4, active: true },
    { id: 'M-103', code: 'AR', name: 'อาหรับ', order: 12, active: true },
    { id: 'M-104', code: 'MY', name: 'เมียนมา', order: 14, active: true },
    { id: 'M-105', code: 'LO', name: 'ลาว', order: 15, active: true },
    { id: 'M-106', code: 'KM', name: 'เขมร', order: 16, active: true },
    { id: 'M-107', code: 'MS', name: 'มลายู', order: 17, active: true },
    { id: 'M-108', code: 'ID', name: 'อินโดนีเซีย', order: 18, active: true },
  ],

  /** ประเภทกลุ่มลูกค้า — ใช้จับคู่กับประเภทกรุ๊ปของงาน */
  customerGroups: [
    item('GROUP_ALL', 'ได้ทุกประเภท', 0, 'ตรงกับทุกประเภทกรุ๊ปในการค้นหาและจับคู่งาน'),
    item('GROUP_WALKIN', 'กรุ๊ปหน้าร้าน', 1),
    item('GROUP_CHARTER', 'กรุ๊ปเหมา', 2),
    item('GROUP_CORP', 'กรุ๊ปองค์กร', 3),
    item('GROUP_STUDY', 'กรุ๊ปศึกษาดูงาน', 4),
    item('GROUP_FAMILY', 'กรุ๊ปครอบครัว', 5),
    item('GROUP_SENIOR', 'กรุ๊ปผู้สูงอายุ', 6),
    item('GROUP_VIP', 'กรุ๊ป VIP', 7),
    item('GROUP_INCENTIVE', 'กรุ๊ป Incentive', 8),
  ],

  /**
   * ทักษะและรูปแบบการทำงาน
   *
   * ไม่มีรายการรวมแบบ "ถ่ายรูปและวิดีโอ" โดยตั้งใจ — คนที่ทำได้ทั้งสองอย่างให้ติ๊กสองรายการ
   * ถ้ามีรายการรวมด้วย จะเกิดสองปัญหา: ผู้กรอกไม่รู้ว่าควรติ๊กอันไหน และการค้นหา
   * "ถ่ายภาพนิ่ง" จะไม่เจอคนที่ติ๊กเฉพาะรายการรวมไว้
   */
  workSkills: [
    item('SKILL_ALL', 'ได้ทุกประเภท', 0, 'ตรงกับทุกทักษะในการค้นหาและจับคู่งาน'),
    item('SKILL_PHOTO', 'ถ่ายภาพนิ่ง', 1, 'ถ่ายภาพให้ลูกค้าและเก็บภาพกรุ๊ประหว่างเดินทาง'),
    item('SKILL_VIDEO', 'ถ่ายวิดีโอ', 2, 'ถ่ายและตัดต่อคลิปสั้นของกรุ๊ป'),
    item('SKILL_LIVE', 'ไลฟ์สด', 3, 'ไลฟ์ระหว่างเดินทางและตอบผู้ชมสด'),
  ],

  expenseTypes: [
    item('HOTEL', 'ค่าที่พัก', 1),
    item('MEAL', 'ค่าอาหาร', 2),
    item('TRANSPORT', 'ค่าพาหนะ / รถโค้ช', 3),
    item('TICKET', 'ค่าบัตรเข้าชม', 4),
    item('TIP', 'ค่าทิปคนขับ / ไกด์ท้องถิ่น', 5),
    item('VISA', 'ค่าวีซ่าและเอกสาร', 6),
    item('COMM', 'ค่าโทรศัพท์ / อินเทอร์เน็ต', 7),
    item('EMERGENCY', 'ค่าใช้จ่ายฉุกเฉิน', 8),
    item('MISC', 'ค่าใช้จ่ายเบ็ดเตล็ด', 9),
    item('FEE', 'ค่าตอบแทนหัวหน้าทัวร์', 10),
  ],
  currencies: [
    item('THB', 'บาท', 1, '1'),
    item('JPY', 'เยนญี่ปุ่น', 2, '0.23'),
    item('KRW', 'วอนเกาหลี', 3, '0.026'),
    item('CNY', 'หยวนจีน', 4, '4.95'),
    item('TWD', 'ดอลลาร์ไต้หวัน', 5, '1.12'),
    item('EUR', 'ยูโร', 6, '38.50'),
    item('CHF', 'ฟรังก์สวิส', 7, '40.20'),
    item('USD', 'ดอลลาร์สหรัฐ', 8, '35.80'),
    item('TRY', 'ลีราตุรกี', 9, '1.05'),
    item('NZD', 'ดอลลาร์นิวซีแลนด์', 10, '21.40'),
    item('VND', 'ดองเวียดนาม', 11, '0.0014'),
    item('GEL', 'ลารีจอร์เจีย', 12, '13.20'),
  ],
  banks: [
    item('KBANK', 'ธนาคารกสิกรไทย', 1),
    item('SCB', 'ธนาคารไทยพาณิชย์', 2),
    item('BBL', 'ธนาคารกรุงเทพ', 3),
    item('KTB', 'ธนาคารกรุงไทย', 4),
    item('BAY', 'ธนาคารกรุงศรีอยุธยา', 5),
    item('TTB', 'ธนาคารทหารไทยธนชาต', 6),
    item('GSB', 'ธนาคารออมสิน', 7, undefined, false),
  ],
};

/** รหัสพิเศษที่หมายถึง "ได้ทุกประเภท" */
export const ALL_CUSTOMER_GROUPS_CODE = 'GROUP_ALL';
export const ALL_WORK_SKILLS_CODE = 'SKILL_ALL';

/**
 * รหัสของทักษะที่ผู้ใช้พิมพ์เอง (ไม่มีในข้อมูลตั้งต้น)
 * ไม่มี masterId ให้อ้าง จึงใช้ "ชื่อ" เป็นตัวแยกว่าซ้ำกันหรือไม่
 */
export const CUSTOM_SKILL_CODE = 'SKILL_CUSTOM';

/** ชื่อกลุ่มข้อมูลตั้งต้นสำหรับแสดงเป็น Tabs ในหน้าตั้งค่า */
export const MASTER_GROUP_LABEL: Record<keyof MasterDataMap, string> = {
  languages: 'ภาษา',
  customerGroups: 'ประเภทกลุ่มลูกค้า',
  workSkills: 'ทักษะและความถนัด',
  expenseTypes: 'ประเภทค่าใช้จ่าย',
  currencies: 'สกุลเงิน',
  banks: 'ธนาคาร',
};

/** คำอธิบายช่อง "ข้อมูลเสริม" ของแต่ละกลุ่ม */
export const MASTER_EXTRA_LABEL: Record<keyof MasterDataMap, string> = {
  languages: 'หมายเหตุ',
  customerGroups: 'หมายเหตุ',
  workSkills: 'หมายเหตุ',
  expenseTypes: 'หมายเหตุ',
  currencies: 'อัตราแลกเปลี่ยน (บาท)',
  banks: 'หมายเหตุ',
};
