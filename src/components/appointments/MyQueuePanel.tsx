'use client';

/**
 * คิวของฉัน — เรียกคิวแบบธนาคาร: ระบบเลือกคนถัดไปให้ เจ้าหน้าที่ไม่ต้องเลือกเอง จึงไม่เรียกซ้ำกัน
 *   1) เลือกว่าวันนี้รับคิวไหน (ญี่ปุ่น / ประเทศอื่น / ทั้งสองคิว) — จำต่อคนต่อวัน
 *   2) งานที่ถืออยู่: เรียกแล้วรอเข้าพบ / กำลังเคลียร์ — ทีละกรุ๊ปต่อคน
 *   3) "เรียกคิวถัดไป" = นัดที่ใกล้ที่สุดในคิวของฉันที่ยังไม่มีใครจอง · กดแล้วจองให้คนกดทันที
 *      เจ้าหน้าที่หลายคนในคิวเดียวกันกดได้คนละคน — คนที่ถูกจองแล้วไม่ถูกเสนอให้คนอื่นอีก
 */

import { useState } from 'react';
import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatTime, toISODate } from '@/lib/format';
import { LANE_LABEL, myCurrentJob, waitingQueue, type ClearLane } from '@/lib/logic/appointmentSlots';
import { laneOfAppointment } from '@/lib/logic/appointmentLane';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { useCallIn } from './CallNextHost';
import { isInProgress, useClearProgress } from './clearProgress';
import type { Appointment } from '@/types';

type LaneChoice = ClearLane | 'both';
const CHOICES: { key: LaneChoice; label: string }[] = [
  { key: 'japan', label: `คิว${LANE_LABEL.japan}` },
  { key: 'other', label: `คิว${LANE_LABEL.other}` },
  { key: 'both', label: 'ทั้งสองคิว' },
];
const prefKey = (userId: string) => `myClearLanes:${userId}`;

/** คิวที่เลือกไว้ของวันนี้ — คนละวันถือว่ายังไม่เลือก (ต้องเลือกใหม่ทุกวัน) */
function readChoice(userId: string, today: string): LaneChoice | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(prefKey(userId)) ?? 'null') as { date: string; lane: LaneChoice } | null;
    return raw?.date === today ? raw.lane : null;
  } catch {
    return null;
  }
}
function writeChoice(userId: string, today: string, lane: LaneChoice) {
  try {
    window.localStorage.setItem(prefKey(userId), JSON.stringify({ date: today, lane }));
  } catch { /* เก็บไม่ได้ก็ใช้ได้ในหน้านี้ */ }
}

const groupLine = (a: Appointment) => {
  if (!a.jobId) return 'ไม่ผูกกรุ๊ป';
  const p = getTourPeriodById(a.jobId);
  return p ? p.groupCode : periodCodeOf(a.jobId);
};

export function MyQueuePanel() {
  const { appointments, leaders, currentUser, saving } = useDemo();
  const callIn = useCallIn();
  const progress = useClearProgress();
  const today = toISODate(new Date());
  const [choice, setChoice] = useState<LaneChoice | null>(() => (typeof window === 'undefined' ? null : readChoice(currentUser.id, today)));
  const pick = (c: LaneChoice) => { setChoice(c); writeChoice(currentUser.id, today, c); };

  const leaderName = (id: string) => {
    const l = leaders.find((x) => x.id === id);
    return l ? `${l.firstName} ${l.lastName}`.trim() : id;
  };
  const lanes: ClearLane[] = choice === 'both' ? ['japan', 'other'] : choice ? [choice] : [];
  const current = myCurrentJob(appointments, today, currentUser.name);
  const queue = waitingQueue(appointments, today, lanes, laneOfAppointment);
  const next = queue[0];

  return (
    <Card className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold zego-text">คิวของฉันวันนี้</h2>
          <p className="text-xs zego-text-tertiary">กด &quot;เรียกคิวถัดไป&quot; — ระบบเลือกคนถัดไปในคิวของคุณให้ และจองไว้ให้คุณทันที เจ้าหน้าที่คนอื่นจะไม่เรียกซ้ำ</p>
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="วันนี้รับคิวไหน">
          {CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              role="radio"
              aria-checked={choice === c.key}
              onClick={() => pick(c.key)}
              className={cx('rounded-full border px-3 py-1 text-sm font-medium transition', choice === c.key ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'zego-border-color zego-text-secondary zego-hover-surface')}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {!choice ? (
        <p className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">เลือกก่อนว่าวันนี้คุณรับคิวไหน — แล้วจะเห็นคิวถัดไปของคุณ</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {/* งานที่ถืออยู่ — ทีละกรุ๊ปต่อคน */}
          <div className="rounded-lg border zego-border-color px-3 py-2.5">
            <p className="mb-1 text-xs font-semibold zego-text-tertiary">งานที่ฉันถืออยู่</p>
            {current ? (
              <div className="space-y-1.5">
                <p className="text-sm">
                  <span className="font-semibold zego-text">{groupLine(current)}</span>
                  <span className="zego-text-tertiary"> · นัด {current.time} น. · {leaderName(current.leaderId)}</span>
                </p>
                <p className={cx('text-xs font-medium', isInProgress(current) ? 'text-sky-700' : 'text-emerald-700')}>
                  {isInProgress(current)
                    ? `กำลังเคลียร์ · เริ่ม ${formatTime(current.inProgress.at)} น.`
                    : `เรียกแล้ว ${formatTime(current.calledEarly?.at)} น. · รอหัวหน้าทัวร์เข้าพบ`}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {current.jobId && (
                    <Link href={`/settlements?open=${encodeURIComponent(current.jobId)}`} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">
                      {isInProgress(current) ? 'เคลียร์ต่อ' : 'เริ่มเคลียร์'}
                      <Icon name="chevronRight" className="h-4 w-4" />
                    </Link>
                  )}
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => void progress.releaseAll(current)}>คืนคิว (ยังไม่ทำ)</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm zego-text-tertiary">ว่าง — เรียกคิวถัดไปได้เลย</p>
            )}
          </div>

          {/* คิวถัดไป — ปุ่มเดียว ระบบเลือกให้ */}
          <div className="rounded-lg border zego-border-color px-3 py-2.5">
            <p className="mb-1 text-xs font-semibold zego-text-tertiary">
              คิวถัดไป{lanes.length === 1 ? ` · คิว${LANE_LABEL[lanes[0]]}` : ''} · รอเรียกอีก {queue.length} กรุ๊ปวันนี้
            </p>
            {next ? (
              <div className="space-y-1.5">
                <p className="text-sm">
                  <span className="font-semibold zego-text">{groupLine(next)}</span>
                  <span className="zego-text-tertiary"> · นัด {next.time} น. · {leaderName(next.leaderId)}</span>
                </p>
                {lanes.length > 1 && <p className="text-xs zego-text-tertiary">คิว{LANE_LABEL[laneOfAppointment(next)]}</p>}
                <Button
                  variant="primary"
                  size="sm"
                  icon="bell"
                  loading={saving}
                  disabled={!!current}
                  onClick={() => void callIn(next, 'เรียกคิวถัดไป (คิวของฉัน)')}
                >
                  เรียกคิวถัดไป
                </Button>
                {current && <p className="text-xs text-amber-700">ปิดเคลียร์ หรือคืนคิว {groupLine(current)} ก่อน — ทีละกรุ๊ปต่อคน</p>}
              </div>
            ) : (
              <p className="text-sm zego-text-tertiary">ไม่มีคิวที่รอเรียกในคิวของคุณวันนี้</p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
