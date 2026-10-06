'use client';

/**
 * บัญชีผู้ใช้ — /guide/profile/account (พอร์ทัลหัวหน้าทัวร์)
 *
 * ดู User name · สถานะบัญชี · การตั้งรหัสผ่าน และ "ขอลิงก์เปลี่ยนรหัสผ่าน" ได้เอง
 * ⚠️ ไม่มีช่องกรอก/แสดงรหัสผ่าน — หลักการเดียวกับฝั่งผู้จัด (LeaderAccountTab): ตั้งรหัสผ่านผ่านลิงก์เท่านั้น
 *    (Demo: บันทึกว่าส่งลิงก์ไปช่องทางไหน เมื่อไร ไม่ได้ส่งจริง · ระบบจริงต้องส่งผ่านระบบ Auth)
 * สร้างบัญชี / เปลี่ยน User name / ล็อก / ปิดการใช้งาน = เจ้าหน้าที่เท่านั้น
 * คำขอทุกครั้งลงประวัติบัญชี — เจ้าหน้าที่เห็นในแท็บบัญชีผู้ใช้ฝั่งผู้จัด
 */

import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { formatDateTime, toISODateTime } from '@/lib/format';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { getLeaderAccount, LEADER_ACCOUNT_STATUS, saveLeaderAccount, type LeaderAccount } from '@/services/leaderAccountStore';
import { ProfileBackHeader } from '../ProfileBackHeader';

/** ปิดบังช่องทางบางส่วน — c***@gmail.com · 08x-xxx-5678 */
function maskEmail(v: string): string {
  const [user, domain] = v.split('@');
  return domain ? `${user.slice(0, 1)}***@${domain}` : v;
}
function maskPhone(v: string): string {
  const digits = v.replace(/\D/g, '');
  return digits.length >= 4 ? `xxx-xxx-${digits.slice(-4)}` : v;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 zego-divider-bottom py-2 last:border-b-0">
      <dt className="shrink-0 text-xs zego-text-tertiary">{label}</dt>
      <dd className="text-right text-sm zego-text">{value}</dd>
    </div>
  );
}

export default function GuideAccountPage() {
  const { currentUser, leaders, pushToast } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const [account, setAccount] = useState<LeaderAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ตอน mount
    setAccount(leader ? getLeaderAccount(leader.id) : null);
    setLoaded(true);
  }, [leader]);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="บัญชีผู้ใช้" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  // ช่องทางส่งลิงก์ — อีเมลหลัก ไม่มีใช้เบอร์โทรหลัก (SMS) · ลำดับเดียวกับฝั่งผู้จัด
  const contacts = leader.contacts ?? [];
  const pick = (type: 'email' | 'phone') => contacts.find((c) => c.type === type && c.isPrimary)?.value ?? contacts.find((c) => c.type === type)?.value;
  const email = pick('email');
  const phone = pick('phone');
  const channel = email ? `อีเมล ${maskEmail(email)}` : phone ? `SMS ${maskPhone(phone)}` : null;
  const lastPasswordEvent = account?.history.filter((h) => h.action === 'send_setup' || h.action === 'send_reset' || h.action === 'self_reset').at(-1);
  const canRequest = !!account && account.status === 'active' && !!channel;

  const requestReset = () => {
    if (!account || !channel) return;
    try {
      const at = toISODateTime(new Date());
      const saved = saveLeaderAccount({
        ...account,
        passwordPending: true,
        history: [...account.history, { at, by: currentUser.name, action: 'self_reset', note: `ส่งไปที่ ${channel}` }],
      });
      setAccount(saved);
      pushToast('success', 'ส่งลิงก์เปลี่ยนรหัสผ่านแล้ว (Demo — ไม่ได้ส่งจริง)', channel);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'ส่งลิงก์ไม่สำเร็จ');
    }
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="บัญชีผู้ใช้" />

      {!loaded ? null : !account ? (
        <Card>
          <EmptyState icon="guide" title="ยังไม่มีบัญชีผู้ใช้" description="กรุณาติดต่อเจ้าหน้าที่ฝ่ายจัดหัวหน้าทัวร์ เพื่อสร้างบัญชีเข้าสู่ระบบ" />
        </Card>
      ) : (
        <>
          <Card>
            <dl>
              <Row label="User name" value={<span className="font-mono">{account.username}</span>} />
              <Row label="สถานะบัญชี" value={<StatusBadge meta={LEADER_ACCOUNT_STATUS[account.status]} size="sm" />} />
              <Row
                label="รหัสผ่าน"
                value={account.passwordPending
                  ? <span className="text-amber-800">รอตั้งรหัสผ่านจากลิงก์</span>
                  : 'ตั้งแล้ว'}
              />
              {lastPasswordEvent && <Row label="ส่งลิงก์ล่าสุด" value={`${formatDateTime(lastPasswordEvent.at)}${lastPasswordEvent.note ? ` · ${lastPasswordEvent.note.replace('ส่งไปที่ ', '')}` : ''}`} />}
              {account.lastLoginAt && <Row label="เข้าสู่ระบบล่าสุด" value={formatDateTime(account.lastLoginAt)} />}
            </dl>
          </Card>

          <Card className="space-y-2">
            <p className="text-sm font-semibold zego-text">เปลี่ยนรหัสผ่าน</p>
            <p className="text-xs zego-text-secondary">
              ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่{channel ? <span className="font-medium zego-text"> {channel}</span> : 'ช่องทางที่ลงทะเบียนไว้'} — รหัสเดิมใช้ได้จนกว่าจะตั้งรหัสใหม่
            </p>
            <Button variant="primary" icon="mail" className="w-full justify-center" disabled={!canRequest} onClick={() => setConfirmOpen(true)}>
              ขอลิงก์เปลี่ยนรหัสผ่าน
            </Button>
            {account.status !== 'active' && (
              <p className="text-xs text-amber-800">บัญชี{LEADER_ACCOUNT_STATUS[account.status].label} — กรุณาติดต่อเจ้าหน้าที่</p>
            )}
            {account.status === 'active' && !channel && (
              <p className="text-xs text-amber-800">ยังไม่มีอีเมลหรือเบอร์โทรในข้อมูลติดต่อ — เพิ่มที่หัวข้อ &quot;ข้อมูลติดต่อ&quot; ก่อน</p>
            )}
          </Card>

          <p className="px-1 text-xs zego-text-tertiary">เปลี่ยน User name หรือปลดล็อกบัญชี กรุณาติดต่อเจ้าหน้าที่</p>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={requestReset}
        title="ขอลิงก์เปลี่ยนรหัสผ่าน?"
        message={`ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ไปที่ ${channel ?? ''}`}
        confirmLabel="ส่งลิงก์"
      />
    </div>
  );
}
