'use client';

/**
 * เอกสารอื่น ๆ — /guide/profile/documents/other — ประวัติอาชญากรรม/ใบเซอร์/เอกสารอื่นที่ระบุชื่อเอง
 *
 * แยกออกจากหน้า "เอกสารประจำตัว" (พาสปอร์ต/บัตรหัวหน้าทัวร์/บัตรประชาชน/วีซ่า) เป็นหน้าย่อยของตัวเอง
 * เพราะกลุ่มนี้เป็น "ไฟล์แนบเป็นเนื้อหาหลัก" ต่างชนิดกัน — ตรงกับแท็บ "เอกสารอื่น ๆ" แยกจากแท็บ
 * "เอกสารประจำตัว" ในหน้าผู้จัด src/app/leaders/[id]/page.tsx
 */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import {
  LeaderDocumentsCard,
  OTHER_DOC_KINDS,
} from '@/components/leaders/documents/LeaderDocumentsCard';
import { Card, EmptyState } from '@/components/ui/Primitives';
import { ProfileBackHeader } from '../../ProfileBackHeader';

export default function GuideProfileOtherDocumentsPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="เอกสารอื่น ๆ" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProfileBackHeader title="เอกสารอื่น ๆ" />

      <LeaderDocumentsCard
        leader={leader}
        kinds={OTHER_DOC_KINDS}
        addKind="other"
        title="เอกสารอื่น ๆ"
        description="เลือกชื่อเอกสารจาก list ตอนเพิ่ม — ทุกฉบับต้องแนบไฟล์ PDF หรือรูปภาพ"
      />
    </div>
  );
}
