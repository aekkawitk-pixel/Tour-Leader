'use client';

/**
 * เอกสารการเงิน — /guide/profile/bank — ดูและแก้ไขบัญชีธนาคารได้ (reuse LeaderSectionEditModal section='bank')
 * แสดงครบทุกช่องที่ฟอร์มกรอกได้: ธนาคาร · ชื่อบัญชี · เลขที่บัญชี (ปิดบัง) · สาขา · PromptPay · บัญชีหลัก · เปิด/ปิดใช้งาน
 */

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
              <li key={b.id} className={`flex items-start justify-between gap-2 px-4 py-2.5 ${b.active === false ? 'opacity-70' : ''}`}>
                <div className="min-w-0">
                  <p className="text-sm font-medium zego-text">{b.bank}</p>
                  <p className="text-xs zego-text-tertiary">{b.accountName} · {b.accountNoMasked}</p>
                  {b.branch && <p className="text-xs zego-text-tertiary">สาขา{b.branch}</p>}
                  {b.promptPay && <p className="text-xs zego-text-tertiary">PromptPay {b.promptPay}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {b.isPrimary && <Pill tone="blue">บัญชีหลัก</Pill>}
                  {b.active === false && <Pill tone="slate">ปิดใช้งาน</Pill>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 pb-4 pt-2">
          {/* ยังไม่มีบัญชี = "เพิ่ม" (เดิมขึ้น "แก้ไข" ทั้งที่ไม่มีอะไรให้แก้) */}
          <Button variant="primary" icon={leader.bankAccounts.length === 0 ? 'plus' : 'edit'} className="w-full" onClick={() => setEditOpen(true)}>
            {leader.bankAccounts.length === 0 ? 'เพิ่มบัญชีธนาคาร' : 'แก้ไขบัญชีธนาคาร'}
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
