'use client';

/** ภาษา — /guide/profile/languages — ใช้ LanguageSkillsPanel ของฝั่งผู้จัดตรงๆ (แก้ไขได้ในตัวอยู่แล้ว) */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { Card, EmptyState } from '@/components/ui/Primitives';
import { LanguageSkillsPanel } from '@/components/leaders/LanguageSkillsPanel';
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideLanguagesPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ภาษา" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  return (
    <div>
      <ProfileBackHeader title="ภาษา" />
      <LanguageSkillsPanel leader={leader} canEdit />
    </div>
  );
}
