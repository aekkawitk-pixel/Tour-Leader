/** เมนูและสิทธิ์ตามบทบาท — ใช้ทดลองว่าผู้ใช้แต่ละกลุ่มเห็นอะไรต่างกัน */

import type { DemoUser, Role } from '@/types';

export type NavKey =
  | 'dashboard'
  | 'leaders'
  | 'jobs'
  | 'calendar'
  | 'expenses'
  | 'groupExpenses'
  | 'settlements'
  | 'appointments'
  | 'reports'
  | 'sendOffStaff'
  | 'zego'
  | 'tourPeriods'
  | 'leaderMaster'
  | 'holidays'
  | 'settings';

export interface NavItem {
  key: NavKey;
  label: string;
  href: string;
  icon: string; // ชื่อไอคอนใน components/ui/Icon.tsx
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'ภาพรวม',
    href: '/',
    icon: 'dashboard',
    // ฝ่ายบัญชีไม่เห็น 3 เมนูแรก (ภาพรวม / หัวหน้าทัวร์ / การจัดสเก็ต) — เป็นงานของฝ่ายจัดหัวหน้าทัวร์ ไม่ใช่งานการเงิน
    // กั้นการเปิดหน้าด้วย (canViewPath ใช้ roles ชุดเดียวกัน) ไม่ใช่แค่ซ่อนเมนู
    roles: ['admin', 'coordinator', 'leader'],
  },
  {
    key: 'leaders',
    label: 'หัวหน้าทัวร์',
    href: '/leaders',
    icon: 'users',
    roles: ['admin', 'coordinator'],
  },
  {
    key: 'jobs',
    // ป้ายที่แสดงต่อผู้ใช้ (เมนู/โมดูล) — key/href/permission 'job.*'/icon คงเดิม ไม่กระทบระบบ
    label: 'การจัดสเก็ต',
    href: '/jobs',
    icon: 'briefcase',
    // หัวหน้าทัวร์ไม่เห็นเมนูนี้ — เป็นหน้าจัดคนลงงาน ไม่ใช่หน้าดูงานของตัวเอง
    roles: ['admin', 'coordinator'],
  },
  {
    key: 'calendar',
    label: 'ปฏิทินงาน',
    href: '/calendar',
    icon: 'calendar',
    roles: ['admin', 'coordinator', 'accounting', 'leader'],
  },
  {
    key: 'groupExpenses',
    // เอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้า .xls) → การเงินจัดซอง → ส่งมอบ → ติดตามเงินในซอง — แยกจาก "ตรวจสอบรายการจ่าย"
    // (หน้านั้นเป็นคิวตรวจ/อนุมัติใบที่หัวหน้าทัวร์ส่งมา) · เฉพาะฝ่ายบัญชี/การเงินและผู้ดูแลระบบ
    label: 'จัดการค่าใช้จ่ายกรุ๊ป',
    href: '/group-expenses',
    icon: 'money',
    roles: ['admin', 'accounting'],
  },
  {
    key: 'expenses',
    // เดิม "เบิกจ่าย" — ใช้งานจริงคือคิวตรวจสอบ/อนุมัติรายการจ่ายที่หัวหน้าทัวร์ส่งมา
    label: 'ตรวจสอบรายการจ่าย',
    href: '/expenses',
    icon: 'receipt',
    roles: ['admin', 'coordinator', 'accounting', 'leader'],
  },
  {
    key: 'settlements',
    label: 'เคลียร์งาน',
    href: '/settlements',
    icon: 'checklist',
    roles: ['admin', 'accounting', 'leader'],
  },
  {
    key: 'appointments',
    label: 'นัดหมาย',
    href: '/appointments',
    icon: 'clock',
    roles: ['admin', 'coordinator', 'accounting', 'leader'],
  },
  {
    key: 'reports',
    label: 'รายงาน',
    href: '/reports',
    icon: 'chart',
    roles: ['admin', 'coordinator', 'accounting'],
  },
  {
    key: 'sendOffStaff',
    // เจ้าหน้าที่ไปส่งกรุ๊ปที่สนามบิน — คนละชุดกับหัวหน้าทัวร์ที่เดินทางไปกับกรุ๊ป
    label: 'เจ้าหน้าที่ส่งกรุ๊ป',
    href: '/send-off-staff',
    icon: 'users',
    roles: ['admin', 'coordinator'],
  },
  /*
    เมนูตั้งแต่ตรงนี้ลงไปเห็นได้เฉพาะผู้ดูแลระบบ — เป็นข้อมูลตั้งต้นและการเชื่อมต่อระบบภายนอก
    ที่กระทบทั้งระบบเมื่อแก้ ไม่ใช่งานประจำวันของฝ่ายจัดหัวหน้าทัวร์หรือบัญชี
  */
  {
    key: 'zego',
    // ดึงโปรแกรมทัวร์จาก Zego API มาเก็บไว้ใช้ในระบบ (ข้อมูลต้นทางของรายการทัวร์)
    label: 'โปรแกรมทัวร์ (Zego)',
    href: '/zego',
    icon: 'download',
    roles: ['admin'],
  },
  {
    key: 'tourPeriods',
    label: 'Master รายการทัวร์',
    href: '/tour-periods',
    icon: 'grid',
    roles: ['admin'],
  },
  {
    key: 'leaderMaster',
    label: 'Master หัวหน้าทัวร์',
    href: '/leader-master',
    icon: 'users',
    roles: ['admin'],
  },
  {
    key: 'holidays',
    label: 'วันหยุด',
    href: '/holidays',
    icon: 'calendar',
    roles: ['admin'],
  },
  {
    key: 'settings',
    label: 'ตั้งค่าระบบ',
    href: '/settings',
    icon: 'settings',
    roles: ['admin'],
  },
];

/**
 * เมนูที่เปิดให้ทดลองใช้ในรอบนี้ — "หัวหน้าทัวร์" และ "การจัดสเก็ต" เท่านั้น
 *
 * เมนูอื่น "ยังแสดงในรายการ" แต่กดไม่ได้ และติดป้าย "กำลังพัฒนา"
 * เพื่อให้เห็นภาพรวมว่าระบบเต็มมีอะไรบ้าง · หน้าและสิทธิ์เดิมยังอยู่ครบ ไม่ได้ลบทิ้ง
 *
 * เปิดเมนูเพิ่ม → ใส่ NavKey ลงชุดนี้ · เปิดครบทุกเมนู → ตั้งเป็น null
 */
const TRIAL_NAV_KEYS: ReadonlySet<NavKey> | null = new Set<NavKey>(['dashboard', 'leaders', 'jobs', 'calendar', 'expenses', 'groupExpenses', 'settlements', 'holidays', 'zego', 'sendOffStaff']);

/** ป้ายกำกับเมนูที่ยังไม่เปิดให้ใช้ในรอบทดลอง */
export const IN_DEVELOPMENT_LABEL = 'กำลังพัฒนา';

/** เมนูนี้กดเข้าใช้งานได้หรือยัง (false = แสดงไว้แต่กดไม่ได้) */
export function isNavEnabled(key: NavKey): boolean {
  return !TRIAL_NAV_KEYS || TRIAL_NAV_KEYS.has(key);
}

/**
 * เมนูที่ครอบคลุม path นี้ — เทียบแบบเดียวกับการไฮไลต์เมนูใน Sidebar
 * ไม่ตรงเมนูไหนเลย (เช่นหน้าย่อยที่ไม่ได้อยู่ในเมนู) คืน null = ไม่กั้น
 */
export function navItemForPath(pathname: string): NavItem | null {
  const match = NAV_ITEMS.filter((i) => (i.href === '/'
    ? pathname === '/'
    : pathname === i.href || pathname.startsWith(`${i.href}/`)));
  // เลือกเมนูที่ href ยาวที่สุด — /leaders กับ /leader-master ต้องไม่จับสลับกัน
  return match.sort((x, y) => y.href.length - x.href.length)[0] ?? null;
}

/**
 * บทบาทนี้เปิดหน้านี้ได้หรือไม่ — ใช้ชุดสิทธิ์เดียวกับเมนู
 * ซ่อนเมนูอย่างเดียวไม่พอ เพราะพิมพ์ URL ตรงหรือค้างอยู่หน้าเดิมตอนสลับบทบาทก็ยังเข้าถึงได้
 */
export function canViewPath(role: Role, pathname: string): boolean {
  const item = navItemForPath(pathname);
  return !item || item.roles.includes(role);
}

/** หน้าแรกที่บทบาทนี้เปิดได้ — ใช้พาออกจากหน้าที่ไม่มีสิทธิ์ */
export function landingPathForRole(role: Role): string {
  // หัวหน้าทัวร์ใช้พอร์ทัลมือถือของตัวเอง (/guide) แยกจากเมนูฝั่งผู้จัดทั้งหมด — ไม่อยู่ใน NAV_ITEMS
  if (role === 'leader') return '/guide';
  // เจ้าหน้าที่ส่งกรุ๊ปใช้พอร์ทัลมือถือของตัวเอง (/staff)
  if (role === 'sendoff') return '/staff';
  return navForRole(role).find((i) => isNavEnabled(i.key))?.href ?? '/';
}

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** สิทธิ์เชิงการกระทำ */
export type Permission =
  | 'leader.create'
  | 'leader.edit'
  | 'leader.changeStatus'
  | 'job.create'
  | 'job.edit'
  | 'job.assignLeader'
  | 'job.changeStatus'
  // เมนู "การจัดสเก็ต" — จัดตาราง/มอบหมายเท่านั้น (สร้าง/แก้ข้อมูลทัวร์ใช้ job.* ของโมดูลทัวร์)
  | 'schedule.view'
  | 'schedule.assign'
  | 'schedule.update'
  | 'schedule.unassign'
  | 'schedule.view_tour_detail'
  | 'schedule.match'
  | 'schedule.override'
  | 'schedule.view_matching_detail'
  | 'schedule.manage_matching_rules'
  | 'expense.create'
  | 'expense.approve'
  | 'expense.pay'
  | 'settlement.review'
  | 'settlement.close'
  | 'settlement.submitDocs'
  | 'appointment.create'
  | 'appointment.manage'
  | 'report.export'
  | 'holiday.manage'
  | 'settings.manage'
  // สิทธิ์หนังสือเดินทาง (§11) — แยกละเอียดเพื่อคุมการเข้าถึงข้อมูลอ่อนไหว
  | 'passport.view'
  | 'passport.viewFull'
  | 'passport.edit'
  | 'passport.changePrimary'
  | 'passport.uploadImage'
  | 'passport.deactivate'
  | 'passport.delete';

const PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'leader.create',
    'leader.edit',
    'leader.changeStatus',
    'job.create',
    'job.edit',
    'job.assignLeader',
    'job.changeStatus',
    'schedule.view',
    'schedule.assign',
    'schedule.update',
    'schedule.unassign',
    'schedule.view_tour_detail',
    'schedule.match',
    'schedule.override',
    'schedule.view_matching_detail',
    'schedule.manage_matching_rules',
    'expense.create',
    'expense.approve',
    'expense.pay',
    'settlement.review',
    'settlement.close',
    'settlement.submitDocs',
    'appointment.create',
    'appointment.manage',
    'report.export',
    'holiday.manage',
    'settings.manage',
    // Admin เอกสาร — เห็นเลขเต็ม + จัดการหนังสือเดินทางได้ทุกอย่าง
    'passport.view',
    'passport.viewFull',
    'passport.edit',
    'passport.changePrimary',
    'passport.uploadImage',
    'passport.deactivate',
    'passport.delete',
  ],
  coordinator: [
    'leader.create',
    'leader.edit',
    'leader.changeStatus',
    'job.create',
    'job.edit',
    'job.assignLeader',
    'job.changeStatus',
    'schedule.view',
    'schedule.assign',
    'schedule.update',
    'schedule.unassign',
    'schedule.view_tour_detail',
    'schedule.match',
    'schedule.override',
    'schedule.view_matching_detail',
    'appointment.create',
    'appointment.manage',
    'report.export',
    'holiday.manage',
    // ผู้ประสานงาน — แก้ไข/จัดการหนังสือเดินทางได้ แต่ไม่เห็นเลขเต็ม (ต้องเป็น Admin เอกสาร)
    'passport.view',
    'passport.edit',
    'passport.changePrimary',
    'passport.uploadImage',
    'passport.deactivate',
  ],
  accounting: [
    'expense.approve',
    'expense.pay',
    'settlement.review',
    'settlement.close',
    'schedule.view',
    'schedule.view_tour_detail',
    'schedule.view_matching_detail',
    'appointment.create',
    'appointment.manage',
    'report.export',
  ],
  // เจ้าหน้าที่ส่งกรุ๊ป — ใช้พอร์ทัลมือถือ /staff (รับซองเงินจากการเงิน → ส่งต่อให้หัวหน้าทัวร์) ไม่มีสิทธิ์ในเมนูฝั่งผู้จัด
  sendoff: [],
  leader: [
    'expense.create',
    'settlement.submitDocs',
    'schedule.view',
    'schedule.view_tour_detail',
    'schedule.view_matching_detail',
    // เอกสารประจำตัวในพอร์ทัลมือถือ (§ /guide/profile/documents) — จัดการของตัวเองได้เต็มที่
    // เท่ากับ coordinator ยกเว้น passport.delete (ลบถาวร ประวัติหาย ย้อนกลับไม่ได้ สงวนให้ผู้จัด)
    // ปลอดภัยเพราะ /leaders/[id] ถูกกันด้วย canViewPath อยู่แล้ว — role นี้เข้าดูของคนอื่นไม่ได้
    'passport.view',
    'passport.viewFull',
    'passport.edit',
    'passport.changePrimary',
    'passport.uploadImage',
    'passport.deactivate',
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return PERMISSIONS[role].includes(permission);
}

/**
 * สิทธิ์แก้ไข "ตารางเจ้าหน้าที่ส่งกรุ๊ป" — ผูกกับตัวบุคคล (Schedule Administrator) ไม่ใช่ตามบทบาทเหมือนสิทธิ์อื่น
 *
 * นโยบาย: กำหนด Schedule Administrator ไว้คนเดียว (ผู้จัดสเก็ต) — ผู้ใช้อื่นทุกคนรวมถึง coordinator/admin
 * ปกติเห็นตารางนี้ได้ตามสิทธิ์เมนูเดิม (View / Limited Access) แต่แก้ไข/ย้าย/มอบหมายเองไม่ได้โดยพลการ
 * ต่างจาก schedule.assign ของตารางหัวหน้าทัวร์ที่เปิดกว้างตามบทบาท เพราะฝ่ายนี้ต้องคุมคนที่แก้ตารางให้แคบกว่านั้น
 */
export const SEND_OFF_SCHEDULE_ADMIN_USER_IDS: readonly string[] = ['U-006'];

export function canEditSendOffSchedule(user: Pick<DemoUser, 'id'>): boolean {
  return SEND_OFF_SCHEDULE_ADMIN_USER_IDS.includes(user.id);
}

/** คำอธิบายขอบเขตข้อมูลที่แต่ละบทบาทมองเห็น (ใช้แสดงใน Header) */
/**
 * ขอบเขตข้อมูลของผู้ใช้ — หัวหน้าทัวร์เห็นเฉพาะของตัวเอง บทบาทอื่นเห็นทั้งหมด
 *
 * คืนรหัสหัวหน้าทัวร์ที่ต้องกรอง · null = ไม่กรอง (เห็นทุกคน)
 * ⚠️ บทบาทหัวหน้าทัวร์ที่ยังไม่ผูกรหัส คืนค่าว่างเพื่อให้กรองแล้วไม่เหลืออะไร
 *    ปลอดภัยกว่าปล่อยผ่านจนเห็นข้อมูลคนอื่นทั้งระบบ
 */
export function ownLeaderScope(user: { role: Role; leaderId?: string }): string | null {
  return user.role === 'leader' ? (user.leaderId ?? '') : null;
}

export const ROLE_SCOPE: Record<Role, string> = {
  admin: 'เห็นทุกเมนูและทุกงาน',
  coordinator: 'จัดงานและหัวหน้าทัวร์ ไม่เห็นการอนุมัติเงิน',
  accounting: 'ดูแลใบเบิกและการเคลียร์งาน',
  leader: 'เห็นเฉพาะงานและใบเบิกของตนเอง',
  sendoff: 'ใช้พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป (/staff) เท่านั้น',
};
