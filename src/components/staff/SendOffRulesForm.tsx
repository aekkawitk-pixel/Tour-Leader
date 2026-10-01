'use client';

/**
 * เงื่อนไขการจัดเจ้าหน้าที่ส่งกรุ๊ป — หน้าตั้งค่าของผู้จัด
 *
 * ตัวเลขพวกนี้เป็นนโยบายของแต่ละที่ ไม่ใช่กฎตายตัว จึงต้องปรับได้เอง
 * แก้แล้วมีผลกับตารางจัดสเก็ตทันทีในครั้งถัดไปที่เปิดหน้านั้น
 */

import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, Card, CardHeader } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/FormField';
import { ConfirmDialog } from '@/components/ui/Modal';
import { can } from '@/lib/permissions';
import {
  checkSendOffPair, DEFAULT_SEND_OFF_RULES, formatHours, sendOffSlot, SEND_OFF_RULE_LIMITS,
  validateRules, type SendOffRules,
} from '@/lib/logic/sendOffRules';
import { loadSendOffRules, resetSendOffRules, saveSendOffRules } from '@/services/sendOffRulesStore';

/** ตัวอย่างที่ใช้ทดลองค่า — ไล่ตามลำดับที่ผู้จัดอธิบายไว้ */
const SAMPLE = [
  { groupCode: 'กรุ๊ป 1', airport: 'DMK', flightTime: '08:00' },
  { groupCode: 'กรุ๊ป 2', airport: 'DMK', flightTime: '11:30' },
  { groupCode: 'กรุ๊ป 3', airport: 'BKK', flightTime: '18:30' },
  { groupCode: 'กรุ๊ป 4', airport: 'BKK', flightTime: '22:00' },
];

export function SendOffRulesForm() {
  const { currentUser, pushToast } = useDemo();
  const canManage = can(currentUser.role, 'leader.edit');

  const [saved, setSaved] = useState<SendOffRules>(DEFAULT_SEND_OFF_RULES);
  const [form, setForm] = useState<SendOffRules>(DEFAULT_SEND_OFF_RULES);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const r = loadSendOffRules();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(r);
    setForm(r);
  }, []);

  const error = validateRules(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const setNum = (key: keyof typeof SEND_OFF_RULE_LIMITS, raw: string) => {
    const v = Number(raw);
    setForm((p) => ({ ...p, [key]: Number.isFinite(v) ? v : 0 }));
  };

  const submit = () => {
    if (error) return;
    try {
      setSaved(saveSendOffRules(form));
      pushToast('success', 'บันทึกเงื่อนไขแล้ว — ตารางจัดสเก็ตจะใช้เกณฑ์ใหม่ทันที');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const doReset = () => {
    try {
      const r = resetSendOffRules();
      setSaved(r);
      setForm(r);
      setConfirmReset(false);
      pushToast('success', 'คืนค่าเริ่มต้นของระบบแล้ว');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'คืนค่าไม่สำเร็จ');
    }
  };

  /* ทดลองค่ากับตัวอย่างจริง — เห็นผลก่อนกดบันทึก ไม่ต้องไปลองที่ตารางแล้วค่อยกลับมาแก้ */
  const slots = SAMPLE.map((g) => sendOffSlot({ ...g, departDate: '2026-09-01' }, form));
  const pairs = slots.slice(0, -1).map((a, i) => {
    const b = slots[i + 1];
    return a && b ? { a: SAMPLE[i], b: SAMPLE[i + 1], check: checkSendOffPair(a, b, form) } : null;
  });

  return (
    <div className="space-y-3">
      <Callout tone="blue" title="เกณฑ์สองแบบนี้นับคนละจุดโดยตั้งใจ">
        <ul className="ml-4 list-disc space-y-0.5">
          <li><b>สนามบินเดียวกัน</b> นับจาก <b>เวลาเช็คอิน</b> (เวลาที่ต้องไปถึง) — อยู่ที่เดิม ส่งเสร็จรอกรุ๊ปถัดไปได้เลย ไม่ผ่านเกณฑ์นี้ยัง <b>จัดได้</b> เพียงแต่ระบบจะเตือนว่า &ldquo;ทับซ้อน&rdquo; ให้เจ้าหน้าที่เตรียมตัว (ใช้เมื่อกรุ๊ปวันนั้นเยอะกว่าคนว่างจริง)</li>
          <li><b>คนละสนามบิน</b> นับจาก <b>เวลาเครื่องออก</b> — ต้องรอกรุ๊ปแรกขึ้นเครื่องก่อน แล้วจึงวิ่งข้ามไปเช็คอินอีกที่ ไม่ผ่านเกณฑ์นี้ <b>จัดไม่ได้จริง</b> (ต้องเดินทางจริง เลี่ยงไม่ได้) เป็นกฎตายตัว</li>
          <li><b>วันหยุด</b> (เสาร์-อาทิตย์ และวันหยุดที่ตั้งไว้ในเมนูวันหยุด) ประเภทพนักงานไม่ติดงานประจำ จึงจัดได้ทุกช่วงเวลาเท่าประเภทประจำ</li>
        </ul>
      </Callout>

      <Card>
        <CardHeader title="เงื่อนไขการจัด" description="แก้แล้วมีผลกับการตรวจในตารางจัดสเก็ตทั้งหมด" />
        <div className="grid gap-3 sm:grid-cols-3">
          {(Object.keys(SEND_OFF_RULE_LIMITS) as (keyof typeof SEND_OFF_RULE_LIMITS)[]).map((key) => {
            const lim = SEND_OFF_RULE_LIMITS[key];
            return (
              <TextInput
                key={key}
                label={lim.label}
                type="number"
                min={lim.min}
                max={lim.max}
                step={lim.step}
                disabled={!canManage}
                value={String(form[key])}
                onChange={(e) => setNum(key, e.target.value)}
                hint={`${lim.min}–${lim.max} ${lim.unit} · ค่าเริ่มต้น ${DEFAULT_SEND_OFF_RULES[key]}`}
              />
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <TextInput
            label="เวลาเข้างานประจำ (ประเภทพนักงาน)"
            type="time"
            disabled={!canManage}
            value={form.employeeWorkStart}
            onChange={(e) => setForm((p) => ({ ...p, employeeWorkStart: e.target.value }))}
          />
          <TextInput
            label="เวลาเลิกงานประจำ"
            type="time"
            disabled={!canManage}
            value={form.employeeWorkEnd}
            onChange={(e) => setForm((p) => ({ ...p, employeeWorkEnd: e.target.value }))}
            hint="ประเภทพนักงานไปส่งช่วงนี้ไม่ได้ — ยกเว้นวันหยุด"
          />
        </div>

        {error && <p className="zego-text-danger mt-2 text-sm">{error}</p>}

        {canManage && (
          <div className="zego-divider-top mt-4 flex flex-wrap items-center gap-2 pt-3">
            <Button variant="primary" disabled={Boolean(error) || !dirty} onClick={submit}>บันทึกเงื่อนไข</Button>
            <Button variant="secondary" disabled={!dirty} onClick={() => setForm(saved)}>ยกเลิกการแก้ไข</Button>
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>คืนค่าเริ่มต้น</Button>
            {dirty && <span className="zego-text-warning text-xs">ยังไม่ได้บันทึก</span>}
          </div>
        )}
        {!canManage && <p className="zego-text-tertiary mt-3 text-xs">บทบาทของคุณดูได้อย่างเดียว — แก้เงื่อนไขได้เฉพาะผู้ดูแลระบบและผู้จัดหัวหน้าทัวร์</p>}
      </Card>

      {/* ทดลองกับตัวอย่าง — เห็นผลของค่าที่กรอกก่อนบันทึก */}
      <Card>
        <CardHeader
          title="ทดลองกับตัวอย่าง"
          description="คนเดียวกันรับ 4 กรุ๊ปเรียงกันในวันเดียว — ผลด้านล่างคิดจากค่าที่กรอกไว้ตอนนี้"
        />
        <ul className="space-y-1 text-sm">
          {SAMPLE.map((g) => (
            <li key={g.groupCode} className="zego-text-secondary flex flex-wrap items-baseline gap-x-2">
              <span className="zego-text font-medium">{g.groupCode}</span>
              <span className="text-xs">{g.airport === 'DMK' ? 'ดอนเมือง' : 'สุวรรณภูมิ'} · เครื่องออก {g.flightTime}</span>
              <span className="zego-text-tertiary text-xs">
                เช็คอิน {slots[SAMPLE.indexOf(g)] ? hhmm(slots[SAMPLE.indexOf(g)]!.checkInMin) : '—'}
              </span>
            </li>
          ))}
        </ul>
        <ul className="zego-divider-top mt-3 space-y-1 pt-2 text-xs">
          {pairs.map((p, i) => {
            if (!p) return null;
            // สนามบินเดียวกันไม่ผ่านเกณฑ์ = แค่ทับซ้อน (จัดได้ แต่เตือน) · คนละสนามบินไม่ผ่าน = จัดไม่ได้จริง
            const tone = p.check.ok ? 'zego-text-success' : p.check.sameAirport ? 'zego-text-orange' : 'zego-text-danger';
            const label = p.check.ok ? 'จัดได้' : p.check.sameAirport ? 'ทับซ้อน (จัดได้ แต่เตือน)' : 'จัดไม่ได้';
            return (
              <li key={i} className={tone}>
                <b>{label}</b> · {p.a.groupCode} → {p.b.groupCode} — {p.check.reason}
              </li>
            );
          })}
        </ul>
        <p className="zego-text-tertiary mt-2 text-[11px]">
          เกณฑ์ปัจจุบัน: ถึงสนามบินก่อนเครื่องออก {formatHours(form.leadHours)} ·
          สนามบินเดียวกันเกิน {formatHours(form.sameAirportGapHours)} ·
          คนละสนามบินเกิน {formatHours(form.crossAirportGapHours)}
        </p>
      </Card>

      <ConfirmDialog
        open={confirmReset}
        title="คืนค่าเริ่มต้นของระบบ"
        message={`ถึงสนามบินก่อน ${DEFAULT_SEND_OFF_RULES.leadHours} ชม. · สนามบินเดียวกันเกิน ${DEFAULT_SEND_OFF_RULES.sameAirportGapHours} ชม. · คนละสนามบินเกิน ${DEFAULT_SEND_OFF_RULES.crossAirportGapHours} ชม. · เวลางาน ${DEFAULT_SEND_OFF_RULES.employeeWorkStart}–${DEFAULT_SEND_OFF_RULES.employeeWorkEnd}`}
        confirmLabel="คืนค่าเริ่มต้น"
        onConfirm={doReset}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}

/** นาทีสัมบูรณ์ → "HH:MM" ของวันนั้น */
function hhmm(absMin: number): string {
  const m = ((absMin % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
