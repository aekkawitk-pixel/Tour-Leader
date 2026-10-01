'use client';

/**
 * โปรไฟล์เจ้าหน้าที่ส่งกรุ๊ป — แยกเป็น 5 แท็บ
 *   1. ข้อมูลส่วนตัว    ชื่อเล่น/เบอร์/อีเมล/ผู้ติดต่อฉุกเฉิน + สรุปชื่อ-ที่อยู่ตามบัตร (อ่านจาก idCard)
 *   2. เอกสารประจำตัว   บัตรประชาชน (ผังเดียวกับหัวหน้าทัวร์) + ไฟล์แนบ — แก้ไขผ่าน SendOffStaffFormDrawer
 *   3. เอกสารการเงิน    บัญชีธนาคาร (หลายบัญชี) — ใช้ตัวแก้ไขชุดเดียวกับหัวหน้าทัวร์ (BankAccountEditor)
 *   4. ตารางงาน        กรุ๊ปที่คนนี้ได้รับมอบหมาย รายเดือน — อ่านอย่างเดียว (จัด/เปลี่ยนคนทำที่เมนู "การจัดสเก็ต")
 *   5. สถานะ/การลา      สถานะการใช้งาน + คำขอลา/อนุมัติ
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import {
  Avatar, Button, Callout, Card, CardHeader, cx, EmptyState, StatusBadge,
} from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl, Tabs, TabPanel, type TabItem } from '@/components/ui/Tabs';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SelectInput, TextInput, TextArea } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { MonthPicker, nextMonthStart, nextMonthStartFromNow } from '@/components/ui/MonthPicker';
import { RowMenu } from '@/components/leaders/reorderControls';
import { BankAccountEditor } from '@/components/leaders/BankAccountEditor';
import { IdCardTemplate } from '@/components/leaders/documents/IdCardTemplate';
import { openDocumentImageUrl, releaseImageUrl } from '@/services/documentImageStore';
import { SendOffStaffFormDrawer } from '@/components/staff/SendOffStaffFormDrawer';
import { SendOffAgenda } from '@/components/jobs/SendOffAgenda';
import {
  addDays, endOfMonth, formatDate, formatThaiMonthYear, parseDate, startOfMonth, TH_WEEKDAYS_SHORT, toISODate,
} from '@/lib/format';
import { StorageWriteError } from '@/services/browserStorage';
import {
  EMPTY_EMERGENCY_CONTACT,
  SEND_OFF_STAFF_STATUS, SEND_OFF_STAFF_STATUS_ORDER, SEND_OFF_STAFF_TYPE,
  sendOffStaffName, type EmergencyContact, type SendOffStaff, type SendOffStaffStatus,
} from '@/lib/logic/sendOffStaff';
import { loadSendOffStaff, upsertSendOffStaff, setSendOffStaffStatus } from '@/services/sendOffStaffStore';
import {
  SEND_OFF_LEAVE_STATUS, SEND_OFF_LEAVE_TYPE, SEND_OFF_LEAVE_TYPE_ORDER,
  leaveCoversDate, leaveDayCount, leaveRecordsForStaff, type SendOffLeaveRecord, type SendOffLeaveType,
} from '@/lib/logic/sendOffStaffLeave';
import {
  cancelSendOffLeave, decideSendOffLeave, loadSendOffLeave, nextSendOffLeaveId, upsertSendOffLeave,
} from '@/services/sendOffStaffLeaveStore';
import { getAssignablePeriods, getTourPeriodById, getTourPeriods } from '@/services/tourPeriodMaster';
import { getHolidayMap } from '@/services/holidayService';
import { dayOffLookup } from '@/lib/logic/dayOff';
import { loadSendOffAssignments, type SendOffAssignment } from '@/services/sendOffAssignmentStore';
import { loadManualFlightTimes, type ManualFlightTimes } from '@/services/sendOffFlightTimeStore';
import { loadManualAirports, type ManualAirports } from '@/services/sendOffManualAirportStore';
import { loadSendOffRules } from '@/services/sendOffRulesStore';
import { DEFAULT_SEND_OFF_RULES, type SendOffRules } from '@/lib/logic/sendOffRules';
import { buildSendOffJobs, jobIssue, jobStatus, sendOffPeriodPool, type SendOffJob } from '@/lib/logic/sendOffJobs';
import { BOARD_STATUS } from '@/lib/logic/guideBoard';
import { airportLabel } from '@/lib/logic/airportLabel';
import type { AnyLeaderDocumentRecord } from '@/data/leaders/documentRecordTypes';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';

type TabKey = 'personal' | 'idDocs' | 'finance' | 'schedule' | 'leave';

/** แปลงบัตรของเจ้าหน้าที่ → รูปแบบเอกสารที่ template หน้าบัตรใช้ (ชื่อช่องตรงกับ schema id_card อยู่แล้ว) */
function toIdCardDoc(staff: SendOffStaff): AnyLeaderDocumentRecord {
  return { fields: { ...staff.idCard } } as unknown as AnyLeaderDocumentRecord;
}

/**
 * กรุ๊ปที่คนนี้รับไว้แล้ว ซึ่งวันที่ต้องไปส่งตกอยู่ในช่วงวันที่ระบุ
 * ใช้เตือนตอนขอลา/อนุมัติลา ว่ามีงานจัดไว้แล้วในช่วงนี้ — ไม่ใช่ตัวบล็อก แค่แจ้งให้ผู้จัดรู้ก่อนตัดสินใจ
 * ใช้ dayOffset ที่บันทึกไว้ตอนจัด (ไม่คำนวณเวลาบินใหม่) เพื่อความเร็ว — คลาดเคลื่อนได้แค่กรณีเที่ยวบินดึกที่ไม่ธรรมดา
 */
function findAssignedJobsInRange(staffId: string, startDate: string, endDate: string): { groupCode: string; dutyDate: string }[] {
  const hits: { groupCode: string; dutyDate: string }[] = [];
  for (const a of loadSendOffAssignments()) {
    if (a.staffId !== staffId) continue;
    const period = getTourPeriodById(a.periodId);
    if (!period) continue;
    const dutyDate = addDays(period.startDate, a.dayOffset);
    if (dutyDate >= startDate && dutyDate <= endDate) hits.push({ groupCode: period.groupCode, dutyDate });
  }
  return hits.sort((a, b) => a.dutyDate.localeCompare(b.dutyDate));
}

export function SendOffStaffDetailView() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { currentUser, pushToast } = useDemo();
  const canManage = can(currentUser.role, 'leader.edit');

  const [staffList, setStaffList] = useState<SendOffStaff[]>([]);
  const [ready, setReady] = useState(false);
  const [leaves, setLeaves] = useState<SendOffLeaveRecord[]>([]);
  const [tab, setTab] = useState<TabKey>('personal');
  const [statusTarget, setStatusTarget] = useState<SendOffStaffStatus | null>(null);
  const [cardEditOpen, setCardEditOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // อ่าน localStorage ได้เฉพาะฝั่ง client → โหลดใน effect เพื่อไม่ให้ HTML ฝั่ง server ต่างกัน
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStaffList(loadSendOffStaff());
    setLeaves(loadSendOffLeave());
    setReady(true);
    // ลิงก์จากตารางจัดเจ้าหน้าที่ส่งกรุ๊ป (?tab=schedule&month=YYYY-MM) → เปิดแท็บตารางงานของเดือนนั้นเลย
    if (new URLSearchParams(window.location.search).get('tab') === 'schedule') setTab('schedule');
  }, []);

  const staff = staffList.find((s) => s.id === params.id) ?? null;

  const save = (next: SendOffStaff) => {
    try {
      setStaffList(upsertSendOffStaff(next));
      setError(null);
    } catch (e) {
      setError(e instanceof StorageWriteError ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const applyStatus = () => {
    if (!statusTarget || !staff) return;
    try {
      setStaffList(setSendOffStaffStatus(staff.id, statusTarget));
      setStatusTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เปลี่ยนสถานะไม่สำเร็จ');
    }
  };

  const refreshLeaves = () => setLeaves(loadSendOffLeave());

  if (!ready) return null; // กันไม่ให้ขึ้น "ไม่พบ" ชั่วครู่ก่อนโหลดจาก localStorage เสร็จ

  if (!staff) {
    return (
      <EmptyState
        icon="users"
        title="ไม่พบเจ้าหน้าที่คนนี้"
        description="อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง"
        action={<Button variant="secondary" onClick={() => router.push('/send-off-staff')}>กลับไปรายชื่อ</Button>}
      />
    );
  }

  const myLeaves = leaveRecordsForStaff(leaves, staff.id);
  const pendingLeaveCount = myLeaves.filter((r) => r.status === 'pending').length;
  const c = staff.idCard;
  const cardExpired = Boolean(c.expiryDate) && c.expiryDate < new Date().toISOString().slice(0, 10);

  const tabs: TabItem[] = [
    { key: 'personal', label: 'ข้อมูลส่วนตัว' },
    { key: 'idDocs', label: 'เอกสารประจำตัว', badge: cardExpired ? 1 : undefined },
    { key: 'finance', label: 'เอกสารการเงิน' },
    { key: 'schedule', label: 'ตารางงาน' },
    { key: 'leave', label: 'สถานะ/การลา', badge: pendingLeaveCount || undefined },
  ];

  return (
    <div>
      <button
        type="button"
        onClick={() => router.push('/send-off-staff')}
        className="zego-icon-btn mb-3 inline-flex items-center gap-1 text-sm"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        กลับไปรายชื่อเจ้าหน้าที่ส่งกรุ๊ป
      </button>

      {error && <Callout tone="red" title="ทำรายการไม่สำเร็จ"><p className="text-sm">{error}</p></Callout>}

      {/* ------------------------------ ส่วนหัว ------------------------------ */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar initials={(c.firstName || staff.nickname || '?').slice(0, 1)} size="lg" alt={`รูปของ ${sendOffStaffName(staff)}`} />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="zego-text text-xl font-bold">{sendOffStaffName(staff)}</h1>
              <StatusBadge meta={SEND_OFF_STAFF_TYPE[staff.staffType]} dot={false} />
              <StatusBadge meta={SEND_OFF_STAFF_STATUS[staff.status]} />
            </div>
            <p className="zego-text-tertiary mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
              <span className="font-mono">{staff.id}</span>
              <span className="zego-text-disabled">·</span>
              <span>{SEND_OFF_STAFF_TYPE[staff.staffType].note}</span>
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              {staff.phone ? (
                <span className="zego-text-secondary inline-flex items-center gap-1.5">
                  <Icon name="phone" className="zego-text-tertiary h-4 w-4" />
                  {staff.phone}
                </span>
              ) : (
                <span className="zego-text-disabled">ยังไม่มีเบอร์โทรศัพท์</span>
              )}
              {staff.email && (
                <span className="zego-text-secondary inline-flex items-center gap-1.5">
                  <Icon name="mail" className="zego-text-tertiary h-4 w-4" />
                  {staff.email}
                </span>
              )}
            </div>
          </div>

          {canManage && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <RowMenu
                label="เมนูเพิ่มเติม"
                items={SEND_OFF_STAFF_STATUS_ORDER.filter((st) => st !== staff.status).map((st) => ({
                  label: `เปลี่ยนสถานะเป็น "${SEND_OFF_STAFF_STATUS[st].label}"`,
                  onClick: () => setStatusTarget(st),
                }))}
              />
            </div>
          )}
        </div>

        {cardExpired && (
          <div className="mt-4">
            <Callout tone="red" title="บัตรประชาชนหมดอายุแล้ว">
              ตรวจสอบและอัปเดตที่แท็บ “เอกสารประจำตัว” ก่อนจัดกรุ๊ปต่อไป
            </Callout>
          </div>
        )}
      </Card>

      <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as TabKey)} />

      <TabPanel active={tab === 'personal'}>
        <PersonalTab key={staff.id} staff={staff} canManage={canManage} onSave={save} />
      </TabPanel>

      <TabPanel active={tab === 'idDocs'}>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canManage && <Button variant="secondary" icon="edit" onClick={() => setCardEditOpen(true)}>แก้ไข</Button>}
          </div>
          <IdCardTemplate
            doc={toIdCardDoc(staff)}
            onViewFile={staff.idCardFile ? () => { void viewIdCardFile(staff, currentUser.name, pushToast); } : undefined}
          />
        </div>
      </TabPanel>

      <TabPanel active={tab === 'finance'}>
        <FinanceTab key={staff.id} staff={staff} canManage={canManage} onSave={save} />
      </TabPanel>

      <TabPanel active={tab === 'schedule'}>
        <ScheduleTab staffId={staff.id} />
      </TabPanel>

      <TabPanel active={tab === 'leave'}>
        <div className="space-y-4">
          <Card>
            <CardHeader title="สถานะการใช้งาน" description={SEND_OFF_STAFF_STATUS[staff.status].note} />
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge meta={SEND_OFF_STAFF_STATUS[staff.status]} />
            </div>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {SEND_OFF_STAFF_STATUS_ORDER.map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={st === staff.status ? 'primary' : 'secondary'}
                    disabled={st === staff.status}
                    onClick={() => setStatusTarget(st)}
                  >
                    {SEND_OFF_STAFF_STATUS[st].label}
                  </Button>
                ))}
              </div>
            )}
          </Card>

          <LeaveTab staffId={staff.id} records={myLeaves} canManage={canManage} onChanged={refreshLeaves} />
        </div>
      </TabPanel>

      {cardEditOpen && (
        <SendOffStaffFormDrawer
          key={staff.id}
          initial={staff}
          onClose={() => setCardEditOpen(false)}
          onSave={(next) => { save(next); setCardEditOpen(false); }}
        />
      )}

      <ConfirmDialog
        open={!!statusTarget}
        onClose={() => setStatusTarget(null)}
        onConfirm={applyStatus}
        title={statusTarget ? `เปลี่ยนสถานะเป็น "${SEND_OFF_STAFF_STATUS[statusTarget].label}"` : ''}
        message={statusTarget ? SEND_OFF_STAFF_STATUS[statusTarget].note : ''}
        confirmLabel={statusTarget ? SEND_OFF_STAFF_STATUS[statusTarget].label : ''}
        tone={statusTarget && statusTarget === 'active' ? 'primary' : 'danger'}
      />
    </div>
  );
}

/** เปิดไฟล์สำเนาบัตรที่แนบไว้ — ใช้คลังไฟล์เดียวกับเอกสารของหัวหน้าทัวร์ */
async function viewIdCardFile(
  staff: SendOffStaff,
  byName: string,
  pushToast: (tone: 'success' | 'error' | 'info', message: string) => void,
) {
  if (!staff.idCardFile) return;
  const url = await openDocumentImageUrl(staff.idCardFile.imageId, {
    canView: true, by: byName, at: new Date().toISOString().slice(0, 16), tourLeaderId: staff.id,
  });
  if (!url) { pushToast('error', 'เปิดไฟล์ไม่สำเร็จ — อาจถูกลบไปแล้ว'); return; }
  window.open(url, '_blank', 'noopener');
  setTimeout(() => releaseImageUrl(url), 60_000);
}

/* ------------------------------- แท็บ: ข้อมูลส่วนตัว ------------------------------- */

function PersonalTab({ staff, canManage, onSave }: {
  staff: SendOffStaff;
  canManage: boolean;
  onSave: (s: SendOffStaff) => void;
}) {
  const [nickname, setNickname] = useState(staff.nickname);
  const [phone, setPhone] = useState(staff.phone);
  const [email, setEmail] = useState(staff.email ?? '');
  const [contact, setContact] = useState<EmergencyContact>(staff.emergencyContact ?? EMPTY_EMERGENCY_CONTACT);
  const [note, setNote] = useState(staff.note);

  const dirty = nickname !== staff.nickname
    || phone !== staff.phone
    || email !== (staff.email ?? '')
    || note !== staff.note
    || JSON.stringify(contact) !== JSON.stringify(staff.emergencyContact ?? EMPTY_EMERGENCY_CONTACT);

  const reset = () => {
    setNickname(staff.nickname);
    setPhone(staff.phone);
    setEmail(staff.email ?? '');
    setContact(staff.emergencyContact ?? EMPTY_EMERGENCY_CONTACT);
    setNote(staff.note);
  };

  const c = staff.idCard;
  const fullAddress = [
    c.addressLine,
    c.subdistrict && `ต.${c.subdistrict}`,
    c.district && `อ.${c.district}`,
    c.province,
    c.postalCode,
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="ข้อมูลติดต่อ" description="ใช้สำหรับติดต่อเรื่องงานประจำวัน" />
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput label="ชื่อเล่น" optional value={nickname} disabled={!canManage} onChange={(e) => setNickname(e.target.value)} />
          <TextInput label="เบอร์โทร" optional value={phone} disabled={!canManage} onChange={(e) => setPhone(e.target.value)} />
          <TextInput label="อีเมล" optional type="email" value={email} disabled={!canManage} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </Card>

      <Card>
        <CardHeader title="ผู้ติดต่อฉุกเฉิน" />
        <div className="grid gap-3 sm:grid-cols-3">
          <TextInput label="ชื่อ" optional value={contact.name} disabled={!canManage} onChange={(e) => setContact((p) => ({ ...p, name: e.target.value }))} />
          <TextInput label="เบอร์โทร" optional value={contact.phone} disabled={!canManage} onChange={(e) => setContact((p) => ({ ...p, phone: e.target.value }))} />
          <TextInput label="ความสัมพันธ์" optional value={contact.relation} disabled={!canManage} onChange={(e) => setContact((p) => ({ ...p, relation: e.target.value }))} />
        </div>
      </Card>

      <Card>
        <CardHeader title="ชื่อ-ที่อยู่ตามบัตรประชาชน" description="แก้ไขได้ที่แท็บ “เอกสารประจำตัว”" />
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="zego-text-tertiary text-xs">ชื่อ-นามสกุล</dt>
            <dd className="zego-text font-medium">{sendOffStaffName(staff)}</dd>
          </div>
          <div>
            <dt className="zego-text-tertiary text-xs">ที่อยู่</dt>
            <dd className="zego-text font-medium">{fullAddress || '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title="หมายเหตุ" />
        <TextArea label="หมายเหตุภายใน" optional value={note} disabled={!canManage} onChange={(e) => setNote(e.target.value)} />
      </Card>

      {canManage && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={!dirty} onClick={reset}>ยกเลิก</Button>
          <Button
            variant="primary"
            disabled={!dirty}
            onClick={() => onSave({ ...staff, nickname, phone, email, emergencyContact: contact, note })}
          >
            บันทึก
          </Button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------- แท็บ: เอกสารการเงิน ------------------------------- */

function FinanceTab({ staff, canManage, onSave }: {
  staff: SendOffStaff;
  canManage: boolean;
  onSave: (s: SendOffStaff) => void;
}) {
  const { master } = useDemo();
  const [accounts, setAccounts] = useState(staff.bankAccounts);
  const dirty = JSON.stringify(accounts) !== JSON.stringify(staff.bankAccounts);

  if (!canManage) {
    return (
      <Card>
        <CardHeader title="บัญชีธนาคาร" description="ใช้สำหรับโอนค่าตอบแทน/เบี้ยเลี้ยงการไปส่งกรุ๊ป" />
        {staff.bankAccounts.length === 0 ? (
          <EmptyState icon="money" title="ยังไม่มีบัญชีธนาคาร" />
        ) : (
          <ul className="space-y-2">
            {staff.bankAccounts.map((a) => (
              <li key={a.id} className="zego-border-color rounded-lg border p-3 text-sm">
                <span className="zego-text font-medium">{a.bank || '—'}</span>
                {a.isPrimary && <span className="zego-text-info ml-2 text-xs">บัญชีหลัก</span>}
                <p className="zego-text-tertiary">{a.accountName} · {a.accountNoMasked || '—'}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="บัญชีธนาคาร" description="ใช้สำหรับโอนค่าตอบแทน/เบี้ยเลี้ยงการไปส่งกรุ๊ป" />
      <BankAccountEditor
        accounts={accounts}
        banks={master.banks}
        defaultAccountName={sendOffStaffName(staff)}
        errors={{}}
        onChange={setAccounts}
      />
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" disabled={!dirty} onClick={() => setAccounts(staff.bankAccounts)}>ยกเลิก</Button>
        <Button variant="primary" disabled={!dirty} onClick={() => onSave({ ...staff, bankAccounts: accounts })}>บันทึก</Button>
      </div>
    </Card>
  );
}

/* ------------------------------- แท็บ: ตารางงาน ------------------------------- */

function ScheduleTab({ staffId }: { staffId: string }) {
  const { today } = useDemo();
  const [cursor, setCursor] = useState(() => nextMonthStart(today));
  useEffect(() => {
    // ?month=YYYY-MM (มาจากตารางจัดเจ้าหน้าที่ส่งกรุ๊ป) → เปิดเดือนเดียวกับที่ดูอยู่ · ไม่มี = เงื่อนไขเดียวกับเมนูการจัดสเก็ต
    const month = new URLSearchParams(window.location.search).get('month');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : nextMonthStartFromNow());
  }, []);

  const [assignments, setAssignments] = useState<SendOffAssignment[]>([]);
  const [manualTimes, setManualTimes] = useState<ManualFlightTimes>({});
  const [manualAirports, setManualAirports] = useState<ManualAirports>({});
  const [rules, setRules] = useState<SendOffRules>(DEFAULT_SEND_OFF_RULES);
  const [staffList, setStaffList] = useState<SendOffStaff[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignments(loadSendOffAssignments());
    setManualTimes(loadManualFlightTimes());
    setManualAirports(loadManualAirports());
    setRules(loadSendOffRules());
    setStaffList(loadSendOffStaff());
  }, []);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const holidays = useMemo(
    () => getHolidayMap([Number(monthStart.slice(0, 4)), Number(monthEnd.slice(0, 4))]),
    [monthStart, monthEnd],
  );
  const dayOffOf = useMemo(() => dayOffLookup(holidays), [holidays]);
  const staffById = useMemo(() => new Map(staffList.map((s) => [s.id, s])), [staffList]);

  const jobs = useMemo<SendOffJob[]>(() => {
    const from = addDays(monthStart, -1);
    const to = addDays(monthEnd, 1);
    const assignableIds = new Set(getAssignablePeriods().map((p) => p.internalId));
    const periods = sendOffPeriodPool({
      periods: getTourPeriods({ monthStart }).filter((p) => p.startDate >= from && p.startDate <= to),
      assignablePeriodIds: assignableIds,
      assignments,
    });
    return buildSendOffJobs({ periods, assignments, staffById, manualTimes, manualAirports, rules, dayOffOf })
      .filter((j) => j.dutyDate >= monthStart && j.dutyDate <= monthEnd && j.assignment?.staffId === staffId);
  }, [assignments, monthStart, monthEnd, staffById, manualTimes, manualAirports, rules, dayOffOf, staffId]);

  const [detail, setDetail] = useState<SendOffJob | null>(null);
  const [mode, setMode] = useState<'list' | 'calendar'>('list');
  /** สรุปของเดือน — นับจากงานที่มอบหมายจริง (คอนเฟิร์มแล้ว = ยืนยันกับเจ้าหน้าที่แล้วว่าไปแน่) */
  const confirmedCount = jobs.filter((j) => j.assignment?.status === 'CONFIRMED').length;
  const pendingCount = jobs.length - confirmedCount;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthPicker value={cursor} onChange={setCursor} hint="เลือกเดือนที่กรุ๊ปออกเดินทาง" />
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="มุมมองตารางงาน"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'list', label: 'รายการ' },
              { value: 'calendar', label: 'ปฏิทิน' },
            ]}
          />
          <span className="zego-text-tertiary text-xs">แก้ไข/จัดกรุ๊ปได้ที่เมนู “การจัดสเก็ต” — แท็บนี้แสดงผลอย่างเดียว</span>
        </div>
      </div>

      <div className="zego-border-color zego-surface-soft-bg flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border px-3 py-2">
        <span className="zego-text text-sm font-semibold">
          {formatThaiMonthYear(monthStart)} ไปส่ง {jobs.length} กรุ๊ป
        </span>
        {jobs.length > 0 && (
          <span className="zego-text-secondary text-xs">
            คอนเฟิร์มแล้ว {confirmedCount} · รอคอนเฟิร์ม {pendingCount}
          </span>
        )}
      </div>

      {mode === 'calendar' ? (
        <SendOffJobsCalendar jobs={jobs} monthStart={monthStart} today={today} dayOffOf={dayOffOf} onOpen={setDetail} />
      ) : (
        <SendOffAgenda jobs={jobs} onOpen={setDetail} singleStaff />
      )}

      {detail && (
        <Modal open onClose={() => setDetail(null)} title={detail.period.groupCode} description={formatDate(detail.dutyDate)}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="zego-text-tertiary text-xs">สนามบิน</dt>
              <dd className="zego-text font-medium">{airportLabel(detail.airport)}</dd>
            </div>
            <div>
              <dt className="zego-text-tertiary text-xs">เวลาเครื่องออก</dt>
              <dd className="zego-text font-medium">{detail.flightTime || 'ยังไม่รู้เวลาบิน'}</dd>
            </div>
            <div>
              <dt className="zego-text-tertiary text-xs">สถานะ</dt>
              <dd><StatusBadge meta={BOARD_STATUS[jobStatus(detail)]} /></dd>
            </div>
            <div>
              <dt className="zego-text-tertiary text-xs">โปรแกรม</dt>
              <dd className="zego-text font-medium">{detail.period.countryName} · {detail.period.displayName}</dd>
            </div>
            {jobIssue(detail) && (
              <div className="col-span-2">
                <dt className="zego-text-tertiary text-xs">ต้องตรวจ</dt>
                <dd className="zego-text-danger font-medium">{jobIssue(detail)}</dd>
              </div>
            )}
          </dl>
        </Modal>
      )}
    </div>
  );
}

/** ตารางงานแบบปฏิทินรายเดือน — ช่องวันแสดงชิปกรุ๊ปที่คนนี้ต้องไปส่ง สีตามสถานะเดียวกับตารางหลัก */
function SendOffJobsCalendar({ jobs, monthStart, today, dayOffOf, onOpen }: {
  jobs: SendOffJob[];
  monthStart: string;
  today: string;
  dayOffOf: (iso: string) => string | null;
  onOpen: (j: SendOffJob) => void;
}) {
  const monthIndex = parseDate(monthStart).getMonth();
  const gridStart = addDays(monthStart, -parseDate(monthStart).getDay());
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))),
    [gridStart],
  );
  const byDate = useMemo(() => {
    const m = new Map<string, SendOffJob[]>();
    for (const j of jobs) m.set(j.dutyDate, [...(m.get(j.dutyDate) ?? []), j]);
    return m;
  }, [jobs]);

  return (
    <div className="zego-border-color overflow-hidden rounded-xl border">
      <div className="zego-divider-bottom zego-surface-soft-bg zego-text-tertiary grid grid-cols-7 text-center text-xs font-medium">
        {TH_WEEKDAYS_SHORT.map((d) => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="zego-divider-bottom grid grid-cols-7 last:border-b-0">
          {week.map((iso) => {
            const isCurMonth = parseDate(iso).getMonth() === monthIndex;
            const dayJobs = byDate.get(iso) ?? [];
            const holidayLabel = isCurMonth ? dayOffOf(iso) : null;
            return (
              <div
                key={iso}
                title={holidayLabel ?? undefined}
                className={cx(
                  'zego-border-color min-h-[92px] space-y-0.5 border-r p-1 last:border-r-0',
                  !isCurMonth && 'zego-surface-soft-bg',
                  holidayLabel && 'zego-warned-tint',
                )}
              >
                <span className={cx('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs', iso === today ? 'zego-today-badge font-semibold' : isCurMonth ? 'zego-text-secondary' : 'zego-text-disabled')}>
                  {parseDate(iso).getDate()}
                </span>
                {dayJobs.map((j) => (
                  <button
                    key={j.period.internalId}
                    type="button"
                    onClick={() => onOpen(j)}
                    title={`${j.period.groupCode} · ${BOARD_STATUS[jobStatus(j)].label}`}
                    className={cx('block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium', BOARD_STATUS[jobStatus(j)].bar)}
                  >
                    {j.period.groupCode}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- แท็บ: สถานะ/การลา (ส่วนวันลา) ------------------------------- */

/** ชิป/ป้ายสีตามประเภทวันลา — คำนวณจาก tone กลางชุดเดียว ใช้ทั้งรายการและปฏิทิน */
function leaveTypeToneClass(type: SendOffLeaveType): string {
  return TONE_ZEGO_BADGE[SEND_OFF_LEAVE_TYPE[type].tone];
}

/** ยกเลิกได้ตราบใดที่ยังไม่จบเรื่อง (ปฏิเสธ/ยกเลิกไปแล้วไม่ต้องยกเลิกซ้ำ) */
function canCancelLeave(status: SendOffLeaveRecord['status']): boolean {
  return status === 'pending' || status === 'approved';
}

function LeaveTab({ staffId, records, canManage, onChanged }: {
  staffId: string;
  records: SendOffLeaveRecord[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const { currentUser, today, pushToast } = useDemo();
  const [mode, setMode] = useState<'list' | 'calendar'>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [formInitialDate, setFormInitialDate] = useState<string | undefined>(undefined);
  const [detailTarget, setDetailTarget] = useState<SendOffLeaveRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SendOffLeaveRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SendOffLeaveRecord | null>(null);

  const openAdd = (date?: string) => { setFormInitialDate(date); setFormOpen(true); };

  const approve = (r: SendOffLeaveRecord) => {
    try {
      decideSendOffLeave(r.id, 'approved', currentUser.name);
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'คอนเฟิร์มไม่สำเร็จ');
    }
  };

  const reject = () => {
    if (!rejectTarget) return;
    try {
      decideSendOffLeave(rejectTarget.id, 'rejected', currentUser.name, 'ผู้จัดปฏิเสธคำขอ');
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setRejectTarget(null);
    }
  };

  const cancel = () => {
    if (!cancelTarget) return;
    try {
      cancelSendOffLeave(cancelTarget.id, currentUser.name);
      onChanged();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ');
    } finally {
      setCancelTarget(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="วันลา"
        description={`${records.length} รายการ`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              label="มุมมองวันลา"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'list', label: 'รายการ' },
                { value: 'calendar', label: 'ปฏิทิน' },
              ]}
            />
            <Button size="sm" variant="primary" icon="plus" onClick={() => openAdd()}>ขอลา</Button>
          </div>
        }
      />

      {mode === 'calendar' ? (
        <SendOffLeaveCalendar
          records={records}
          today={today}
          onAddDay={(iso) => openAdd(iso)}
          onOpenRecord={setDetailTarget}
        />
      ) : records.length === 0 ? (
        <EmptyState icon="calendar" title="ยังไม่มีวันลา" description="กด “ขอลา” เพื่อบันทึกวันที่ไม่พร้อมรับงาน" />
      ) : (
        <ul className="space-y-2.5">
          {records.map((r) => {
            // ยังเก็บประวัติได้อยู่ ไม่ต้องเช็คงานชนของรายการที่จบเรื่องแล้ว (ปฏิเสธ/ยกเลิก)
            const conflicts = canCancelLeave(r.status) ? findAssignedJobsInRange(staffId, r.startDate, r.endDate) : [];
            return (
            <li key={r.id} className="zego-border-color rounded-xl border p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cx('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', leaveTypeToneClass(r.type))}>
                      {SEND_OFF_LEAVE_TYPE[r.type].label}
                    </span>
                    <StatusBadge meta={SEND_OFF_LEAVE_STATUS[r.status]} size="sm" />
                  </div>
                  <p className="zego-text-secondary mt-1 text-sm">
                    {formatDate(r.startDate)}{r.startDate !== r.endDate ? ` – ${formatDate(r.endDate)}` : ''} · {leaveDayCount(r)} วัน
                  </p>
                  <p className="zego-text-tertiary text-xs">เหตุผล: {r.reason || '—'}</p>
                  <p className="zego-text-tertiary mt-0.5 text-xs">{r.id} · ยื่นโดย {r.requestedBy}</p>
                  {r.decisionNote && <p className="zego-text-tertiary text-xs">หมายเหตุผู้จัด: {r.decisionNote}</p>}
                  {conflicts.length > 0 && (
                    <p className="zego-text-danger mt-1 text-xs font-medium">
                      ! มีการจัดกรุ๊ปไว้แล้ว {conflicts.length} กรุ๊ปในช่วงนี้: {conflicts.map((c) => c.groupCode).join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {canManage && r.status === 'pending' && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => approve(r)}>คอนเฟิร์ม</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRejectTarget(r)}>ปฏิเสธ</Button>
                    </>
                  )}
                  {canCancelLeave(r.status) && (
                    <Button size="sm" variant="ghost" onClick={() => setCancelTarget(r)}>ยกเลิก</Button>
                  )}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <LeaveRequestModal
          staffId={staffId}
          initialDate={formInitialDate}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); onChanged(); }}
        />
      )}

      {detailTarget && (
        <LeaveRecordDetailModal
          record={detailTarget}
          canManage={canManage}
          onClose={() => setDetailTarget(null)}
          onApprove={() => { approve(detailTarget); setDetailTarget(null); }}
          onReject={() => { setRejectTarget(detailTarget); setDetailTarget(null); }}
          onCancel={() => { setCancelTarget(detailTarget); setDetailTarget(null); }}
        />
      )}

      <ConfirmDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={reject}
        tone="danger"
        title="ปฏิเสธคำขอลา"
        confirmLabel="ยืนยันปฏิเสธ"
        message={rejectTarget ? `ปฏิเสธคำขอ ${rejectTarget.id} (${SEND_OFF_LEAVE_TYPE[rejectTarget.type].label})?` : ''}
      />
      <ConfirmDialog
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancel}
        tone="danger"
        title="ยกเลิกคำขอลา"
        confirmLabel="ยืนยันยกเลิก"
        message={cancelTarget ? `ยกเลิกคำขอ ${cancelTarget.id} (${SEND_OFF_LEAVE_TYPE[cancelTarget.type].label})? จะไม่มีผล แต่ยังเก็บประวัติไว้` : ''}
      />
    </Card>
  );
}

/** ปฏิทินวันลารายเดือน — คลิกวันว่างเพื่อขอลา · คลิกชิปเพื่อดูรายละเอียด/คอนเฟิร์ม/ปฏิเสธ/ยกเลิก */
function SendOffLeaveCalendar({ records, today, onAddDay, onOpenRecord }: {
  records: SendOffLeaveRecord[];
  today: string;
  onAddDay: (iso: string) => void;
  onOpenRecord: (r: SendOffLeaveRecord) => void;
}) {
  const [cursor, setCursor] = useState(today);
  const monthIndex = parseDate(cursor).getMonth();
  const first = startOfMonth(cursor);
  const gridStart = addDays(first, -parseDate(first).getDay());
  const weeks = useMemo(
    () => Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i))),
    [gridStart],
  );
  // ปฏิเสธ/ยกเลิกแล้วไม่มีผล ไม่ต้องเกะกะบนปฏิทิน — ดูประวัติได้จากมุมมองรายการ
  const active = useMemo(() => records.filter((r) => r.status !== 'cancelled' && r.status !== 'rejected'), [records]);

  const step = (dir: -1 | 1) => {
    const d = parseDate(cursor);
    d.setMonth(d.getMonth() + dir);
    setCursor(toISODate(d));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => step(-1)} aria-label="เดือนก่อนหน้า" className="zego-icon-btn zego-hover-surface rounded-lg p-1.5">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <span className="zego-text text-sm font-semibold">{formatThaiMonthYear(cursor)}</span>
        <button type="button" onClick={() => step(1)} aria-label="เดือนถัดไป" className="zego-icon-btn zego-hover-surface rounded-lg p-1.5">
          <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>

      <div className="zego-border-color overflow-hidden rounded-xl border">
        <div className="zego-divider-bottom zego-surface-soft-bg zego-text-tertiary grid grid-cols-7 text-center text-xs font-medium">
          {TH_WEEKDAYS_SHORT.map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="zego-divider-bottom grid grid-cols-7 last:border-b-0">
            {week.map((iso) => {
              const isCurMonth = parseDate(iso).getMonth() === monthIndex;
              const dayRecords = active.filter((r) => leaveCoversDate(r, iso));
              return (
                <div
                  key={iso}
                  role="button"
                  tabIndex={0}
                  onClick={() => onAddDay(iso)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAddDay(iso); } }}
                  aria-label={`ขอลาวันที่ ${formatDate(iso)}`}
                  className={cx(
                    'zego-border-color zego-hover-surface min-h-[76px] cursor-pointer space-y-0.5 border-r p-1 text-left last:border-r-0',
                    !isCurMonth && 'zego-surface-soft-bg',
                  )}
                >
                  <span className={cx('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs', iso === today ? 'zego-today-badge font-semibold' : isCurMonth ? 'zego-text-secondary' : 'zego-text-disabled')}>
                    {parseDate(iso).getDate()}
                  </span>
                  {dayRecords.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onOpenRecord(r); }}
                      title={`${SEND_OFF_LEAVE_TYPE[r.type].label} · ${SEND_OFF_LEAVE_STATUS[r.status].label}`}
                      className={cx(
                        'block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-medium',
                        leaveTypeToneClass(r.type),
                        r.status === 'pending' && 'opacity-70',
                      )}
                    >
                      {SEND_OFF_LEAVE_TYPE[r.type].label}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="zego-text-tertiary text-xs">คลิกวันที่ว่างเพื่อขอลา · คลิกชิปเพื่อดูรายละเอียด/คอนเฟิร์ม/ปฏิเสธ/ยกเลิก</p>
    </div>
  );
}

/** รายละเอียดวันลา 1 รายการ + ปุ่มดำเนินการ — เปิดจากการคลิกชิปบนปฏิทิน */
function LeaveRecordDetailModal({ record, canManage, onClose, onApprove, onReject, onCancel }: {
  record: SendOffLeaveRecord;
  canManage: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
}) {
  const conflicts = canCancelLeave(record.status)
    ? findAssignedJobsInRange(record.staffId, record.startDate, record.endDate)
    : [];
  return (
    <Modal
      open
      onClose={onClose}
      title={SEND_OFF_LEAVE_TYPE[record.type].label}
      description={record.id}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ปิด</Button>
          {canCancelLeave(record.status) && <Button variant="ghost" onClick={onCancel}>ยกเลิก</Button>}
          {canManage && record.status === 'pending' && (
            <>
              <Button variant="secondary" onClick={onReject}>ปฏิเสธ</Button>
              <Button variant="primary" onClick={onApprove}>คอนเฟิร์ม</Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <StatusBadge meta={SEND_OFF_LEAVE_STATUS[record.status]} />
        <p className="zego-text-secondary text-sm">
          {formatDate(record.startDate)}{record.startDate !== record.endDate ? ` – ${formatDate(record.endDate)}` : ''} · {leaveDayCount(record)} วัน
        </p>
        <p className="zego-text-secondary text-sm">เหตุผล: {record.reason || '—'}</p>
        <p className="zego-text-tertiary text-xs">{record.id} · ยื่นโดย {record.requestedBy}</p>
        {record.decisionNote && <p className="zego-text-tertiary text-xs">หมายเหตุผู้จัด: {record.decisionNote}</p>}
        {conflicts.length > 0 && (
          <Callout tone="amber" title={`มีการจัดกรุ๊ปไว้แล้ว ${conflicts.length} กรุ๊ปในช่วงนี้`}>
            <ul className="mt-1 space-y-0.5 text-xs">
              {conflicts.map((c) => <li key={`${c.groupCode}-${c.dutyDate}`}>{formatDate(c.dutyDate)} · {c.groupCode}</li>)}
            </ul>
          </Callout>
        )}
      </div>
    </Modal>
  );
}

function LeaveRequestModal({ staffId, initialDate, onClose, onSaved }: {
  staffId: string;
  /** วันที่เริ่มต้น — ใช้เมื่อเปิดจากการคลิกวันบนปฏิทิน ไม่ส่งมา = วันนี้ */
  initialDate?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { today, currentUser, pushToast } = useDemo();
  const [type, setType] = useState<SendOffLeaveType>('personal');
  const [startDate, setStartDate] = useState(initialDate ?? today);
  const [endDate, setEndDate] = useState(initialDate ?? today);
  const [reason, setReason] = useState('');
  const rangeError = endDate < startDate ? 'ต้องไม่ก่อนวันเริ่มลา' : undefined;
  const valid = !!startDate && !!endDate && !rangeError;

  /* เตือนตั้งแต่ตอนกรอก ไม่รอให้ยื่นแล้วค่อยรู้ — แจ้งเฉย ๆ ไม่บล็อกการส่งคำขอ เพราะผู้จัดอาจกำลังจะย้ายงานให้คนอื่นอยู่แล้ว */
  const jobConflicts = useMemo(
    () => (rangeError ? [] : findAssignedJobsInRange(staffId, startDate, endDate)),
    [staffId, startDate, endDate, rangeError],
  );

  const submit = () => {
    if (!valid) return;
    try {
      const rows = loadSendOffLeave();
      const id = nextSendOffLeaveId(rows);
      upsertSendOffLeave({
        id,
        staffId,
        type,
        startDate,
        endDate,
        reason,
        status: 'pending',
        requestedBy: currentUser.name,
        requestedAt: new Date().toISOString(),
      });
      pushToast('success', 'ส่งคำขอลาแล้ว — รอผู้จัดอนุมัติ');
      onSaved();
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="ขอลา / แจ้งไม่พร้อมรับงาน"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={!valid} onClick={submit}>ส่งคำขอ</Button>
        </>
      }
    >
      <div className="space-y-3">
        <SelectInput
          label="ประเภท"
          value={type}
          onChange={(e) => setType(e.target.value as SendOffLeaveType)}
          options={SEND_OFF_LEAVE_TYPE_ORDER.map((t) => ({ value: t, label: SEND_OFF_LEAVE_TYPE[t].label }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <DateField label="วันที่เริ่มลา" value={startDate} onChange={setStartDate} />
          <DateField label="วันที่สิ้นสุด" value={endDate} min={startDate} error={rangeError} onChange={setEndDate} />
        </div>
        <TextArea label="เหตุผล" optional value={reason} onChange={(e) => setReason(e.target.value)} />
        {jobConflicts.length > 0 && (
          <Callout tone="amber" title={`มีการจัดกรุ๊ปไว้แล้ว ${jobConflicts.length} กรุ๊ปในช่วงนี้`}>
            <ul className="mt-1 space-y-0.5 text-xs">
              {jobConflicts.map((c) => (
                <li key={`${c.groupCode}-${c.dutyDate}`}>{formatDate(c.dutyDate)} · {c.groupCode}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs">ยื่นคำขอได้ตามปกติ แต่ควรย้ายงานให้คนอื่นก่อนอนุมัติ ไม่งั้นตารางจะชนกัน</p>
          </Callout>
        )}
      </div>
    </Modal>
  );
}
