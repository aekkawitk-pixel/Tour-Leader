'use client';

/**
 * เอกสารประจำตัว — /guide/profile/documents — หนังสือเดินทาง/วีซ่า
 * (บัตรหัวหน้าทัวร์/บัตรประชาชน ย้ายไปเป็นตัวเลือกชื่อเอกสารในแท็บ "เอกสารอื่น ๆ" แล้ว)
 *
 * แก้ไขได้เองแล้ว — ใช้ component เดียวกับฝั่งผู้จัดตรง ๆ (LeaderPassportTab, LeaderDocumentsCard)
 * ทุกตัวดึงข้อมูล/สิทธิ์เองผ่าน useDemo() + can() ไม่ต้องส่ง prop เพิ่ม แค่ leader ก็พอ
 * (โครงเดียวกับแท็บ "เอกสารประจำตัว" ในหน้าผู้จัด src/app/leaders/[id]/page.tsx)
 *
 * ⚠️ ก่อนหน้านี้ role 'leader' ไม่มีสิทธิ์ passport.* เลย (ดู src/lib/permissions.ts) จึงต้อง
 * เพิ่มให้ก่อนหัวข้อนี้จะแก้ไขได้จริง — ให้เท่ากับ coordinator ยกเว้น "ลบถาวร" (passport.delete)
 * ที่ยังสงวนไว้ให้ผู้จัดเท่านั้น เพราะลบแล้วประวัติหายและย้อนกลับไม่ได้
 * ปลอดภัยเพราะ /leaders/[id] (หน้าที่ component พวกนี้เคยใช้ดูของ "คนอื่น") ถูกกันด้วย
 * canViewPath ที่ AppShell อยู่แล้ว — role leader เข้าหน้านั้นไม่ได้เลยไม่ว่ากรณีใด
 */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { LeaderPassportTab } from '@/components/leaders/LeaderPassportTab';
import {
  IDENTITY_DOC_KINDS,
  LeaderDocumentsCard,
} from '@/components/leaders/documents/LeaderDocumentsCard';
import { Card, EmptyState } from '@/components/ui/Primitives';
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideProfileDocumentsPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="เอกสารประจำตัว" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProfileBackHeader title="เอกสารประจำตัว" />

      <LeaderPassportTab leader={leader} />

      <LeaderDocumentsCard
        leader={leader}
        kinds={IDENTITY_DOC_KINDS}
        title="วีซ่า"
        description="วีซ่าของประเทศปลายทาง"
      />
    </div>
  );
}
