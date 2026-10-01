'use client';

/**
 * แท็บ "ภาพรวม" — Dashboard สรุปข้อมูลหัวหน้าทัวร์ (§4–§9)
 *
 * ⚠️ หน้าสรุปเท่านั้น — ดึงจากข้อมูลต้นทางจริงทั้งหมด ไม่มี state/ข้อมูลซ้ำ (§2/§12)
 *   ไม่มี Profile Header ในแท็บนี้ (§2) — ชื่อ/รหัส/ประเภท/สถานะ/ติดต่อ/คะแนนย่อ อยู่ที่ Profile Header ด้านบนของหน้าเท่านั้น
 *   Passport → Passport Book · โซน/ประเทศ/เส้นทาง+ภาษา/ทักษะ → ความเชี่ยวชาญ
 *   สถานะ/วันลา → Availability · งาน → Schedule (Assignment×Period) · คะแนน → แบบสอบถาม
 *
 * ลำดับ Card (§4/§11): ความเชี่ยวชาญ | ภาษาและทักษะ · งานที่กำลังจะถึง | สถานะและการลา · คะแนนและผลงาน | เอกสารสำคัญ
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { Button, Card, CardHeader, Callout, EmptyState, Pill, StatusBadge } from '@/components/ui/Primitives';
import { LEADER_STATUS, TOUR_SKILL_LEVEL } from '@/lib/labels';
import { addDays, diffDays, formatDate, formatDateRange } from '@/lib/format';
import { getExpertiseScopes } from '@/services/expertiseScopeStore';
import { getGroupExpertise } from '@/services/groupExpertiseStore';
import { groupExpertiseName, isAllGroups } from '@/lib/logic/groupExpertise';
import { zoneById } from '@/data/leaders/zoneMaster';
import { getTourLeaderById, getIdentityDocument } from '@/services/tourLeaderMaster';
import { getPassportBooks } from '@/services/passportBookStore';
import { isMasterPassportHidden } from '@/services/masterPassportHidden';
import { buildPassportCards, masterIdentityToCard } from '@/lib/logic/passportCardModel';
import { can } from '@/lib/permissions';
import { passportStatus, PASSPORT_STATUS_META, passportRemainingText } from '@/lib/logic/tourLeaderMaster';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { BOARD_STATUS, boardStatusFromAssignment } from '@/lib/logic/guideBoard';
import { buildGroupScoreRows } from '@/lib/logic/tourGroupScoreRows';
import { formatScore } from '@/lib/logic/groupScore';
import { groupResponsesByPeriod, getTravelerCountMap } from '@/services/groupScoreStore';
import { recordTypeLabel, formatRecordSchedule } from '@/lib/logic/availabilityStatus';
import type { ExpertiseScope } from '@/lib/logic/expertiseScope';
import type { TourLeader } from '@/types';

/** ปุ่มไปยังแท็บต้นทาง (§2) */
function GoTo({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button size="sm" variant="secondary" icon="chevronRight" onClick={onClick}>{label}</Button>;
}

export function LeaderOverviewTab({
  leader,
  onGoTab,
}: {
  leader: TourLeader;
  /** เปิดแท็บต้นทาง (§2) */
  onGoTab: (tab: string) => void;
}) {
  const router = useRouter();
  const { leaders, countries, availabilityRecords, today, currentUser } = useDemo();
  const [showAllScopes, setShowAllScopes] = useState(false);

  /* ---------------- ความเชี่ยวชาญ (§4) — จาก Expertise Scope ---------------- */
  const scopes = useMemo(() => getExpertiseScopes(leader.id), [leader.id]);
  const groupCodes = useMemo(() => getGroupExpertise(leader.id), [leader.id]);
  const countryName = (id: string | null) => (id ? (countries.find((c) => c.id === id)?.nameEn ?? id) : '');

  /* ---------------- งานจาก Schedule (§6) ---------------- */
  const work = useMemo(() => {
    const periods = getTourPeriods();
    const periodById = new Map(periods.map((p) => [p.internalId, p]));
    const mine = loadActiveGuideAssignments()
      .filter((a) => a.tourLeaderId === leader.id)
      .map((a) => periodById.get(a.periodId))
      .filter((p): p is NonNullable<typeof p> => !!p);

    const year = today.slice(0, 4);
    const month = today.slice(0, 7);
    const current = mine.filter((p) => p.startDate <= today && p.endDate >= today);
    const upcoming = mine.filter((p) => p.startDate > today);
    const thisMonth = mine.filter((p) => p.startDate.slice(0, 7) === month || p.endDate.slice(0, 7) === month);
    const thisYear = mine.filter((p) => p.startDate.slice(0, 4) === year);

    // วันลา/ช่วงไม่พร้อมที่กำลังจะมาถึง (อนุมัติแล้ว)
    const leaves = availabilityRecords
      .filter((r) => r.leaderId === leader.id && r.approval === 'approved' && r.endDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    // วันพร้อมรับงานถัดไป = วันแรกที่ไม่ติดงานและไม่ติดวันลา (มองไปข้างหน้า 365 วัน)
    let nextFree: string | null = null;
    for (let i = 0; i < 365; i += 1) {
      const d = addDays(today, i);
      const busy = mine.some((p) => p.startDate <= d && p.endDate >= d)
        || leaves.some((r) => r.startDate <= d && r.endDate >= d);
      if (!busy) { nextFree = d; break; }
    }
    return { current, upcoming, thisMonth, thisYear, leaves, nextFree };
  }, [leader.id, today, availabilityRecords]);

  /* ---------------- ตารางงานที่กำลังจะถึง (§7) — งานปัจจุบัน + อนาคต พร้อมสถานะการจัด ---------------- */
  const upcomingJobs = useMemo(() => {
    const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
    return loadActiveGuideAssignments()
      .filter((a) => a.tourLeaderId === leader.id)
      .map((a) => {
        const p = periodById.get(a.periodId);
        if (!p) return null;
        return { id: a.assignmentId, period: p, board: boardStatusFromAssignment(a.assignmentStatus) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x) => x.period.endDate >= today) // ยังไม่จบ (กำลังเดินทาง/กำลังจะถึง)
      .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate))
      .slice(0, 5);
  }, [leader.id, today]);

  /* ---------------- คะแนน (§7) — จากแบบสอบถาม × ประวัติงานจริง ---------------- */
  const scores = useMemo(() => {
    const rows = buildGroupScoreRows({
      periods: getTourPeriods(),
      assignments: loadActiveGuideAssignments().map((a) => ({ periodId: a.periodId, tourLeaderId: a.tourLeaderId })),
      leaderNameById: new Map(leaders.map((l) => [l.id, `${l.firstName} ${l.lastName}`])),
      responsesByPeriod: groupResponsesByPeriod(),
      travelerCountByPeriod: getTravelerCountMap(),
      tourLeaderId: leader.id,
      travelledOnAsOf: today,
    });
    const scored = rows.filter((r) => r.overall !== null);
    const avg = (list: typeof scored) => (list.length ? list.reduce((s, r) => s + (r.overall ?? 0), 0) / list.length : null);

    const byKey = (key: 'countryName' | 'routeCode') => {
      const m = new Map<string, number[]>();
      for (const r of scored) {
        const k = (r[key] ?? '').trim();
        if (!k) continue;
        if (!m.has(k)) m.set(k, []);
        m.get(k)!.push(r.overall!);
      }
      return [...m.entries()]
        .map(([k, v]) => ({ key: k, avg: v.reduce((a, b) => a + b, 0) / v.length, count: v.length }))
        .sort((a, b) => b.avg - a.avg);
    };

    // ประเทศที่เดินทางบ่อยที่สุด (นับจากทุกกรุ๊ปที่เดินทางแล้ว ไม่เฉพาะที่มีคะแนน)
    const freq = new Map<string, number>();
    for (const r of rows) { const c = (r.countryName ?? '').trim(); if (c) freq.set(c, (freq.get(c) ?? 0) + 1); }
    const topCountry = [...freq.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    return {
      groups: rows.length,
      /* จำนวน "ฉบับ" ที่ตอบกลับมาจริง — เดิมนับจำนวนกรุ๊ปที่มีคะแนน จึงต่ำกว่าความจริงเสมอ */
      responses: rows.reduce((sum, r) => sum + r.respondents, 0),
      scoredGroups: scored.length,
      overall: avg(scored),
      byCountry: byKey('countryName').slice(0, 5),
      byRoute: byKey('routeCode').slice(0, 5),
      topCountry,
    };
  }, [leader.id, leaders, today]);

  /* ---------------- Passport / เอกสาร (§8) ---------------- */
  /* เอกสารประจำตัวเป็นข้อมูลอ่อนไหว — ตรวจสิทธิ์ก่อนรวมเอกสารจาก documentStore */
  const canViewIdentity = can(currentUser.role, 'passport.view');
  const documents = useLeaderDocumentsView(leader, canViewIdentity);
  /*
    วันหมดอายุต้องมาจากเล่มหลักชุดเดียวกับแท็บ "เอกสารประจำตัว"
    เดิมอ่าน getPassportExpiry ซึ่งมาจากไฟล์นำเข้าอย่างเดียว — เพิ่ม/ต่ออายุเล่มในระบบแล้ว
    หน้านี้ยังค้างวันเดิม (ค่าจากไฟล์นำเข้าถูกรวมอยู่ใน buildPassportCards อยู่แล้ว)
  */
  const passExpiry = useMemo(() => {
    const books = canViewIdentity ? getPassportBooks(leader.id) : [];
    const master = canViewIdentity && !isMasterPassportHidden(leader.id)
      ? masterIdentityToCard(getTourLeaderById(leader.id), getIdentityDocument(leader.id, canViewIdentity), today)
      : null;
    const cards = buildPassportCards(books, master, today);
    const primary = cards.find((c) => c.isPrimary) ?? cards[0] ?? null;
    return primary?.fields.expiryDate || null;
  }, [leader.id, today, canViewIdentity]);
  const passSt = passportStatus(passExpiry, today);
  const passDaysLeft = passExpiry ? diffDays(today, passExpiry) : null;
  const docsExpiring = documents.filter((d) => {
    if (!d.expiresAt) return false;
    const left = diffDays(today, d.expiresAt);
    return left >= 0 && left <= 120;
  });
  const docsExpired = documents.filter((d) => d.expiresAt && diffDays(today, d.expiresAt) < 0);

  /*
    หมวด customer_group แสดงเป็น "ประเภทกรุ๊ปที่ถนัด" ในการ์ดซ้ายอยู่แล้ว
    การ์ดนี้จึงต้องเหลือเฉพาะ work_skill ให้ตรงกับแท็บ "ความเชี่ยวชาญและทักษะ"
    (เดิมนับ/แสดงทั้ง tourSkills จึงซ้ำกันเองในแท็บเดียว และจำนวนไม่ตรงกับแท็บต้นทาง)
  */
  const workSkills = leader.tourSkills.filter((s) => s.category === 'work_skill');

  const scopeLines = showAllScopes ? scopes : scopes.slice(0, 4);
  const hiddenScopes = scopes.length - scopeLines.length;

  /** 1 บรรทัดของความเชี่ยวชาญ: โซน / ประเทศ (เส้นทาง) + Tag หลัก (§4) */
  const ScopeLine = ({ s }: { s: ExpertiseScope }) => {
    const zone = s.zoneId ? zoneById(s.zoneId) : null;
    const cName = s.countryScope === 'all_zone_countries' ? 'ทุกประเทศ' : countryName(s.countryId);
    const routes = s.routeScope === 'all_routes' ? [] : s.routeCodes;
    return (
      <li className="rounded-lg border zego-border-color px-3 py-2">
        {zone && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs zego-text-tertiary">
            {zone.nameEn}
            {s.isPrimaryZone && <Pill tone="blue">โซนหลัก</Pill>}
          </p>
        )}
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium zego-text">
          {cName}
          {s.isPrimaryCountry && <Pill tone="green">ประเทศหลัก</Pill>}
          <span className="text-xs font-normal zego-text-tertiary">
            ({s.routeScope === 'all_routes' ? 'ทุกเส้นทาง' : routes.join(', ')})
          </span>
        </p>
        {s.primaryRouteCodes.length > 0 && (
          <p className="mt-0.5 flex flex-wrap items-center gap-1">
            {s.primaryRouteCodes.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold zego-badge--warning">
                {c} <span className="font-sans font-normal">เส้นทางหลัก</span>
              </span>
            ))}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {/* ============ แถว 1: ความเชี่ยวชาญ (§5) + ภาษาและทักษะ (§6) ============ */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="ประเทศและเส้นทางที่เชี่ยวชาญ"
            description={scopes.length > 0 ? `${scopes.length} รายการ · โซน → ประเทศ → เส้นทาง` : undefined}
            action={<GoTo label="จัดการความเชี่ยวชาญ" onClick={() => onGoTab('skills')} />}
          />
          {/* §5 ประเภทกรุ๊ปที่ถนัด — ย้ายมาจาก Profile Header เดิม (เป็นข้อมูลด้านความเชี่ยวชาญ) */}
          {groupCodes.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium zego-text-tertiary">ประเภทกรุ๊ปที่ถนัด:</span>
              {isAllGroups(groupCodes)
                ? <Pill tone="green">ทุกประเภท</Pill>
                : groupCodes.map((c) => <Pill key={c} tone="blue">{groupExpertiseName(c)}</Pill>)}
            </div>
          )}
          {scopes.length === 0 ? (
            <EmptyState icon="plane" title="ยังไม่ระบุโซน ประเทศ หรือเส้นทาง" description="เพิ่มได้ที่แท็บความเชี่ยวชาญและทักษะ" />
          ) : (
            <>
              <ul className="space-y-2">{scopeLines.map((s) => <ScopeLine key={s.id} s={s} />)}</ul>
              {hiddenScopes > 0 && (
                <button type="button" onClick={() => setShowAllScopes(true)} className="mt-2 text-xs font-medium zego-text-info hover:underline">
                  อีก {hiddenScopes} รายการ
                </button>
              )}
            </>
          )}
        </Card>

        <Card>
          <CardHeader
            title="ภาษาและทักษะ"
            description={`${leader.languages.length} ภาษา · ${workSkills.length} ทักษะ`}
            action={<GoTo label="จัดการทักษะ" onClick={() => onGoTab('skills')} />}
          />
          {leader.languages.length === 0 && workSkills.length === 0 ? (
            <EmptyState
              title="ยังไม่ระบุภาษาและทักษะ"
              description="เพิ่มได้ที่แท็บความเชี่ยวชาญและทักษะ"
              action={<Button size="sm" variant="primary" onClick={() => onGoTab('skills')}>จัดการทักษะ</Button>}
            />
          ) : (
            <div className="space-y-3">
              {leader.languages.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium zego-text-tertiary">ภาษา</p>
                  <div className="flex flex-wrap gap-1.5">
                    {leader.languages.map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1 rounded-full zego-surface-soft-bg px-2 py-0.5 text-xs zego-text-secondary">
                        {l.languageName}
                        <span className="text-[10px] zego-text-tertiary">
                          {l.isNativeLanguage ? 'ภาษาแม่' : `${l.levelCode} · ${l.levelName}`}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {workSkills.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium zego-text-tertiary">ทักษะและความถนัด</p>
                  <div className="flex flex-wrap gap-1.5">
                    {workSkills.map((s) => (
                      <span key={s.id} className="inline-flex items-center gap-1 rounded-full zego-surface-soft-bg px-2 py-0.5 text-xs zego-text-secondary">
                        {s.name}<span className="text-[10px] zego-text-tertiary">{TOUR_SKILL_LEVEL[s.level].label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* ============ แถว 2: ตารางงานที่กำลังจะถึง (§7) + สถานะและการลาล่าสุด ============ */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- ตารางงานที่กำลังจะถึง ---- */}
        <Card>
          <CardHeader
            title="ตารางงานที่กำลังจะถึง"
            description={`งานปัจจุบัน ${work.current.length} · ล่วงหน้า ${work.upcoming.length} กรุ๊ป`}
            action={<GoTo label="ตารางงาน" onClick={() => onGoTab('schedule')} />}
          />
          {upcomingJobs.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="ยังไม่มีงานที่กำลังจะถึง"
              description="เมื่อจัดงานให้หัวหน้าทัวร์รายนี้ในหน้าการจัดสเก็ต จะแสดงที่นี่"
              action={<Button size="sm" variant="secondary" icon="calendar" onClick={() => router.push(`/jobs?leader=${leader.id}`)}>ไปหน้าการจัดสเก็ต</Button>}
            />
          ) : (
            <ul className="space-y-2">
              {upcomingJobs.map(({ id, period, board }) => (
                <li key={id} className="rounded-lg border zego-border-color px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-sm font-semibold zego-text">{period.groupCode}</span>
                      {period.startDate <= today && period.endDate >= today && <Pill tone="green">กำลังเดินทาง</Pill>}
                    </span>
                    {board ? <StatusBadge meta={BOARD_STATUS[board]} size="sm" /> : <span className="zego-text-disabled">—</span>}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs zego-text-tertiary">
                    <span className="zego-text-secondary">{period.countryName || '—'}</span>
                    {period.route && <span className="font-mono">· {period.route}</span>}
                  </p>
                  <p className="text-xs zego-text-tertiary">{formatDateRange(period.startDate, period.endDate)}</p>
                  {period.displayName && <p className="truncate text-xs zego-text-tertiary">{period.displayName}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ---- สถานะและการลาล่าสุด ---- */}
        <Card>
          <CardHeader
            title="ความพร้อมและการลาล่าสุด"
            description="ความพร้อมรับงานและวันลา คำนวณจากตารางงานและวันลาจริง"
            action={<GoTo label="จัดการความพร้อมและการลา" onClick={() => onGoTab('status')} />}
          />
          <dl className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="zego-text-tertiary">ความพร้อมรับงาน</dt>
              <dd><StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" /></dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="zego-text-tertiary">พร้อมรับงานครั้งถัดไป</dt>
              <dd className="font-medium zego-text">{work.nextFree ? formatDate(work.nextFree) : 'ไม่พบวันว่างใน 1 ปี'}</dd>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="zego-text-tertiary">งานเดือนนี้ / ปีนี้</dt>
              <dd className="font-medium zego-text">{work.thisMonth.length} / {work.thisYear.length} กรุ๊ป</dd>
            </div>
            <div className="zego-divider-top pt-2">
              <dt className="zego-text-tertiary">วันลา / ช่วงไม่พร้อมที่กำลังจะมาถึง</dt>
              <dd className="mt-1">
                {work.leaves.length === 0 ? (
                  <span className="text-sm zego-text-disabled">ไม่มี</span>
                ) : (
                  <ul className="space-y-1">
                    {work.leaves.slice(0, 3).map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2 text-xs zego-text-secondary">
                        <Pill tone="amber">{recordTypeLabel(r)}</Pill>{formatRecordSchedule(r)}
                      </li>
                    ))}
                    {work.leaves.length > 3 && <li className="text-xs zego-text-tertiary">อีก {work.leaves.length - 3} รายการ</li>}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* ============ แถว 3: คะแนนและประวัติผลงาน (§8) + เอกสารสำคัญ (§9) ============ */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="คะแนนและประวัติผลงาน"
            description="จากแบบสอบถามของกรุ๊ปที่เดินทางจริงแล้ว"
            action={<GoTo label="ประวัติผลงาน" onClick={() => onGoTab('tourJobs')} />}
          />
          {scores.groups === 0 ? (
            <EmptyState title="ยังไม่มีข้อมูลคะแนน" description="เมื่อมีกรุ๊ปที่เดินทางแล้วและมีแบบสอบถาม จะสรุปที่นี่" />
          ) : (
            <div className="space-y-3">
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
                  <dt className="text-[11px] zego-text-tertiary">คะแนนเฉลี่ย</dt>
                  <dd className="text-base font-semibold zego-text">{scores.overall === null ? 'ยังไม่มีข้อมูลคะแนน' : formatScore(scores.overall)}</dd>
                </div>
                <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
                  <dt className="text-[11px] zego-text-tertiary">แบบสอบถามที่ตอบกลับ</dt>
                  <dd className="text-base font-semibold zego-text">{scores.responses} ฉบับ</dd>
                </div>
                <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
                  <dt className="text-[11px] zego-text-tertiary">กรุ๊ปที่เคยทำ</dt>
                  <dd className="text-base font-semibold zego-text">{scores.groups} กรุ๊ป</dd>
                  {scores.scoredGroups < scores.groups && (
                    <dd className="text-[11px] zego-text-tertiary">มีผลประเมิน {scores.scoredGroups} กรุ๊ป</dd>
                  )}
                </div>
              </dl>
              {scores.topCountry && (
                <p className="text-xs zego-text-tertiary">ประเทศที่เดินทางบ่อยที่สุด: <strong className="zego-text-secondary">{scores.topCountry[0]}</strong> ({scores.topCountry[1]} กรุ๊ป)</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-medium zego-text-tertiary">คะแนนตามประเทศ</p>
                  {scores.byCountry.length === 0 ? <p className="text-xs zego-text-disabled">ยังไม่มีข้อมูลคะแนน</p> : (
                    <ul className="space-y-0.5 text-xs zego-text-secondary">
                      {scores.byCountry.map((r) => (
                        <li key={r.key} className="flex justify-between gap-2"><span className="truncate">{r.key}</span><span className="font-semibold tabular-nums">{formatScore(r.avg)}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium zego-text-tertiary">คะแนนตามเส้นทาง</p>
                  {scores.byRoute.length === 0 ? <p className="text-xs zego-text-disabled">ยังไม่มีข้อมูลคะแนน</p> : (
                    <ul className="space-y-0.5 text-xs zego-text-secondary">
                      {scores.byRoute.map((r) => (
                        <li key={r.key} className="flex justify-between gap-2"><span className="truncate font-mono">{r.key}</span><span className="font-semibold tabular-nums">{formatScore(r.avg)}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ---- เอกสารสำคัญและวันหมดอายุ (§9) ---- */}
        <Card>
          <CardHeader
            title="เอกสารสำคัญและวันหมดอายุ"
            description="แสดงเฉพาะสถานะ — ไม่แสดงเลข Passport เต็มในหน้าภาพรวม"
            action={<GoTo label="ดูเอกสารและ Passport" onClick={() => onGoTab('idDocs')} />}
          />
          {(passSt === 'EXPIRED' || passSt.startsWith('EXPIRING')) && (
            <div className="mb-3">
              <Callout tone={passSt === 'EXPIRED' ? 'red' : 'amber'} title={`หนังสือเดินทาง: ${PASSPORT_STATUS_META[passSt].label}`}>
                {passportRemainingText(passExpiry, today)}
              </Callout>
            </div>
          )}
          <dl className="space-y-1.5 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="zego-text-tertiary">สถานะ Passport</dt>
              <dd><StatusBadge meta={PASSPORT_STATUS_META[passSt]} size="sm" /></dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="zego-text-tertiary">วันหมดอายุ</dt>
              <dd className="font-medium zego-text">{passExpiry ? formatDate(passExpiry) : '—'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="zego-text-tertiary">เหลืออีก</dt>
              <dd className="font-medium zego-text">{passDaysLeft === null ? '—' : passDaysLeft < 0 ? 'หมดอายุแล้ว' : `${passDaysLeft} วัน`}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="zego-text-tertiary">เอกสารทั้งหมด</dt>
              <dd className="font-medium zego-text">{documents.length} รายการ</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="zego-text-tertiary">ใกล้หมดอายุ / หมดอายุแล้ว</dt>
              <dd className="flex gap-1.5">
                {docsExpiring.length > 0 && <Pill tone="amber">ใกล้หมดอายุ {docsExpiring.length}</Pill>}
                {docsExpired.length > 0 && <Pill tone="red">หมดอายุ {docsExpired.length}</Pill>}
                {docsExpiring.length === 0 && docsExpired.length === 0 && <span className="text-sm zego-text-disabled">ไม่มี</span>}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
