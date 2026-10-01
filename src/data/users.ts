/** ⚠️ ข้อมูลจำลองสำหรับ Demo — ไม่มีระบบ Login จริง ใช้สลับบทบาทเพื่อทดลองสิทธิ์ */

import type { DemoUser } from '@/types';

export const demoUsers: DemoUser[] = [
  {
    id: 'U-001',
    name: 'ณัฐพงศ์ วิริยะกุล',
    role: 'admin',
    position: 'ผู้ดูแลระบบ / IT',
    active: true,
  },
  {
    id: 'U-002',
    name: 'พิมพ์ชนก สุริยะ',
    role: 'coordinator',
    position: 'หัวหน้าฝ่ายจัดหัวหน้าทัวร์',
    active: true,
  },
  {
    id: 'U-003',
    name: 'อรวรรณ เจริญทรัพย์',
    role: 'accounting',
    position: 'เจ้าหน้าที่บัญชีอาวุโส',
    active: true,
  },
  {
    id: 'U-004',
    // ผูกกับหัวหน้าทัวร์ที่มีอยู่จริงใน Master — รหัสเดิม TL-001 ไม่มีในชุดข้อมูลปัจจุบัน
    // จึงกรองไม่เจออะไรเลยและดูเหมือนเห็นข้อมูลคนอื่นได้
    name: 'ชัยมงคล ตติยวงศ์วิวัฒน์',
    role: 'leader',
    position: 'หัวหน้าทัวร์ (TL-000001)',
    leaderId: 'TL-000001',
    active: true,
  },
  {
    id: 'U-005',
    name: 'กิตติศักดิ์ พูนสวัสดิ์',
    role: 'coordinator',
    position: 'เจ้าหน้าที่จัดหัวหน้าทัวร์',
    active: false,
  },
  {
    id: 'U-006',
    // Schedule Administrator ของตารางเจ้าหน้าที่ส่งกรุ๊ป — สิทธิ์แก้ตารางนี้ผูกกับ id ไว้ตรง ๆ
    // ดู permissions.ts: SEND_OFF_SCHEDULE_ADMIN_USER_IDS
    name: 'ผู้จัดสเก็ต',
    role: 'coordinator',
    roleLabel: 'ฝ่ายจัดสเก็ต',
    position: 'ผู้จัดสเก็ต — ตารางเจ้าหน้าที่ส่งกรุ๊ป',
    active: true,
  },
  {
    id: 'U-007',
    // ผูกกับทะเบียนเจ้าหน้าที่ส่งกรุ๊ป (SOS-001) — เห็นเฉพาะซองเงินที่การเงินฝากตัวเองไปส่งหัวหน้าทัวร์
    name: 'ธนกฤต วงศ์สุวรรณ (เอ)',
    role: 'sendoff',
    position: 'เจ้าหน้าที่ส่งกรุ๊ป (SOS-001)',
    sendOffStaffId: 'SOS-001',
    active: true,
  },
];

/** ผู้ใช้เริ่มต้นของ Demo (สลับได้จาก Header) */
export const DEFAULT_USER_ID = 'U-002';
