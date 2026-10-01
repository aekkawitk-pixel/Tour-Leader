'use client';

/** เอกสารการเงิน — /guide/profile/bank — ดูและแก้ไขบัญชีธนาคารได้ (reuse LeaderSectionEditModal section='bank') */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { Button, Card, EmptyState, Pill } from '@/components/ui/Primitives';
import { LeaderSectionEditModal } from '@/components/leaders/LeaderSectionEditModal';
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideBankPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const [editOpen, setEditOpen] = useState(false);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="เอกสารการเงิน" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  return (
    <div>
      <ProfileBackHeader title="เอกสารการเงิน" />
      <Card padded={false}>
        {leader.bankAccounts.length === 0 ? (
          <EmptyState icon="money" title="ยังไม่มีบัญชีธนาคารในระบบ" />
        ) : (
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {leader.bankAccounts.map((b) => (
              <li key={b.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium zego-text">{b.bank}</p>
                  <p className="text-xs zego-text-tertiary">{b.accountName} · {b.accountNoMasked}</p>
                  {b.branch && <p className="text-xs zego-text-tertiary">สาขา{b.branch}</p>}
                </div>
                {b.isPrimary && <Pill tone="blue">บัญชีหลัก</Pill>}
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 pb-4 pt-2">
          <Button variant="primary" icon="edit" className="w-full" onClick={() => setEditOpen(true)}>
            แก้ไขบัญชีธนาคาร
          </Button>
        </div>
      </Card>

      <LeaderSectionEditModal
        open={editOpen}
        leader={leader}
        section="bank"
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}
