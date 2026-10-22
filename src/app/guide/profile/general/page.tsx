'use client';

/**
 * ข้อมูลทั่วไป — /guide/profile/general — ดูและแก้ไขได้ (reuse GeneralInfoEditModal ของฝั่งผู้จัด)
 *
 * หน้าแสดงต้องมีครบทุกช่องที่ฟอร์มแก้ได้ เรียงลำดับ/ชื่อช่อง/รูปแบบเดียวกับฟอร์ม — กรอกอะไรไปต้องเห็นอย่างนั้น
 * (เดิมไม่แสดงรูปประจำตัว รหัส และประเทศที่เกิด · รวมชื่อเล่นไทย/อังกฤษเป็นบรรทัดเดียว · สัญชาติคนละรูปแบบกับฟอร์ม)
 * ไม่แสดง: ความพร้อมรับงาน (ดูที่หน้าสถานะ/การลา) · แหล่งที่มาของข้อมูล (ข้อมูลระบบของฝ่ายจัด — ฟอร์มฝั่งหัวหน้าทัวร์ซ่อนไว้)
 */

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
    <div className="zego-guide-inforow zego-divider-bottom py-2 last:border-b-0">
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

  // ประเทศ — รูปแบบเดียวกับช่องเลือกในฟอร์ม "THAILAND (ไทย)"
  const countryText = (id: string | undefined) => {
    const c = countries.find((x) => x.id === id);
    return c ? `${c.nameEn} (${c.nameTh})` : undefined;
  };
  const nameTh = [leader.title, leader.firstName, leader.lastName].filter(Boolean).join(' ').trim();
  const nameEn = [leader.titleEn, leader.firstNameEn, leader.lastNameEn].filter(Boolean).join(' ').trim();
  const initials = leader.avatarInitials || `${leader.firstName.slice(0, 1)}${leader.lastName.slice(0, 1)}`;

  return (
    <div>
      <ProfileBackHeader title="ข้อมูลทั่วไป" />
      <Card>
        {/* รูปประจำตัว — ช่องแรกของฟอร์ม */}
        <div className="flex items-center gap-3 zego-divider-bottom pb-3">
          {leader.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Data URL จาก Demo ใช้ next/image ไม่ได้
            <img src={leader.photoUrl} alt="รูปประจำตัว" className="zego-guide-avatar h-14 w-14 object-cover" />
          ) : (
            <span className="zego-guide-avatar h-14 w-14 text-xl" aria-hidden="true">{initials}</span>
          )}
          <div className="min-w-0">
            <p className="text-xs zego-text-tertiary">รูปประจำตัว</p>
            <p className={`text-sm ${leader.photoUrl ? 'zego-text' : 'zego-text-disabled'}`}>
              {leader.photoUrl ? 'มีรูปแล้ว' : 'ยังไม่มีรูป — แสดงอักษรย่อชื่อแทน'}
            </p>
          </div>
        </div>
        {/* ลำดับเดียวกับฟอร์ม "แก้ไขข้อมูลทั่วไป" (GeneralInfoEditModal) — แก้ที่หนึ่งต้องแก้อีกที่ด้วย */}
        <dl>
          <Row label="รหัสหัวหน้าทัวร์" value={leader.id} />
          <Row label="เพศ" value={GENDER[leader.gender]?.label} />
          <Row label="ชื่อ–นามสกุล (ไทย)" value={nameTh} />
          <Row label="ชื่อ–นามสกุล (อังกฤษ)" value={nameEn} />
          <Row label="ชื่อเล่น" value={leader.nickname} />
          <Row label="ชื่อเล่น (อังกฤษ)" value={leader.nicknameEn} />
          <Row label="วันเกิด" value={leader.birthDate ? formatDate(leader.birthDate) : undefined} />
          <Row label="สัญชาติ" value={countryText(leader.nationalityCountryId)} />
          <Row label="ประเทศที่เกิด" value={countryText(leader.birthCountryId)} />
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
        selfService
      />
    </div>
  );
}
