'use client';

/**
 * ข้อมูลติดต่อ — /guide/profile/contact — ดูและแก้ไขได้ (reuse LeaderSectionEditModal section='contact')
 *
 * หน้าแสดงต้องมีครบทุกช่องที่ฟอร์มกรอกได้ — กรอกอะไรไปต้องเห็นอย่างนั้น
 *   ช่องทางติดต่อ: ประเภท/ป้ายกำกับ · ข้อมูล · ช่องทางหลัก · ช่วงเวลาที่สะดวก · หมายเหตุ
 *   ผู้ติดต่อฉุกเฉิน: ชื่อ · ความสัมพันธ์ · ผู้ติดต่อหลัก · เบอร์โทร · ช่องทางอื่น · หมายเหตุ
 *   ที่อยู่ปัจจุบัน: ทุกช่องของที่อยู่ + หมายเหตุเกี่ยวกับที่อยู่
 * (เดิมแสดงช่องโทร/อีเมล/LINE ตายตัวแม้ไม่ได้กรอก ไม่แสดงป้ายกำกับ ช่วงเวลา หมายเหตุ ช่องทางอื่นของผู้ติดต่อฉุกเฉิน
 *  และที่อยู่ที่กรอกแค่บางช่อง (เช่น ถนน) ขึ้นว่า "ยังไม่ระบุ")
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { CONTACT_TYPE } from '@/lib/labels';
import { formatAddress } from '@/modules/tour-leaders/utils';
import { Button, Card, EmptyState } from '@/components/ui/Primitives';
import { LeaderSectionEditModal } from '@/components/leaders/LeaderSectionEditModal';
import { ProfileBackHeader } from '../ProfileBackHeader';

/** แถวข้อมูล (ชื่อช่อง : ค่า) + บรรทัดรายละเอียดใต้ค่า (ถ้ามี) — รูปแบบเดียวกับหน้าย่อยอื่นของโปรไฟล์ */
function Row({ label, value, detail }: { label: string; value?: React.ReactNode; detail?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="zego-guide-inforow zego-divider-bottom py-2 last:border-b-0">
      <dt className="shrink-0 text-xs zego-text-tertiary">{label}</dt>
      <dd className={`text-right text-sm ${empty ? 'zego-text-disabled' : 'zego-text'}`}>
        {empty ? 'ยังไม่ระบุ' : value}
        {detail && <span className="mt-0.5 block text-xs zego-text-tertiary">{detail}</span>}
      </dd>
    </div>
  );
}

/** หัวกลุ่มข้อมูลในการ์ด */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-4 text-xs font-semibold zego-text-secondary first:mt-0">{children}</p>;
}

/** "(หลัก)" ต่อท้ายรายการที่ตั้งเป็นหลักในฟอร์ม */
const primaryMark = (isPrimary: boolean) => (isPrimary ? <span className="zego-chip zego-chip--green ml-1.5 px-1.5 py-0 text-[11px]">หลัก</span> : null);

export default function GuideContactPage() {
  const { currentUser, leaders, countries } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const [editOpen, setEditOpen] = useState(false);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ข้อมูลติดต่อ" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  // ช่องทางหลักขึ้นก่อน ที่เหลือตามลำดับที่กรอกในฟอร์ม
  const contacts = [...leader.contacts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const emergencyContacts = leader.emergencyContacts ?? [];
  const address = leader.address;
  // มีที่อยู่ = กรอกช่องใดช่องหนึ่งก็ได้ (เดิมดูแค่บ้านเลขที่/จังหวัด)
  const hasAddress = Boolean(address && [address.houseNo, address.building, address.villageNo, address.alley, address.road, address.subdistrict, address.district, address.province, address.postalCode].some((v) => v && v.trim()));

  return (
    <div>
      <ProfileBackHeader title="ข้อมูลติดต่อ" />
      <Card>
        <SectionTitle>ช่องทางติดต่อ</SectionTitle>
        {contacts.length === 0 ? (
          <p className="text-sm zego-text-disabled">ยังไม่มีช่องทางติดต่อ</p>
        ) : (
          <dl>
            {contacts.map((c) => (
              <Row
                key={c.id}
                // ประเภทตามที่เลือกในฟอร์ม · มีป้ายกำกับ (เช่น "เบอร์สำรอง") ต่อท้าย
                label={[CONTACT_TYPE[c.type]?.label ?? 'ช่องทางอื่น', c.label].filter(Boolean).join(' · ')}
                value={<>{c.value}{primaryMark(c.isPrimary)}</>}
                detail={[c.preferredContactTime && `สะดวก ${c.preferredContactTime}`, c.note].filter(Boolean).join(' · ') || undefined}
              />
            ))}
          </dl>
        )}

        <div className="mt-3 zego-divider-top pt-3">
          <SectionTitle>ผู้ติดต่อฉุกเฉิน</SectionTitle>
          {emergencyContacts.length === 0 ? (
            <p className="text-sm zego-text-disabled">ยังไม่มีผู้ติดต่อฉุกเฉิน</p>
          ) : (
            <dl>
              {emergencyContacts.map((c) => (
                <Row
                  key={c.id}
                  label={c.relation || 'ผู้ติดต่อ'}
                  value={<>{c.name}{primaryMark(c.isPrimary)}</>}
                  detail={[c.phone, c.otherChannel, c.note].filter(Boolean).join(' · ') || undefined}
                />
              ))}
            </dl>
          )}
        </div>

        <div className="mt-3 zego-divider-top pt-3">
          <SectionTitle>ที่อยู่ปัจจุบัน</SectionTitle>
          <p className={`text-sm ${hasAddress ? 'zego-text' : 'zego-text-disabled'}`}>
            {hasAddress && address ? formatAddress(address, countries) : 'ยังไม่ระบุ'}
          </p>
          {address?.note && <p className="mt-0.5 text-xs zego-text-tertiary">หมายเหตุ: {address.note}</p>}
        </div>

        <Button variant="primary" icon="edit" className="mt-4 w-full" onClick={() => setEditOpen(true)}>
          แก้ไขข้อมูลติดต่อ
        </Button>
      </Card>

      <LeaderSectionEditModal
        open={editOpen}
        leader={leader}
        section="contact"
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
