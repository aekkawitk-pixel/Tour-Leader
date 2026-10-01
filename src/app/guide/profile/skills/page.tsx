'use client';

/**
 * ความเชี่ยวชาญและทักษะ — /guide/profile/skills
 *
 * แก้ไขได้เองทุกหัวข้อ (ตามนโยบายเดียวกับหัวข้ออื่นในโปรไฟล์) — เปิด SkillSectionEditModal
 * เดียวกับฝั่งผู้จัด (src/app/leaders/[id]/page.tsx) ใช้ซ้ำตรง ๆ เพราะดึงข้อมูลจาก useDemo()
 * เอง ไม่ต้องการ prop เพิ่มนอกจาก leader/section
 *
 * ⚠️ แก้ไขสำคัญ: เดิมอ่านผ่าน getLeaderExpertise() ซึ่งอ่านฟิลด์เก่าบน TourLeader
 * (leader.routeSkills / tourSkills หมวด customer_group) ที่ฝั่งผู้จัดเลิกใช้แก้ไขแล้ว
 * ("โซน/ประเทศ/เส้นทาง" ย้ายไป expertiseScopeStore, "ประเภทกรุ๊ปที่ถนัด" ย้ายไป
 * groupExpertiseStore) เปลี่ยนมาอ่านจากสองแหล่งนี้ตรง ๆ เหมือนหน้าผู้จัด
 * (การ์ด "ทักษะและความถนัด" หมวด work_skill ถูกนำออกจากหน้าจอแล้ว — ข้อมูลเดิมยังอยู่ในโมเดล)
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getExpertiseScopes } from '@/services/expertiseScopeStore';
import { getGroupExpertise } from '@/services/groupExpertiseStore';
import { groupExpertiseName, groupExpertiseCountLabel, isAllGroups } from '@/lib/logic/groupExpertise';
import { ExpertiseScopeView } from '@/components/leaders/ExpertiseScopeView';
import { SkillSectionEditModal, type SkillSectionKey } from '@/components/leaders/SkillSectionEditModal';
import { Button, Card, CardHeader, EmptyState, Pill } from '@/components/ui/Primitives';
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideSkillsPage() {
  const { currentUser, leaders, countries } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  const [sectionEdit, setSectionEdit] = useState<{ section: SkillSectionKey; mode: 'add' | 'edit' } | null>(null);
  const [rev, setRev] = useState(0);
  const openSection = (section: SkillSectionKey, mode: 'add' | 'edit') => setSectionEdit({ section, mode });
  const closeSection = () => { setSectionEdit(null); setRev((v) => v + 1); };

  const expertiseScopes = useMemo(() => { void rev; return leader ? getExpertiseScopes(leader.id) : []; }, [leader, rev]);
  const groupCodes = useMemo(() => { void rev; return leader ? getGroupExpertise(leader.id) : []; }, [leader, rev]);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ความเชี่ยวชาญและทักษะ" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProfileBackHeader title="ความเชี่ยวชาญและทักษะ" />

      <Card>
        <CardHeader
          title="โซน ประเทศ และเส้นทางที่เชี่ยวชาญ"
          action={
            expertiseScopes.length > 0 ? (
              <Button size="sm" variant="secondary" icon="edit" onClick={() => openSection('country-route', 'edit')}>แก้ไข</Button>
            ) : undefined
          }
        />
        {expertiseScopes.length === 0 ? (
          <EmptyState
            icon="plane"
            title="ยังไม่มีความเชี่ยวชาญ"
            description="ยังไม่ได้ระบุโซน ประเทศ หรือเส้นทางที่เชี่ยวชาญ"
            action={<Button variant="primary" size="sm" onClick={() => openSection('country-route', 'add')}>เพิ่มความเชี่ยวชาญ</Button>}
          />
        ) : (
          <ExpertiseScopeView scopes={expertiseScopes} countries={countries} />
        )}
      </Card>

      <Card>
        <CardHeader
          title="ประเภทกรุ๊ปที่ถนัด"
          description={groupCodes.length > 0 ? groupExpertiseCountLabel(groupCodes) : undefined}
          action={
            groupCodes.length > 0 ? (
              <Button size="sm" variant="secondary" icon="edit" onClick={() => openSection('group-type', 'edit')}>แก้ไข</Button>
            ) : undefined
          }
        />
        {groupCodes.length === 0 ? (
          <EmptyState
            title="ยังไม่ได้ระบุประเภทกรุ๊ปที่ถนัด"
            action={<Button variant="primary" size="sm" onClick={() => openSection('group-type', 'add')}>เพิ่มข้อมูล</Button>}
          />
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {isAllGroups(groupCodes) ? (
              <Pill tone="green">ทุกประเภท</Pill>
            ) : (
              groupCodes.map((code) => <Pill key={code} tone="blue">{groupExpertiseName(code)}</Pill>)
            )}
          </div>
        )}
      </Card>

      <SkillSectionEditModal
        open={sectionEdit !== null}
        onClose={closeSection}
        leader={leader}
        section={sectionEdit?.section ?? 'country-route'}
        mode={sectionEdit?.mode ?? 'edit'}
      />
    </div>
  );
}
