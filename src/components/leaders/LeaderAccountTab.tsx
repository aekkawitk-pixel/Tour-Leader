'use client';

/**
 * แท็บ "บัญชีผู้ใช้" ของหัวหน้าทัวร์ (ฝั่งผู้จัด) — ใช้ LoginAccountPanel ชุดเดียวกับเจ้าหน้าที่ส่งกรุ๊ป
 * ช่องทางส่งลิงก์ตั้งรหัสผ่าน = อีเมลหลัก ไม่มีใช้เบอร์โทรหลัก (SMS)
 */

import { useDemo } from '@/store/DemoStore';
import { LoginAccountPanel } from '@/components/accounts/LoginAccountPanel';
import type { TourLeader } from '@/types';

export function LeaderAccountTab({ leader }: { leader: TourLeader }) {
  const { users } = useDemo();
  const contacts = leader.contacts ?? [];
  const pick = (type: 'email' | 'phone') => contacts.find((c) => c.type === type && c.isPrimary)?.value ?? contacts.find((c) => c.type === type)?.value;
  const demoUser = users.find((u) => u.role === 'leader' && u.leaderId === leader.id);
  return (
    <LoginAccountPanel
      owner={{
        id: leader.id,
        who: 'หัวหน้าทัวร์',
        portal: 'พอร์ทัลหัวหน้าทัวร์',
        email: pick('email'),
        phone: pick('phone'),
        firstNameEn: leader.firstNameEn,
        lastNameEn: leader.lastNameEn,
        demoUser: demoUser ? { id: demoUser.id, name: demoUser.name } : undefined,
      }}
    />
  );
}
