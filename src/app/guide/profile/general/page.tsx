'use client';

/** ข้อมูลทั่วไป — /guide/profile/general — ดูและแก้ไขได้ (reuse GeneralInfoEditModal ของฝั่งผู้จัด) */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { GENDER, MARITAL_STATUS, RELIGION } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { Button, Card, EmptyState } from '@/components/ui/Primitives';
import { GeneralInfoEditModal } from '@/components/leaders/GeneralInfoEditModal';
import { ProfileBackHeader } from '../ProfileBackHeader';

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 zego-divider-bottom py-2 last:border-b-0">
      <dt className="shrink-0 text-xs zego-text-tertiary">{label}</dt>
      <dd className={`text-right text-sm ${empty ? 'zego-text-disabled' : 'zego-text'}`}>{empty ? 'ยังไม่ระบุ' : value}</dd>
    </div>
  );
}

export default function GuideGeneralInfoPage() {
  const router = useRouter();
  const { currentUser, leaders, countries } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const [editOpen, setEditOpen] = useState(false);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ข้อมูลทั่วไป" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  const nationality = countries.find((c) => c.id === leader.nationalityCountryId);
  const nameTh = `${leader.title} ${leader.firstName} ${leader.lastName}`.trim();
  const nameEn = [leader.titleEn, leader.firstNameEn, leader.lastNameEn].filter(Boolean).join(' ').trim();
  const nicknameFull = [leader.nickname, leader.nicknameEn].filter(Boolean).join(' / ');

  return (
    <div>
      <ProfileBackHeader title="ข้อมูลทั่วไป" />
      <Card>
        <dl>
          <Row label="ชื่อ–นามสกุล (ไทย)" value={nameTh} />
          <Row label="ชื่อ–นามสกุล (อังกฤษ)" value={nameEn} />
          <Row label="ชื่อเล่น" value={nicknameFull} />
          <Row label="เพศ" value={GENDER[leader.gender]?.label} />
          <Row label="วันเกิด" value={leader.birthDate ? formatDate(leader.birthDate) : undefined} />
          <Row label="สัญชาติ" value={nationality ? `${nationality.nameTh} (${nationality.nameEn})` : undefined} />
          <Row
            label="ศาสนา"
            value={leader.religion ? (leader.religion === 'other' ? `${RELIGION.other} (${leader.religionOther || '—'})` : RELIGION[leader.religion]) : undefined}
          />
          <Row label="สถานภาพสมรส" value={leader.maritalStatus ? MARITAL_STATUS[leader.maritalStatus] : undefined} />
          <Row label="วันที่เริ่มร่วมงาน" value={leader.joinedAt ? formatDate(leader.joinedAt) : undefined} />
        </dl>
        <Button variant="primary" icon="edit" className="mt-4 w-full" onClick={() => setEditOpen(true)}>
          แก้ไขข้อมูลทั่วไป
        </Button>
      </Card>

      <GeneralInfoEditModal
        open={editOpen}
        leader={leader}
        onClose={() => setEditOpen(false)}
        onGoStatus={() => { setEditOpen(false); router.push('/guide/profile/leave'); }}
      />
    </div>
  );
}
