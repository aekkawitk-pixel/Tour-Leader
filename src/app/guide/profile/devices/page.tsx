'use client';

/**
 * อุปกรณ์ — /guide/profile/devices (ต้นแบบ E4) — เครื่องที่เข้าสู่ระบบอยู่ และความปลอดภัยของแอปในเครื่องนี้
 *
 *   เข้าสู่ระบบอยู่ · N เครื่อง — "เครื่องนี้" (เดาจาก User-Agent มีป้ายเขียว) + เครื่องอื่น · แถวแดงกลาง "ออกจากระบบเครื่องอื่นทั้งหมด"
 *   ความปลอดภัย — ตั้ง/เปลี่ยน PIN (แผ่น) · ล็อกอัตโนมัติ (แผ่นเลือก) · Face ID (สวิตช์ ต้องมี PIN ก่อน)
 *                 · ใช้ออฟไลน์ในเครื่องนี้ (สวิตช์) · ลืมเครื่องนี้ (แถวแดง ยืนยันก่อน → ล้างค่าแล้วออกจากระบบ)
 *
 * Demo: ค่าทั้งหมดเก็บในเบราว์เซอร์นี้ (guideDeviceStore) ยังไม่ได้ล็อกแอปจริง · "เครื่องอื่น" เป็นข้อมูลตัวอย่าง
 * "ออกจากระบบ" ใน Demo = ออกจากมุมมองหัวหน้าทัวร์ (เหมือนปุ่มออกที่หัวพอร์ทัล)
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { landingPathForRole, ownLeaderScope } from '@/lib/permissions';
import { formatDate, toISODate } from '@/lib/format';
import {
  AUTO_LOCK_OPTIONS,
  PIN_LENGTH,
  autoLockLabel,
  detectDevice,
  hashPin,
  validateNewPin,
  type DetectedDevice,
  type DeviceKind,
} from '@/lib/logic/guideDevice';
import {
  forgetDeviceSettings,
  readDeviceSettings,
  writeDeviceSettings,
  type GuideDeviceSettings,
} from '@/services/guideDeviceStore';
import { saveErrorMessage } from '@/services/browserStorage';
import { Button, Card, EmptyState, cx } from '@/components/ui/Primitives';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { FormField, baseControl, errorControl } from '@/components/ui/FormField';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ProfileBackHeader } from '../ProfileBackHeader';

const KIND_ICON: Record<DeviceKind, IconName> = { phone: 'smartphone', tablet: 'tablet', desktop: 'monitor' };

type Tone = 'green' | 'neutral' | 'teal' | 'red';

/** แถวรายการ: ไอคอนสี · ชื่อ/บรรทัดรอง · ด้านขวา (ป้าย/ค่า/สวิตช์) */
function RowBody({ icon, tone, title, sub, right, danger = false }: {
  icon: IconName; tone: Tone; title: ReactNode; sub?: ReactNode; right?: ReactNode; danger?: boolean;
}) {
  return (
    <>
      <span className={cx('zego-guide-tile', `zego-guide-tile--${tone}`)}><Icon name={icon} className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className={cx('zego-guide-row__title', danger && 'zego-text-danger')}>{title}</span>
        {sub && <span className="zego-guide-row__sub">{sub}</span>}
      </span>
      {right}
    </>
  );
}

/** สวิตช์ (ส่วนแสดงผล) — ทั้งแถวเป็นปุ่ม role="switch" กดตรงไหนของแถวก็สลับได้ */
const SwitchKnob = () => <span className="zego-guide-switch" aria-hidden="true" />;

export default function GuideDevicesPage() {
  const { currentUser, leaders, pushToast, setRole } = useDemo();
  const router = useRouter();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const today = toISODate(new Date());

  const [settings, setSettings] = useState<GuideDeviceSettings | null>(null);
  const [device, setDevice] = useState<DetectedDevice | null>(null);
  const [sheet, setSheet] = useState<'pin' | 'autolock' | null>(null);
  const [confirm, setConfirm] = useState<'signOutOthers' | 'forget' | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านจาก localStorage/navigator ได้เฉพาะฝั่งเบราว์เซอร์ (หลัง mount)
    setSettings(leader ? readDeviceSettings(leader.id, today) : null);
    setDevice(detectDevice(navigator.userAgent, navigator.maxTouchPoints));
  }, [leader, today]);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="อุปกรณ์" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }
  if (!settings || !device) return <ProfileBackHeader title="อุปกรณ์" />;

  /** บันทึกทั้งชุด — สำเร็จคืน true · ไม่สำเร็จแจ้งผู้ใช้และคงค่าเดิมบนจอ */
  const save = (next: GuideDeviceSettings, success?: string): boolean => {
    try {
      writeDeviceSettings(leader.id, next);
      setSettings(next);
      if (success) pushToast('success', success);
      return true;
    } catch (e) {
      pushToast('error', saveErrorMessage(e));
      return false;
    }
  };

  const faceLabel = device.os === 'ios' ? 'Face ID' : 'ปลดล็อกด้วยใบหน้า';
  const hasPin = settings.pinHash !== null;

  const toggleFace = () => {
    // ใบหน้าใช้ PIN เป็นทางสำรองเมื่อสแกนไม่ผ่าน — ยังไม่มี PIN ให้ตั้งก่อน
    if (!settings.faceUnlock && !hasPin) {
      pushToast('info', `ตั้ง PIN ก่อนเปิด${faceLabel}`);
      setSheet('pin');
      return;
    }
    save({ ...settings, faceUnlock: !settings.faceUnlock });
  };

  const signOutOthers = () => {
    const n = settings.otherDevices.length;
    if (save({ ...settings, otherDevices: [] }, `ออกจากระบบเครื่องอื่นแล้ว ${n} เครื่อง`)) setConfirm(null);
  };

  const forgetThisDevice = () => {
    try {
      forgetDeviceSettings(leader.id);
    } catch (e) {
      pushToast('error', saveErrorMessage(e));
      return;
    }
    setConfirm(null);
    pushToast('success', 'ลืมเครื่องนี้แล้ว — ออกจากระบบเรียบร้อย');
    // Demo: ออกจากระบบ = ออกจากมุมมองหัวหน้าทัวร์ (เหมือนปุ่มออกที่หัวพอร์ทัล)
    setRole('coordinator');
    router.push(landingPathForRole('coordinator'));
  };

  const deviceCount = 1 + settings.otherDevices.length;

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="อุปกรณ์" />

      {/* ---------------------------- เครื่องที่เข้าสู่ระบบอยู่ ---------------------------- */}
      <section className="space-y-1.5">
        <h2 className="zego-guide-label">
          เข้าสู่ระบบอยู่
          <span className="font-normal zego-text-tertiary">· {deviceCount} เครื่อง</span>
        </h2>
        <ul className="zego-guide-list">
          <li className="zego-guide-row zego-guide-row--tall">
            <RowBody
              icon={KIND_ICON[device.kind]}
              tone="green"
              title={device.name}
              sub="ใช้งานอยู่ตอนนี้"
              right={<span className="zego-chip zego-chip--green shrink-0">เครื่องนี้</span>}
            />
          </li>
          {settings.otherDevices.map((d) => (
            <li key={d.id} className="zego-guide-row zego-guide-row--tall">
              <RowBody icon={KIND_ICON[d.kind]} tone="neutral" title={d.name} sub={`ใช้งานล่าสุด ${formatDate(d.lastActiveAt)}`} />
            </li>
          ))}
          {settings.otherDevices.length > 0 && (
            <li>
              <button type="button" onClick={() => setConfirm('signOutOthers')} className="zego-guide-row zego-guide-row--center zego-text-danger">
                ออกจากระบบเครื่องอื่นทั้งหมด
              </button>
            </li>
          )}
        </ul>
      </section>

      {/* -------------------------------- ความปลอดภัย -------------------------------- */}
      <section className="space-y-1.5">
        <h2 className="zego-guide-label">ความปลอดภัย</h2>
        <ul className="zego-guide-list">
          <li>
            <button type="button" onClick={() => setSheet('pin')} aria-label={hasPin ? 'เปลี่ยน PIN' : 'ตั้ง PIN'} className="zego-guide-row zego-guide-row--tall">
              <RowBody
                icon="key"
                tone="green"
                title={hasPin ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}
                sub={hasPin ? `เปลี่ยนล่าสุด ${formatDate(settings.pinUpdatedAt)}` : 'ยังไม่ได้ตั้ง — ใช้ปลดล็อกแอป'}
                right={<Icon name="chevronRight" className="zego-guide-chev h-4 w-4" />}
              />
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setSheet('autolock')} aria-label={`ล็อกอัตโนมัติ: ${autoLockLabel(settings.autoLockMinutes)}`} className="zego-guide-row zego-guide-row--tall">
              <RowBody
                icon="lock"
                tone="green"
                title="ล็อกอัตโนมัติ"
                right={
                  <>
                    <span className="shrink-0 text-sm zego-text-secondary">{autoLockLabel(settings.autoLockMinutes)}</span>
                    <Icon name="chevronRight" className="zego-guide-chev h-4 w-4" />
                  </>
                }
              />
            </button>
          </li>
          <li>
            <button type="button" role="switch" aria-checked={settings.faceUnlock} aria-label={faceLabel} onClick={toggleFace} className="zego-guide-row zego-guide-row--tall">
              <RowBody icon="faceId" tone="green" title={faceLabel} sub={hasPin ? undefined : 'ต้องตั้ง PIN ก่อน'} right={<SwitchKnob />} />
            </button>
          </li>
          <li>
            <button
              type="button"
              role="switch"
              aria-checked={settings.offline}
              aria-label="ใช้ออฟไลน์ในเครื่องนี้"
              onClick={() => save({ ...settings, offline: !settings.offline })}
              className="zego-guide-row zego-guide-row--tall"
            >
              <RowBody icon="cloud" tone="teal" title="ใช้ออฟไลน์ในเครื่องนี้" right={<SwitchKnob />} />
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setConfirm('forget')} aria-label="ลืมเครื่องนี้ — ออกจากระบบและยกเลิกการผูกเครื่อง" className="zego-guide-row zego-guide-row--tall">
              <RowBody
                icon="logout"
                tone="red"
                danger
                title="ลืมเครื่องนี้"
                sub="ออกจากระบบและยกเลิกการผูกเครื่อง"
                right={<Icon name="chevronRight" className="zego-guide-chev h-4 w-4" />}
              />
            </button>
          </li>
        </ul>
      </section>

      <p className="px-1 text-xs zego-text-tertiary">
        โหมดทดลอง — การตั้งค่าเก็บไว้ในเบราว์เซอร์นี้เท่านั้น ยังไม่ได้ล็อกแอปจริง
      </p>

      {/* key ใหม่ทุกครั้งที่เปิด — ช่องกรอก PIN เริ่มว่างเสมอ */}
      {sheet === 'pin' && (
        <PinSheet
          key={settings.pinUpdatedAt ?? 'new'}
          leaderId={leader.id}
          currentHash={settings.pinHash}
          onClose={() => setSheet(null)}
          onSave={(hash) => {
            if (save({ ...settings, pinHash: hash, pinUpdatedAt: today }, hasPin ? 'เปลี่ยน PIN แล้ว' : 'ตั้ง PIN แล้ว')) setSheet(null);
          }}
        />
      )}

      <Modal open={sheet === 'autolock'} onClose={() => setSheet(null)} title="ล็อกอัตโนมัติ" description="ล็อกแอปเมื่อไม่ได้ใช้งานนานเท่านี้">
        <ul className="zego-guide-list" role="radiogroup" aria-label="ระยะเวลาก่อนล็อกอัตโนมัติ">
          {AUTO_LOCK_OPTIONS.map((o) => {
            const selected = o.minutes === settings.autoLockMinutes;
            return (
              <li key={o.minutes}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => { if (save({ ...settings, autoLockMinutes: o.minutes })) setSheet(null); }}
                  className="zego-guide-row"
                >
                  <span className={cx('flex-1 text-sm', selected ? 'font-semibold text-[var(--zego-heading)]' : 'zego-text')}>{o.label}</span>
                  {selected && <Icon name="check" className="h-4 w-4 text-[var(--zego-label)]" />}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>

      <ConfirmDialog
        open={confirm === 'signOutOthers'}
        onClose={() => setConfirm(null)}
        onConfirm={signOutOthers}
        title="ออกจากระบบเครื่องอื่นทั้งหมด?"
        message={`เครื่องอื่น ${settings.otherDevices.length} เครื่องจะต้องเข้าสู่ระบบใหม่ — เครื่องนี้ยังใช้งานต่อได้`}
        confirmLabel="ออกจากระบบเครื่องอื่น"
      />
      <ConfirmDialog
        open={confirm === 'forget'}
        onClose={() => setConfirm(null)}
        onConfirm={forgetThisDevice}
        title="ลืมเครื่องนี้?"
        message="ระบบจะออกจากระบบ และล้าง PIN ล็อกอัตโนมัติ การปลดล็อกด้วยใบหน้า และข้อมูลออฟไลน์ในเครื่องนี้ — ครั้งหน้าต้องเข้าสู่ระบบและตั้งค่าใหม่"
        confirmLabel="ลืมเครื่องนี้"
      />
    </div>
  );
}

/* ------------------------------ แผ่นตั้ง/เปลี่ยน PIN ------------------------------ */

function PinSheet({ leaderId, currentHash, onClose, onSave }: {
  leaderId: string;
  currentHash: string | null;
  onClose: () => void;
  onSave: (hash: string) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<{ field: 'current' | 'next'; message: string } | null>(null);
  const changing = currentHash !== null;

  const submit = () => {
    if (changing && hashPin(leaderId, current) !== currentHash) {
      setError({ field: 'current', message: 'PIN ปัจจุบันไม่ถูกต้อง' });
      return;
    }
    const problem = validateNewPin(next, again);
    if (problem) { setError({ field: 'next', message: problem }); return; }
    if (changing && next === current) { setError({ field: 'next', message: 'PIN ใหม่ต้องไม่ซ้ำกับ PIN เดิม' }); return; }
    onSave(hashPin(leaderId, next));
  };

  /** ช่อง PIN — ตัวเลขเท่านั้น ซ่อนค่า ไม่ให้เบราว์เซอร์จำ */
  const pinInput = (id: string, value: string, set: (v: string) => void, invalid: boolean) => (
    <input
      id={id}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={PIN_LENGTH}
      value={value}
      onChange={(e) => { set(e.target.value.replace(/\D/g, '').slice(0, PIN_LENGTH)); setError(null); }}
      onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      className={cx(baseControl, 'text-center font-mono text-lg tracking-[0.5em]', invalid && errorControl)}
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={changing ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}
      description={`ตัวเลข ${PIN_LENGTH} หลัก ใช้ปลดล็อกแอปในเครื่องนี้ — ห้ามใช้เลขเดียวกันทั้งหมดหรือเลขเรียงกัน`}
      footer={
        <div className="flex gap-2">
          <Button onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" onClick={submit}>{changing ? 'บันทึก PIN ใหม่' : 'ตั้ง PIN'}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        {changing && (
          <FormField label="PIN ปัจจุบัน" htmlFor="pin-current" required error={error?.field === 'current' ? error.message : undefined}>
            {pinInput('pin-current', current, setCurrent, error?.field === 'current')}
          </FormField>
        )}
        <FormField label={changing ? 'PIN ใหม่' : 'PIN'} htmlFor="pin-next" required error={error?.field === 'next' ? error.message : undefined}>
          {pinInput('pin-next', next, setNext, error?.field === 'next')}
        </FormField>
        <FormField label={changing ? 'ยืนยัน PIN ใหม่' : 'ยืนยัน PIN'} htmlFor="pin-again" required>
          {pinInput('pin-again', again, setAgain, error?.field === 'next')}
        </FormField>
      </div>
    </Modal>
  );
}
