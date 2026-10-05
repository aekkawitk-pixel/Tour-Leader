'use client';

/**
 * แท็บ "บัญชีผู้ใช้" — จัดการ User name สำหรับเข้าสู่ระบบของหัวหน้าทัวร์ (เจ้าหน้าที่ที่แก้ข้อมูลหัวหน้าทัวร์ได้เท่านั้น)
 *
 *   ยังไม่มีบัญชี → สร้างบัญชี (User name แนะนำจากชื่ออังกฤษ) + ส่งลิงก์ตั้งรหัสผ่าน
 *   มีบัญชีแล้ว  → เปลี่ยน User name · ส่งลิงก์รีเซ็ตรหัสผ่าน · ล็อก/ปลดล็อก · ปิด/เปิดการใช้งาน · ประวัติ
 * ⚠️ ไม่มีช่องกรอก/แสดงรหัสผ่าน — หัวหน้าทัวร์ตั้งรหัสผ่านเองผ่านลิงก์ (Demo: บันทึกว่าส่งแล้ว ไม่ได้ส่งจริง)
 */

import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { formatDateTime, toISODateTime } from '@/lib/format';
import { Button, Callout, Card, CardHeader, StatusBadge, cx } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/FormField';
import {
  getLeaderAccount, LEADER_ACCOUNT_ACTION, LEADER_ACCOUNT_STATUS, normalizeUsername, saveLeaderAccount,
  suggestUsername, USERNAME_PATTERN, usernameTaken,
  type LeaderAccount, type LeaderAccountAction, type LeaderAccountStatus,
} from '@/services/leaderAccountStore';
import type { TourLeader } from '@/types';

const USERNAME_HINT = 'ตัวอักษรภาษาอังกฤษพิมพ์เล็ก ตัวเลข . _ - · 4–30 ตัว · ขึ้นต้นด้วยตัวอักษร';

export function LeaderAccountTab({ leader }: { leader: TourLeader }) {
  const { currentUser, pushToast, users } = useDemo();
  const canManage = can(currentUser.role, 'leader.edit');
  const [account, setAccount] = useState<LeaderAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState('');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ตอน mount
    setAccount(getLeaderAccount(leader.id));
    setLoaded(true);
  }, [leader.id]);

  // ช่องทางส่งลิงก์ตั้งรหัสผ่าน — อีเมลหลัก ไม่มีใช้เบอร์โทรหลัก (SMS)
  const contacts = leader.contacts ?? [];
  const pick = (type: 'email' | 'phone') => contacts.find((c) => c.type === type && c.isPrimary)?.value ?? contacts.find((c) => c.type === type)?.value;
  const email = pick('email');
  const phone = pick('phone');
  const channel = email ? `อีเมล ${email}` : phone ? `SMS ${phone}` : null;
  const demoUser = users.find((u) => u.role === 'leader' && u.leaderId === leader.id);

  const u = normalizeUsername(username);
  const usernameError = !username.trim() ? 'กรุณาระบุ User name'
    : !USERNAME_PATTERN.test(u) ? `รูปแบบไม่ถูกต้อง — ${USERNAME_HINT}`
      : usernameTaken(u, leader.id) ? 'User name นี้ถูกใช้แล้ว' : '';

  const commit = (next: LeaderAccount, action: LeaderAccountAction, msg: string, note?: string) => {
    try {
      const at = toISODateTime(new Date());
      const saved = saveLeaderAccount({ ...next, history: [...next.history, { at, by: currentUser.name, action, ...(note ? { note } : {}) }] });
      setAccount(saved);
      pushToast('success', msg, saved.username);
      return saved;
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
      return null;
    }
  };

  const create = () => {
    if (usernameError) return;
    const at = toISODateTime(new Date());
    const base: LeaderAccount = { leaderId: leader.id, username: u, status: 'active', passwordPending: true, createdAt: at, createdBy: currentUser.name, history: [] };
    const saved = commit(base, 'create', 'สร้างบัญชีผู้ใช้แล้ว');
    if (saved) {
      setEditing(false);
      if (channel) sendLink('send_setup', saved);
    }
  };

  const rename = () => {
    if (!account || usernameError || u === account.username) return;
    if (commit({ ...account, username: u }, 'rename', 'เปลี่ยน User name แล้ว', `${account.username} → ${u}`)) setEditing(false);
  };

  const sendLink = (action: 'send_setup' | 'send_reset', acc = account) => {
    if (!acc || !channel) return;
    commit({ ...acc, passwordPending: true }, action, `${LEADER_ACCOUNT_ACTION[action]}แล้ว (Demo — ไม่ได้ส่งจริง)`, `ส่งไปที่ ${channel}`);
  };

  const setStatus = (status: LeaderAccountStatus, action: LeaderAccountAction) => {
    if (!account) return;
    if (action === 'disable' && !window.confirm(`ปิดการใช้งานบัญชี “${account.username}”? หัวหน้าทัวร์จะเข้าสู่ระบบไม่ได้จนกว่าจะเปิดอีกครั้ง`)) return;
    commit({ ...account, status }, action, `${LEADER_ACCOUNT_ACTION[action]}แล้ว`);
  };

  if (!canManage) {
    return <Card><p className="text-sm zego-text-tertiary">เฉพาะเจ้าหน้าที่ที่แก้ไขข้อมูลหัวหน้าทัวร์ได้เท่านั้นที่จัดการบัญชีผู้ใช้ได้</p></Card>;
  }
  if (!loaded) return <Card><p className="text-sm zego-text-tertiary">กำลังโหลด…</p></Card>;

  const usernameForm = (onSave: () => void, saveLabel: string, onCancel?: () => void) => (
    <div className="space-y-2">
      <div className="max-w-md">
        <TextInput
          label="User name"
          required
          lang="en"
          value={username}
          error={username ? usernameError || undefined : undefined}
          hint={USERNAME_HINT}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!!usernameError || (!!account && u === account.username)} onClick={onSave}>{saveLabel}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>ยกเลิก</Button>}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="บัญชีผู้ใช้สำหรับเข้าสู่ระบบ" description="User name ที่หัวหน้าทัวร์ใช้ล็อกอินเข้าพอร์ทัลหัวหน้าทัวร์ — รหัสผ่านหัวหน้าทัวร์ตั้งเองผ่านลิงก์" />

        {!account ? (
          <div className="space-y-4">
            <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-sm zego-text-tertiary">ยังไม่มีบัญชีผู้ใช้ — สร้างบัญชีเพื่อให้หัวหน้าทัวร์เข้าสู่ระบบได้</p>
            {editing ? usernameForm(create, 'สร้างบัญชี', () => setEditing(false)) : (
              <Button variant="primary" icon="plus" onClick={() => { setUsername(suggestUsername(leader)); setEditing(true); }}>สร้างบัญชีผู้ใช้</Button>
            )}
            {editing && (
              <p className="text-xs zego-text-tertiary">
                {channel ? `สร้างแล้วระบบจะส่งลิงก์ตั้งรหัสผ่านไปที่ ${channel}` : 'ยังไม่มีอีเมล/เบอร์โทรของหัวหน้าทัวร์ — สร้างบัญชีได้ แต่ต้องเพิ่มช่องทางติดต่อก่อนจึงจะส่งลิงก์ตั้งรหัสผ่านได้'}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs zego-text-tertiary">User name</dt>
                <dd className="font-mono text-base font-semibold zego-text">{account.username}</dd>
              </div>
              <div>
                <dt className="text-xs zego-text-tertiary">สถานะบัญชี</dt>
                <dd className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge meta={LEADER_ACCOUNT_STATUS[account.status]} size="sm" />
                  {account.passwordPending && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">รอตั้งรหัสผ่าน</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs zego-text-tertiary">ช่องทางรับลิงก์ตั้งรหัสผ่าน</dt>
                <dd className={cx(channel ? 'zego-text' : 'zego-text-warning')}>{channel ?? 'ยังไม่มีอีเมล / เบอร์โทร'}</dd>
              </div>
              <div>
                <dt className="text-xs zego-text-tertiary">เข้าสู่ระบบล่าสุด</dt>
                <dd className="zego-text">{account.lastLoginAt ? formatDateTime(account.lastLoginAt) : 'ยังไม่เคยเข้าสู่ระบบ'}</dd>
              </div>
              <div>
                <dt className="text-xs zego-text-tertiary">สร้างบัญชีเมื่อ</dt>
                <dd className="zego-text">{formatDateTime(account.createdAt)} โดย {account.createdBy}</dd>
              </div>
              {demoUser && (
                <div>
                  <dt className="text-xs zego-text-tertiary">ผู้ใช้ใน Demo (สลับบทบาท)</dt>
                  <dd className="zego-text">{demoUser.id} · {demoUser.name}</dd>
                </div>
              )}
            </dl>

            {editing ? usernameForm(rename, 'บันทึก User name', () => setEditing(false)) : (
              <div className="flex flex-wrap gap-2 zego-divider-top pt-3">
                <Button variant="secondary" icon="edit" onClick={() => { setUsername(account.username); setEditing(true); }}>เปลี่ยน User name</Button>
                <Button
                  variant="secondary"
                  icon="mail"
                  disabled={!channel || account.status === 'disabled'}
                  onClick={() => sendLink(account.passwordPending && account.history.every((h) => h.action !== 'send_reset') ? 'send_setup' : 'send_reset')}
                >
                  {account.passwordPending ? 'ส่งลิงก์ตั้งรหัสผ่านอีกครั้ง' : 'ส่งลิงก์รีเซ็ตรหัสผ่าน'}
                </Button>
                {account.status === 'locked' && <Button variant="secondary" onClick={() => setStatus('active', 'unlock')}>ปลดล็อกบัญชี</Button>}
                {account.status === 'active' && <Button variant="ghost" onClick={() => setStatus('locked', 'lock')}>ล็อกบัญชี</Button>}
                {account.status === 'disabled'
                  ? <Button variant="primary" onClick={() => setStatus('active', 'enable')}>เปิดการใช้งาน</Button>
                  : <Button variant="danger" onClick={() => setStatus('disabled', 'disable')}>ปิดการใช้งาน</Button>}
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <Callout tone="blue" title="เกี่ยวกับรหัสผ่าน">
            ระบบไม่เก็บและไม่แสดงรหัสผ่าน — หัวหน้าทัวร์ตั้งรหัสผ่านเองจากลิงก์ที่ส่งไป · ล็อกบัญชี = ระงับชั่วคราว (เช่น เข้าระบบผิดหลายครั้ง) · ปิดการใช้งาน = เลิกใช้บัญชีนี้
            · Demo นี้ไม่ได้ส่งลิงก์จริง และยังไม่มีหน้าล็อกอินจริง (สลับผู้ใช้ได้จากเมนูมุมขวาบน)
          </Callout>
        </div>
      </Card>

      {account && account.history.length > 0 && (
        <Card>
          <CardHeader title="ประวัติบัญชีผู้ใช้" />
          <ul className="divide-y divide-[var(--zego-border-soft)] text-sm">
            {[...account.history].reverse().map((h, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="zego-text">{LEADER_ACCOUNT_ACTION[h.action]}{h.note ? <span className="zego-text-tertiary"> · {h.note}</span> : null}</span>
                <span className="text-xs zego-text-tertiary">{formatDateTime(h.at)} · {h.by}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
