'use client';

/**
 * การ์ด "หัวหน้าทัวร์" ในหน้ารายละเอียดงาน — เลือกหัวหน้าทัวร์ได้ในตัวการ์ด
 *
 * โครงสร้าง 3 ส่วน (ไม่ทับกัน มองเห็นตลอด):
 *   1) Header คงที่ — หัวข้อ + ช่องค้นหา
 *   2) Scrollable Content — รายชื่อหัวหน้าทัวร์ (เลื่อนแนวตั้งได้ ไม่มีแนวนอน)
 *   3) Sticky Footer — ปุ่ม "ยืนยันหัวหน้าทัวร์"
 *
 * คัดกรอง (§8): เฉพาะสถานะพร้อมรับงาน + ไม่มีตารางงานทับซ้อนช่วงวันเดินทาง
 * เรียง: ประเทศตรงงาน → ภาษาตรงงาน → ประสบการณ์มากสุด
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import {
  Avatar,
  Button,
  Card,
  cx,
  EmptyState,
  StatusBadge,
} from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { LanguageChip } from '@/components/leaders/LanguageBadge';
import { LEADER_STATUS } from '@/lib/labels';
import { findConflictsForLeader } from '@/lib/logic/conflicts';
import { preferredLanguagesForCountry, rankLeaders } from '@/lib/logic/matching';
import { sortByPreference } from '@/lib/logic/preferredGuideOrder';
import { usePreferredGuideOrder } from '@/lib/usePreferredGuideOrder';
import { useExcludedGuides } from '@/lib/useExcludedGuides';
import { useFavoriteGuides } from '@/lib/useFavoriteGuides';
import {
  bestLanguageAmong,
  expertCountries,
  leaderExperienceMonths,
  leaderSearchText,
  orderedLanguages,
} from '@/lib/logic/leaderProfile';
import { formatDuration } from '@/modules/tour-leaders/experience';
import { formatDateRange } from '@/lib/format';
import { tripOfJob, useDocumentReadiness, type LeaderReadiness } from '@/lib/useDocumentReadiness';
import { DocumentReadinessBadge } from '@/components/jobs/DocumentReadinessBadge';
import type { LeaderMatch, TourJob, TourLeader } from '@/types';

/** ความสูงคงที่ของพื้นที่รายการ — เห็นราว 4–5 คนก่อนเริ่มเลื่อน (มือถือ ≤ 55vh) */
const LIST_HEIGHT = 'max-h-[55vh] sm:max-h-[26rem]';

export function JobLeaderPicker({
  job,
  canAssign,
}: {
  job: TourJob;
  canAssign: boolean;
}) {
  const { leaders, jobs, countries, routes, today } = useDemo();
  const assignedLeader = leaders.find((l) => l.id === job.leaderId) ?? null;

  // โหมด "เลือก/เปลี่ยน": เปิดเมื่อยังไม่มีหัวหน้าทัวร์ หรือกด "เปลี่ยนหัวหน้าทัวร์"
  const [picking, setPicking] = useState(!assignedLeader);

  const showPicker = canAssign && (picking || !assignedLeader);

  return (
    <Card padded={false} className="flex flex-col overflow-hidden">
      {showPicker ? (
        <LeaderPickerBody
          job={job}
          leaders={leaders}
          jobs={jobs}
          countries={countries}
          routes={routes}
          today={today}
          hasAssigned={Boolean(assignedLeader)}
          onCancelChange={() => setPicking(false)}
          onAssigned={() => setPicking(false)}
        />
      ) : (
        <AssignedLeaderBody
          job={job}
          leader={assignedLeader!}
          countries={countries}
          today={today}
          canAssign={canAssign}
          onChange={() => setPicking(true)}
        />
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* โหมดเลือกหัวหน้าทัวร์ — Header + รายการเลื่อน + Footer ยืนยัน            */
/* ------------------------------------------------------------------ */

function LeaderPickerBody({
  job,
  leaders,
  jobs,
  countries,
  routes,
  today,
  hasAssigned,
  onCancelChange,
  onAssigned,
}: {
  job: TourJob;
  leaders: TourLeader[];
  jobs: TourJob[];
  countries: ReturnType<typeof useDemo>['countries'];
  routes: ReturnType<typeof useDemo>['routes'];
  today: string;
  hasAssigned: boolean;
  onCancelChange: () => void;
  onAssigned: () => void;
}) {
  const { assignLeader, saving } = useDemo();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmConflict, setConfirmConflict] = useState(false);

  const wanted = useMemo(() => preferredLanguagesForCountry(job.country), [job.country]);

  /* ความพร้อมของเอกสารสำหรับกรุ๊ปนี้ — ตรวจตอนกำลังจะเลือกคน ไม่ใช่ตอนใกล้ออกเดินทาง */
  /**
   * นโยบายตรวจของหน้าจอนี้ — ปิดข้อบังคับบัตรหัวหน้าทัวร์ไว้ก่อน
   * เพราะระบบยังไม่มีข้อมูลบัตรของใครเลย ถ้าเปิดไว้ทุกคนจะขึ้น "ไม่พร้อม" เหมือนกันหมด
   * ซึ่งไม่ได้บอกอะไร และทำให้คนเลิกสนใจคำเตือน — เปิดเมื่อเริ่มบันทึกบัตรเข้าระบบแล้ว
   */
  const checkReadiness = useDocumentReadiness({ tourCardRequired: false });
  const trip = useMemo(() => tripOfJob(job, countries), [job, countries]);

  // ลำดับไกด์ที่ผู้ใช้คนนี้ตั้งไว้เอง (Preferred Guide List) — ใช้เป็นเกณฑ์เรียงหลัก ถ้าตั้งไว้
  const { order: preferredOrder } = usePreferredGuideOrder();
  // ไกด์ที่ผู้ใช้คนนี้ตัดออก — ไม่แนะนำ/ให้เลือกเลย
  const { excluded } = useExcludedGuides();
  // ไกด์ที่ผู้ใช้คนนี้ปักดาวไว้ — ขึ้นก่อนคนอื่นเสมอ
  const { favorited } = useFavoriteGuides();

  // คะแนนความเหมาะสม (reuse ตรรกะที่ทดสอบแล้ว) → ใช้เป็นเกณฑ์เรียงประเทศ/ภาษา
  const ranked = useMemo(
    () => rankLeaders(leaders, job, { countries, routes, allJobs: jobs, today }),
    [leaders, job, countries, routes, jobs, today],
  );

  // §8 คัดกรอง: พร้อมรับงาน + ไม่มีตารางซ้อน + ไม่ถูกตัดออก; เรียงประเทศ→ภาษา→ประสบการณ์ → ลำดับไกด์ของผู้ใช้ (ถ้าตั้งไว้)
  const eligible = useMemo(() => {
    const factor = (m: LeaderMatch, key: string) =>
      m.factors.find((f) => f.key === key)?.earned ?? 0;

    const base = ranked
      .map((match) => {
        const leader = leaders.find((l) => l.id === match.leaderId)!;
        return { match, leader, months: leaderExperienceMonths(leader, today) };
      })
      .filter(({ leader, match }) => leader.status === 'available' && !match.hasConflict && !excluded.has(leader.id))
      .sort((a, b) => {
        const country = factor(b.match, 'เส้นทาง') - factor(a.match, 'เส้นทาง');
        if (country !== 0) return country;
        const language = factor(b.match, 'ภาษา') - factor(a.match, 'ภาษา');
        if (language !== 0) return language;
        return b.months - a.months;
      });
    return sortByPreference(base, favorited, preferredOrder, (row) => row.leader.id);
  }, [ranked, leaders, today, preferredOrder, excluded, favorited]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return eligible;
    return eligible.filter(({ leader }) => leaderSearchText(leader).includes(q));
  }, [eligible, query]);

  const doAssign = async () => {
    if (!selected) return;
    await assignLeader(job.id, selected, 'จัดหัวหน้าทัวร์จากการ์ดหน้ารายละเอียดงาน');
    setConfirmConflict(false);
    onAssigned();
  };

  // §6 ก่อนยืนยัน ตรวจช่วงวันงานทับซ้อนอีกครั้ง (safety belt แม้กรองไว้แล้ว)
  const confirm = () => {
    if (!selected) return;
    const conflicts = findConflictsForLeader(selected, job, jobs);
    if (conflicts.length > 0) {
      setConfirmConflict(true);
      return;
    }
    void doAssign();
  };

  const selectedName = (() => {
    const l = leaders.find((x) => x.id === selected);
    return l ? `${l.firstName} ${l.lastName}` : '';
  })();

  return (
    <>
      {/* 1) Header คงที่ */}
      <div className="shrink-0 zego-divider-bottom p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold zego-text">
            {hasAssigned ? 'เปลี่ยนหัวหน้าทัวร์' : 'เลือกหัวหน้าทัวร์'}
          </h2>
          {hasAssigned && (
            <button
              type="button"
              onClick={onCancelChange}
              className="rounded px-1 text-sm zego-icon-btn"
            >
              ยกเลิก
            </button>
          )}
        </div>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="ค้นหาชื่อ ชื่อเล่น หรือรหัสหัวหน้าทัวร์"
          label="ค้นหาหัวหน้าทัวร์"
        />
        <p className="mt-2 text-xs zego-text-tertiary">
          พร้อมรับงานช่วง {formatDateRange(job.departDate, job.returnDate)} · {visible.length} คน
        </p>
      </div>

      {/* 2) Scrollable Content */}
      <div className={cx('leader-scroll min-h-0 flex-1 overflow-y-auto overflow-x-hidden', LIST_HEIGHT)}>
        {visible.length === 0 ? (
          <div className="p-2">
            <EmptyState
              icon={query.trim() ? 'search' : 'users'}
              title={
                query.trim()
                  ? 'ไม่พบหัวหน้าทัวร์ตามคำค้นหา'
                  : 'ไม่พบหัวหน้าทัวร์ที่พร้อมรับงานในช่วงวันที่นี้'
              }
              description={query.trim() ? 'ลองค้นด้วยชื่อ ชื่อเล่น หรือรหัสอื่น' : undefined}
              action={
                query.trim() ? undefined : (
                  <Link href="/calendar">
                    <Button variant="secondary" size="sm" icon="calendar">
                      ตรวจสอบปฏิทินงาน
                    </Button>
                  </Link>
                )
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {visible.map(({ leader, months }) => (
              <LeaderRow
                key={leader.id}
                leader={leader}
                months={months}
                wanted={wanted}
                countries={countries}
                readiness={checkReadiness(leader.id, trip)}
                selected={selected === leader.id}
                onSelect={() => setSelected((cur) => (cur === leader.id ? null : leader.id))}
              />
            ))}
          </ul>
        )}
      </div>

      {/* 3) Sticky Footer */}
      <div className="shrink-0 zego-divider-top zego-surface-bg p-4 sm:p-5">
        <Button
          variant="primary"
          className="w-full"
          icon="check"
          onClick={confirm}
          loading={saving}
          disabled={!selected}
        >
          {selected ? `ยืนยันหัวหน้าทัวร์ · ${selectedName}` : 'ยืนยันหัวหน้าทัวร์'}
        </Button>
        {!selected && (
          <p className="mt-2 text-center text-xs zego-text-tertiary">เลือกหัวหน้าทัวร์ก่อนจึงจะยืนยันได้</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmConflict}
        onClose={() => setConfirmConflict(false)}
        onConfirm={doAssign}
        loading={saving}
        tone="danger"
        title="พบตารางงานทับซ้อน"
        confirmLabel="ยืนยัน จัดคนนี้"
        message={`${selectedName} มีงานอื่นทับซ้อนกับช่วงวันเดินทางนี้ ต้องการมอบหมายต่อหรือไม่? งานนี้จะถูกทำเครื่องหมายว่ามีตารางซ้อน`}
      />
    </>
  );
}

/** หนึ่งแถวในรายการ — กระชับ กดได้ทั้งแถวหรือปุ่ม "เลือก" */
function LeaderRow({
  leader,
  months,
  wanted,
  countries,
  readiness,
  selected,
  onSelect,
}: {
  leader: TourLeader;
  months: number;
  wanted: string[];
  countries: ReturnType<typeof useDemo>['countries'];
  readiness: LeaderReadiness;
  selected: boolean;
  onSelect: () => void;
}) {
  const matchedLang = bestLanguageAmong(leader, wanted) ?? orderedLanguages(leader)[0];
  const top = expertCountries(leader, countries)[0];
  const topCountry = top
    ? countries.find((c) => c.code === top.code)?.nameTh ?? top.label
    : undefined;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cx(
          'flex w-full cursor-pointer items-start gap-3 p-3 text-left transition-colors',
          selected ? 'border zego-selected-border zego-selected-tint' : 'zego-hover-surface',
        )}
      >
        <Avatar
          initials={leader.avatarInitials}
          color={leader.avatarColor}
          src={leader.photoUrl}
          alt={`รูปของ ${leader.firstName} ${leader.lastName}`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium zego-text">
              {leader.firstName} {leader.lastName}
            </span>
            <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />
            <DocumentReadinessBadge readiness={readiness} />
          </div>

          <p className="text-xs zego-text-tertiary">
            {leader.nickname ? `${leader.nickname} · ` : ''}
            {leader.id}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {matchedLang && (
              <LanguageChip language={matchedLang.languageName} skill={matchedLang} />
            )}
            {topCountry && (
              <span className="inline-flex max-w-full items-center text-xs zego-text-tertiary">
                <span className="truncate">เชี่ยวชาญ{topCountry}</span>
              </span>
            )}
          </div>

          <p className="mt-1 text-xs zego-text-tertiary">
            ประสบการณ์ {months > 0 ? formatDuration(months) : 'ยังไม่มีข้อมูล'}
          </p>
        </div>

        <span
          className={cx(
            'shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
            selected
              ? 'zego-selected-fill'
              : 'border zego-surface-soft-bg zego-text-secondary zego-border-color',
          )}
        >
          {selected ? (
            <span className="inline-flex items-center gap-1">
              <Icon name="check" className="h-3.5 w-3.5" />
              เลือกแล้ว
            </span>
          ) : (
            'เลือก'
          )}
        </span>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* โหมดมอบหมายแล้ว — ข้อมูลหัวหน้าทัวร์ + ปุ่มจัดการ                        */
/* ------------------------------------------------------------------ */

function AssignedLeaderBody({
  job,
  leader,
  countries,
  today,
  canAssign,
  onChange,
}: {
  job: TourJob;
  leader: TourLeader;
  countries: ReturnType<typeof useDemo>['countries'];
  today: string;
  canAssign: boolean;
  onChange: () => void;
}) {
  const { assignLeader, saving } = useDemo();
  const [confirmUnassign, setConfirmUnassign] = useState(false);

  const months = leaderExperienceMonths(leader, today);
  const lang = orderedLanguages(leader)[0];
  const top = expertCountries(leader, countries)[0];
  const topCountry = top
    ? countries.find((c) => c.code === top.code)?.nameTh ?? top.label
    : undefined;

  return (
    <>
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold zego-text">หัวหน้าทัวร์</h2>
          <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />
        </div>

        <div className="flex items-start gap-3">
          <Avatar
            initials={leader.avatarInitials}
            color={leader.avatarColor}
            src={leader.photoUrl}
            alt={`รูปของ ${leader.firstName} ${leader.lastName}`}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold zego-text">
              {leader.firstName} {leader.lastName}
            </p>
            <p className="text-xs zego-text-tertiary">
              {leader.nickname ? `${leader.nickname} · ` : ''}
              {leader.id}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {lang && <LanguageChip language={lang.languageName} skill={lang} />}
              {topCountry && (
                <span className="text-xs zego-text-tertiary">เชี่ยวชาญ{topCountry}</span>
              )}
            </div>
            <p className="mt-1 text-xs zego-text-tertiary">
              ประสบการณ์ {months > 0 ? formatDuration(months) : 'ยังไม่มีข้อมูล'}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/leaders/${leader.id}`} className="flex-1">
            <Button variant="secondary" size="sm" icon="eye" className="w-full">
              ดูรายละเอียด
            </Button>
          </Link>
          {canAssign && (
            <>
              <Button variant="secondary" size="sm" icon="users" onClick={onChange}>
                เปลี่ยนหัวหน้าทัวร์
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="x"
                onClick={() => setConfirmUnassign(true)}
                disabled={saving}
              >
                ยกเลิกการมอบหมาย
              </Button>
            </>
          )}
        </div>

        {job.assistantLeaderIds.length > 0 && (
          <AssistantList job={job} />
        )}
      </div>

      <ConfirmDialog
        open={confirmUnassign}
        onClose={() => setConfirmUnassign(false)}
        onConfirm={async () => {
          await assignLeader(job.id, null, 'ยกเลิกการมอบหมายหัวหน้าทัวร์');
          setConfirmUnassign(false);
        }}
        loading={saving}
        tone="danger"
        title="ยกเลิกการมอบหมาย"
        confirmLabel="ยืนยัน ยกเลิกการมอบหมาย"
        message={`ถอด ${leader.firstName} ${leader.lastName} ออกจากงาน ${job.id} หรือไม่? งานจะกลับสู่สถานะยังไม่มีหัวหน้าทัวร์`}
      />
    </>
  );
}

function AssistantList({ job }: { job: TourJob }) {
  const { leaders } = useDemo();
  return (
    <>
      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide zego-text-tertiary">
        เจ้าหน้าที่ส่งกรุ๊ป
      </h3>
      <ul className="space-y-2">
        {job.assistantLeaderIds.map((id) => {
          const assistant = leaders.find((l) => l.id === id);
          if (!assistant) return null;
          return (
            <li key={id}>
              <Link
                href={`/leaders/${id}`}
                className="flex items-center gap-2 text-sm zego-text-secondary hover:underline"
              >
                <Avatar
                  initials={assistant.avatarInitials}
                  color={assistant.avatarColor}
                  size="sm"
                />
                {assistant.firstName} {assistant.lastName}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
