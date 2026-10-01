'use client';

/** ข้อมูลติดต่อ — /guide/profile/contact — ดูและแก้ไขได้ (reuse LeaderSectionEditModal section='contact') */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { CONTACT_TYPE } from '@/lib/labels';
import { formatAddress } from '@/modules/tour-leaders/utils';
import { Button, Card, EmptyState, Pill } from '@/components/ui/Primitives';
import { LeaderSectionEditModal } from '@/components/leaders/LeaderSectionEditModal';
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

  const contacts = [...leader.contacts].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const otherContacts = contacts.filter((c) => !['phone', 'email', 'line'].includes(c.type));
  const contactOf = (type: string) => contacts.filter((c) => c.type === type).map((c) => c.value).join(' · ');
  const hasAddress = Boolean(leader.address?.houseNo || leader.address?.province);
  const emergencyContacts = leader.emergencyContacts ?? [];

  return (
    <div>
      <ProfileBackHeader title="ข้อมูลติดต่อ" />
      <Card>
        <dl>
          <Row label="เบอร์โทรศัพท์" value={contactOf('phone')} />
          <Row label="อีเมล" value={contactOf('email')} />
          <Row label="LINE ID" value={contactOf('line')} />
          {otherContacts.map((c) => (
            <Row key={c.id} label={c.label || CONTACT_TYPE[c.type]?.label || 'ช่องทางอื่น'} value={c.value} />
          ))}
        </dl>

        <div className="mt-3 zego-divider-top pt-3">
          <p className="mb-1 text-xs font-semibold zego-text-secondary">ที่อยู่ปัจจุบัน</p>
          <p className={`text-sm ${hasAddress ? 'zego-text-secondary' : 'zego-text-disabled'}`}>
            {hasAddress ? formatAddress(leader.address, countries) : 'ยังไม่ระบุ'}
          </p>
        </div>

        <div className="mt-3 zego-divider-top pt-3">
          <p className="mb-1.5 text-xs font-semibold zego-text-secondary">ผู้ติดต่อฉุกเฉิน</p>
          {emergencyContacts.length === 0 ? (
            <p className="text-sm zego-text-disabled">ยังไม่มีผู้ติดต่อฉุกเฉิน</p>
          ) : (
            <ul className="space-y-1.5">
              {emergencyContacts.map((c) => (
                <li key={c.id} className="zego-border-color rounded-lg border px-2.5 py-1.5 text-sm">
                  <p className="flex flex-wrap items-center gap-1.5 font-medium zego-text">
                    {c.name}
                    {c.relation && <span className="text-xs font-normal zego-text-tertiary">({c.relation})</span>}
                    {c.isPrimary && <Pill tone="blue">หลัก</Pill>}
                  </p>
                  <p className="zego-text-secondary">{c.phone}</p>
                </li>
              ))}
            </ul>
          )}
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
