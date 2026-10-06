'use client';

/**
 * โปรไฟล์ — /staff/profile (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 * ข้อมูลของตัวเองจากทะเบียนเจ้าหน้าที่ส่งกรุ๊ป
 * แก้เองได้ทั้งหมด มีผลทันที — บันทึกลงทะเบียนชุดเดียวกับฝั่งผู้จัด (ผู้จัด/ฝ่ายบัญชีเห็นข้อมูลใหม่เลย)
 *   ข้อมูลทั่วไป (ชื่อจริง · นามสกุล · ชื่อเล่น) — ชื่อจริง-นามสกุลชุดเดียวกับบัตรประชาชน
 *   ข้อมูลติดต่อ (เบอร์โทร · อีเมล · ผู้ติดต่อฉุกเฉิน) — แก้ในการ์ด
 *   ข้อมูลตามบัตรประชาชน + ไฟล์บัตร — ฟอร์มชุดเดียวกับผู้ดูแล (SendOffStaffFormDrawer โหมดแก้เอง: ไม่มีประเภท/สถานะ/หมายเหตุ)
 *   บัญชีรับเงิน — ตัวแก้ไขชุดเดียวกับผู้ดูแล (BankAccountEditor)
 * ประเภทเจ้าหน้าที่ / สถานะการใช้งาน / วันที่เริ่มร่วมงาน ยังเป็นของผู้ดูแล (แสดงในการ์ด "ข้อมูลทั่วไป")
 * บัญชีผู้ใช้: ดู User name · สถานะ · การตั้งรหัสผ่าน + ขอลิงก์เปลี่ยนรหัสผ่านเอง (ชุดบัญชีเดียวกับหัวหน้าทัวร์ · ไม่มีช่องรหัสผ่าน)
 * เลขบัตรประชาชน/เลขบัญชีแสดงแบบปิดบังเสมอ
 */

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/Modal';
import { getLeaderAccount, LEADER_ACCOUNT_STATUS, saveLeaderAccount, type LeaderAccount } from '@/services/leaderAccountStore';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/FormField';
import { useDemo } from '@/store/DemoStore';
import { formatDate, formatDateTime, toISODateTime } from '@/lib/format';
import {
  fullYearsMonths, SEND_OFF_STAFF_STATUS, SEND_OFF_STAFF_TYPE, sendOffStaffName, tenureLabel, validateStaffContact, type SendOffStaff,
} from '@/lib/logic/sendOffStaff';
import { upsertSendOffStaff } from '@/services/sendOffStaffStore';
import { SendOffStaffFormDrawer } from '@/components/staff/SendOffStaffFormDrawer';
import { BankAccountEditor } from '@/components/leaders/BankAccountEditor';
import { useStaffPortal } from '../useStaffPortal';

/** เลขบัญชีแสดงเฉพาะ 4 หลักท้าย */
const maskAccount = (no: string) => {
  const d = no.replace(/\D/g, '');
  return d.length > 4 ? `xxx-x-x${d.slice(-4, -1)}-${d.slice(-1)}` : no || '—';
};

const maskId = (id: string) => {
  const d = id.replace(/\D/g, '');
  return d.length === 13 ? `x-xxxx-xxxxx-${d.slice(10, 12)}-${d[12]}` : '—';
};

export default function StaffProfilePage() {
  const { staff: loaded, duties, today } = useStaffPortal();
  /** ฉบับที่แก้ในหน้านี้ — ทะเบียนอ่านครั้งเดียวตอนเปิดพอร์ทัล จึงเก็บฉบับล่าสุดไว้เอง */
  const [saved, setSaved] = useState<SendOffStaff | null>(null);
  const staff = saved && saved.id === loaded?.id ? saved : loaded;
  const { pushToast } = useDemo();
  /** ส่วนที่กำลังแก้ — ทีละส่วน */
  const [editing, setEditing] = useState<null | 'general' | 'contact' | 'idCard' | 'bank'>(null);
  /** บันทึกลงทะเบียน → มีผลทันที */
  const persist = (next: SendOffStaff, message: string) => {
    try {
      upsertSendOffStaff(next);
      setSaved(next);
      setEditing(null);
      pushToast('success', message);
    } catch {
      pushToast('error', 'บันทึกไม่สำเร็จ');
    }
  };
  if (!staff) {
    return <Card><EmptyState icon="warning" title="ไม่พบข้อมูลในทะเบียนเจ้าหน้าที่ส่งกรุ๊ป" description="ติดต่อผู้ดูแลระบบให้ผูกรหัส SOS กับบัญชีนี้" /></Card>;
  }
  const month = today.slice(0, 7);
  const thisMonth = duties.filter((d) => d.dutyDate.startsWith(month)).length;
  const done = duties.filter((d) => d.confirmed && d.dutyDate < today).length;
  const ec = staff.emergencyContact;

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-600 text-xl font-bold text-white">
          {staff.idCard.firstName.slice(0, 1) || staff.nickname.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <p className="text-base font-bold zego-text">{sendOffStaffName(staff)}</p>
          <p className="text-xs zego-text-tertiary">{staff.id} · เจ้าหน้าที่ส่งกรุ๊ป</p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        <Card className="text-center">
          <p className="text-2xl font-bold zego-text">{thisMonth}</p>
          <p className="text-xs zego-text-tertiary">งานเดือนนี้</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold zego-text">{done}</p>
          <p className="text-xs zego-text-tertiary">ส่งกรุ๊ปแล้วทั้งหมด</p>
        </Card>
      </div>

      {/* ข้อมูลทั่วไป — ประเภท / สถานะ / วันเริ่มงาน กำหนดโดยผู้ดูแล · วันเกิดมาจากบัตรประชาชน */}
      {editing === 'general' ? (
        <NameEditor staff={staff} onCancel={() => setEditing(null)} onSave={(next) => persist(next, 'บันทึกข้อมูลทั่วไปแล้ว')} />
      ) : (
      <Section title="ข้อมูลทั่วไป" action={<EditButton onClick={() => setEditing('general')} />}>
        <Row label="ชื่อจริง-นามสกุล" value={`${staff.idCard.firstName} ${staff.idCard.lastName}`.trim() || '—'} />
        <Row label="ชื่อเล่น" value={staff.nickname || '—'} />
        <Row label="รหัสเจ้าหน้าที่" value={staff.id} />
        <Row label="ประเภท" value={<StatusBadge meta={SEND_OFF_STAFF_TYPE[staff.staffType]} size="sm" />} />
        <Row label="สถานะ" value={<StatusBadge meta={SEND_OFF_STAFF_STATUS[staff.status]} size="sm" />} />
        <Row
          label="เริ่มร่วมงาน"
          value={staff.startDate ? `${formatDate(staff.startDate)}${tenureLabel(staff.startDate, today) ? ` · ${tenureLabel(staff.startDate, today)}` : ''}` : '—'}
        />
        <Row
          label="วันเกิด"
          value={staff.idCard.birthDate ? `${formatDate(staff.idCard.birthDate)}${fullYearsMonths(staff.idCard.birthDate, today) ? ` · อายุ ${fullYearsMonths(staff.idCard.birthDate, today)!.years} ปี` : ''}` : '—'}
        />
        <p className="text-[11px] zego-text-tertiary">ประเภท / สถานะ / วันเริ่มร่วมงาน กำหนดโดยผู้ดูแล · วันเกิดแก้ที่ &quot;ข้อมูลตามบัตรประชาชน&quot;</p>
      </Section>
      )}

      {editing === 'contact' ? (
        <ContactEditor staff={staff} onCancel={() => setEditing(null)} onSave={(next) => persist(next, 'บันทึกข้อมูลติดต่อแล้ว')} />
      ) : (
        <Section title="ข้อมูลติดต่อ" action={<EditButton onClick={() => setEditing('contact')} />}>
          <Row label="เบอร์โทร" value={staff.phone || '—'} />
          <Row label="อีเมล" value={staff.email || '—'} />
          <Row label="ผู้ติดต่อฉุกเฉิน" value={ec?.name ? `${ec.name}${ec.relation ? ` (${ec.relation})` : ''}${ec.phone ? ` · ${ec.phone}` : ''}` : '—'} />
        </Section>
      )}

      <Section title="ข้อมูลตามบัตรประชาชน" action={<EditButton onClick={() => setEditing('idCard')} />}>
        <Row label="ชื่อ-นามสกุล" value={`${staff.idCard.title ?? ''}${staff.idCard.firstName} ${staff.idCard.lastName}`.trim()} />
        <Row label="ชื่ออังกฤษ" value={`${staff.idCard.firstNameEn ?? ''} ${staff.idCard.lastNameEn ?? ''}`.trim() || '—'} />
        <Row label="เลขบัตรประชาชน" value={maskId(staff.idCard.idNumber)} />
        <Row label="บัตรหมดอายุ" value={staff.idCard.expiryDate ? formatDate(staff.idCard.expiryDate) : '—'} />
      </Section>
      {editing === 'idCard' && (
        <SendOffStaffFormDrawer
          selfService
          initial={staff}
          onClose={() => setEditing(null)}
          onSave={(next) => persist(next, 'บันทึกข้อมูลตามบัตรประชาชนแล้ว')}
        />
      )}

      {editing === 'bank' ? (
        <BankEditor staff={staff} onCancel={() => setEditing(null)} onSave={(next) => persist(next, 'บันทึกบัญชีรับเงินแล้ว')} />
      ) : (
      <Section title="บัญชีรับเงิน" action={<EditButton onClick={() => setEditing('bank')} />}>
        {staff.bankAccounts.filter((b) => b.active).length === 0 ? (
          <p className="text-sm zego-text-tertiary">ยังไม่มีบัญชีรับเงิน</p>
        ) : (
          staff.bankAccounts.filter((b) => b.active).map((b) => (
            <div key={b.id} className="flex items-start justify-between gap-2 text-sm">
              <div>
                <p className="font-medium zego-text">{b.bank} {maskAccount(b.accountNoMasked)}</p>
                <p className="text-xs zego-text-tertiary">{b.accountName}{b.branch ? ` · ${b.branch}` : ''}</p>
              </div>
              {b.isPrimary && <StatusBadge meta={{ label: 'บัญชีหลัก', tone: 'green' }} size="sm" />}
            </div>
          ))
        )}
      </Section>
      )}

      <AccountSection staff={staff} />

      <p className="text-center text-[11px] zego-text-tertiary">แก้ไขแล้วมีผลทันที — ผู้จัดและฝ่ายบัญชีเห็นข้อมูลใหม่ · ประเภทเจ้าหน้าที่ / สถานะการใช้งาน แจ้งผู้ดูแล</p>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold zego-text">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  );
}

/** แก้ข้อมูลติดต่อของตัวเอง — บันทึกแล้วมีผลทันที (ผู้จัดเห็นในทะเบียนเลย) */
function ContactEditor({ staff, onCancel, onSave }: { staff: SendOffStaff; onCancel: () => void; onSave: (next: SendOffStaff) => void }) {
  const [phone, setPhone] = useState(staff.phone);
  const [email, setEmail] = useState(staff.email ?? '');
  const [ecName, setEcName] = useState(staff.emergencyContact?.name ?? '');
  const [ecRelation, setEcRelation] = useState(staff.emergencyContact?.relation ?? '');
  const [ecPhone, setEcPhone] = useState(staff.emergencyContact?.phone ?? '');
  const [tried, setTried] = useState(false);
  const errors = validateStaffContact({ phone, email, ecName, ecPhone });
  const show = (k: keyof typeof errors) => (tried ? errors[k] : undefined);

  const save = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    const next: SendOffStaff = {
      ...staff,
      phone: phone.trim(),
      email: email.trim() || undefined,
      emergencyContact: ecName.trim() || ecPhone.trim()
        ? { ...(staff.emergencyContact ?? {}), name: ecName.trim(), relation: ecRelation.trim(), phone: ecPhone.trim() }
        : undefined,
    };
    onSave(next);
  };

  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold zego-text">แก้ไขข้อมูลติดต่อ</h2>
      <TextInput label="เบอร์โทร" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} error={show('phone')} />
      <TextInput label="อีเมล" optional type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} error={show('email')} />
      <div className="space-y-2 rounded-lg border zego-border-color p-2.5">
        <p className="text-xs font-medium zego-text-secondary">ผู้ติดต่อฉุกเฉิน</p>
        <div className="grid grid-cols-2 gap-2">
          <TextInput label="ชื่อ" optional value={ecName} onChange={(e) => setEcName(e.target.value)} />
          <TextInput label="ความสัมพันธ์" optional value={ecRelation} onChange={(e) => setEcRelation(e.target.value)} placeholder="เช่น แม่" />
        </div>
        <TextInput label="เบอร์โทร" optional type="tel" inputMode="tel" value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} error={show('ecPhone')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>ยกเลิก</Button>
        <Button variant="primary" onClick={save}>บันทึก</Button>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="shrink-0 zego-text-tertiary">{label}</span>
      <span className="text-right zego-text">{value}</span>
    </div>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return <Button size="sm" variant="secondary" icon="edit" onClick={onClick}>แก้ไข</Button>;
}

/** บัญชีรับเงิน — ตัวแก้ไขชุดเดียวกับผู้ดูแล (เพิ่มได้หลายบัญชี · ตั้งบัญชีหลัก) */
function BankEditor({ staff, onCancel, onSave }: { staff: SendOffStaff; onCancel: () => void; onSave: (next: SendOffStaff) => void }) {
  const { master } = useDemo();
  const [accounts, setAccounts] = useState(staff.bankAccounts);
  const dirty = JSON.stringify(accounts) !== JSON.stringify(staff.bankAccounts);
  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold zego-text">แก้ไขบัญชีรับเงิน</h2>
        <p className="text-xs zego-text-tertiary">ใช้โอนค่าส่งกรุ๊ป — ตรวจชื่อบัญชีและเลขบัญชีให้ถูกต้อง</p>
      </div>
      <BankAccountEditor accounts={accounts} banks={master.banks} defaultAccountName={`${staff.idCard.firstName} ${staff.idCard.lastName}`.trim() || sendOffStaffName(staff)} errors={{}} onChange={setAccounts} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>ยกเลิก</Button>
        <Button variant="primary" disabled={!dirty} onClick={() => onSave({ ...staff, bankAccounts: accounts })}>บันทึก</Button>
      </div>
    </Card>
  );
}

/** ปิดบังช่องทางบางส่วน — c***@gmail.com · xxx-xxx-5678 */
const maskEmail = (v: string) => {
  const [user, domain] = v.split('@');
  return domain ? `${user.slice(0, 1)}***@${domain}` : v;
};
const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, '');
  return d.length >= 4 ? `xxx-xxx-${d.slice(-4)}` : v;
};

/**
 * บัญชีผู้ใช้ — ดู User name / สถานะ / การตั้งรหัสผ่าน และขอลิงก์เปลี่ยนรหัสผ่านเอง
 * ⚠️ ไม่มีช่องกรอก/แสดงรหัสผ่าน (หลักการเดียวกับพอร์ทัลหัวหน้าทัวร์) · สร้างบัญชี / เปลี่ยน User name / ปลดล็อก = ผู้ดูแล
 * คำขอลงประวัติบัญชี — ผู้ดูแลเห็นในแท็บบัญชีผู้ใช้ของทะเบียนเจ้าหน้าที่ส่งกรุ๊ป
 */
function AccountSection({ staff }: { staff: SendOffStaff }) {
  const { currentUser, pushToast } = useDemo();
  const [account, setAccount] = useState<LeaderAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ตอน mount
    setAccount(getLeaderAccount(staff.id));
    setLoaded(true);
  }, [staff.id]);

  const channel = staff.email ? `อีเมล ${maskEmail(staff.email)}` : staff.phone ? `SMS ${maskPhone(staff.phone)}` : null;
  const canRequest = !!account && account.status === 'active' && !!channel;
  const lastLink = account?.history.filter((h) => h.action === 'send_setup' || h.action === 'send_reset' || h.action === 'self_reset').at(-1);

  const requestReset = () => {
    if (!account || !channel) return;
    try {
      const saved = saveLeaderAccount({
        ...account,
        passwordPending: true,
        history: [...account.history, { at: toISODateTime(new Date()), by: currentUser.name, action: 'self_reset', note: `ส่งไปที่ ${channel}` }],
      });
      setAccount(saved);
      pushToast('success', 'ส่งลิงก์เปลี่ยนรหัสผ่านแล้ว (Demo — ไม่ได้ส่งจริง)', channel);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'ส่งลิงก์ไม่สำเร็จ');
    }
    setConfirmOpen(false);
  };

  if (!loaded) return null;
  return (
    <Section title="บัญชีผู้ใช้">
      {!account ? (
        <p className="text-sm zego-text-tertiary">ยังไม่มีบัญชีผู้ใช้ — ติดต่อผู้ดูแลเพื่อสร้างบัญชีเข้าสู่ระบบ</p>
      ) : (
        <>
          <Row label="User name" value={<span className="font-mono">{account.username}</span>} />
          <Row label="สถานะบัญชี" value={<StatusBadge meta={LEADER_ACCOUNT_STATUS[account.status]} size="sm" />} />
          <Row label="รหัสผ่าน" value={account.passwordPending ? <span className="text-amber-800">รอตั้งรหัสผ่านจากลิงก์</span> : 'ตั้งแล้ว'} />
          {lastLink && <Row label="ส่งลิงก์ล่าสุด" value={formatDateTime(lastLink.at)} />}
          {account.lastLoginAt && <Row label="เข้าสู่ระบบล่าสุด" value={formatDateTime(account.lastLoginAt)} />}
          <Button variant="secondary" icon="mail" className="mt-1 w-full justify-center" disabled={!canRequest} onClick={() => setConfirmOpen(true)}>
            ขอลิงก์เปลี่ยนรหัสผ่าน
          </Button>
          {account.status !== 'active' && <p className="text-xs text-amber-800">บัญชี{LEADER_ACCOUNT_STATUS[account.status].label} — ติดต่อผู้ดูแล</p>}
          {account.status === 'active' && !channel && <p className="text-xs text-amber-800">ยังไม่มีอีเมลหรือเบอร์โทร — เพิ่มที่ &quot;ข้อมูลติดต่อ&quot; ก่อน</p>}
          <p className="text-[11px] zego-text-tertiary">เปลี่ยน User name หรือปลดล็อกบัญชี ติดต่อผู้ดูแล</p>
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
    </Section>
  );
}

/** ข้อมูลทั่วไป — ชื่อจริง / นามสกุล (ชุดเดียวกับบัตรประชาชน) · ชื่อเล่น */
function NameEditor({ staff, onCancel, onSave }: { staff: SendOffStaff; onCancel: () => void; onSave: (next: SendOffStaff) => void }) {
  const [firstName, setFirstName] = useState(staff.idCard.firstName);
  const [lastName, setLastName] = useState(staff.idCard.lastName);
  const [nickname, setNickname] = useState(staff.nickname);
  const [tried, setTried] = useState(false);
  const save = () => {
    setTried(true);
    if (!firstName.trim() || !lastName.trim()) return;
    onSave({ ...staff, nickname: nickname.trim(), idCard: { ...staff.idCard, firstName: firstName.trim(), lastName: lastName.trim() } });
  };
  return (
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold zego-text">แก้ไขข้อมูลทั่วไป</h2>
      <div className="grid grid-cols-2 gap-2">
        <TextInput label="ชื่อจริง" value={firstName} onChange={(e) => setFirstName(e.target.value)} error={tried && !firstName.trim() ? 'กรุณาระบุ' : undefined} />
        <TextInput label="นามสกุล" value={lastName} onChange={(e) => setLastName(e.target.value)} error={tried && !lastName.trim() ? 'กรุณาระบุ' : undefined} />
      </div>
      <TextInput label="ชื่อเล่น" optional value={nickname} onChange={(e) => setNickname(e.target.value)} />
      <p className="text-[11px] zego-text-tertiary">ชื่อจริง-นามสกุลเป็นชุดเดียวกับข้อมูลบัตรประชาชน — ใช้ชื่อตามบัตร</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>ยกเลิก</Button>
        <Button variant="primary" onClick={save}>บันทึก</Button>
      </div>
    </Card>
  );
}
