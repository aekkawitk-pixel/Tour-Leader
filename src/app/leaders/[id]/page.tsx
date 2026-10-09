'use client';

/**
 * หน้ารายละเอียดหัวหน้าทัวร์ — แท็บหลัก 6 แท็บ
 *   1. ภาพรวม              อ่านอย่างเดียว · สรุปจากทุกแท็บ + ปุ่มลัด
 *   2. ข้อมูลส่วนตัว        ข้อมูลทั่วไป · ติดต่อ · การร่วมงาน · ประวัติการทำงาน (สถานประกอบการ)
 *   3. ความเชี่ยวชาญและทักษะ โซน/ประเทศ/เส้นทาง · ภาษา · ประเภทกรุ๊ป · ทักษะและความถนัด
 *   4. เอกสารส่วนตัว        Passport (หลายเล่ม) · เอกสารประจำตัว · การตรวจสอบ · เอกสารแนบ
 *   5. ตารางงาน            งานทัวร์ที่ได้รับมอบหมาย + ประวัติผลงานและคะแนนรายกรุ๊ป
 *   6. สถานะ / การลา        ความพร้อมรับงาน + รายการลา
 *
 * ⚠️ แยกให้ชัด ห้ามปนกัน
 *    "ประวัติการทำงาน" (แท็บ 2) = บริษัท/สถานประกอบการที่เคยทำงาน (EmploymentHistory)
 *    "ตารางงาน"        (แท็บ 5) = กรุ๊ปทัวร์ที่ได้รับมอบหมายในระบบ
 * ⚠️ Passport อยู่แท็บ 4 ที่เดียว · "ประวัติการแก้ไข" ไม่เป็นแท็บแล้ว — เปิดจากเมนู "..." มุมขวาบน
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import {
  IDENTITY_DOC_KINDS,
  LeaderDocumentsCard,
  OTHER_DOC_KINDS,
} from '@/components/leaders/documents/LeaderDocumentsCard';
import {
  AUDIT_CATEGORY,
  GUIDE_COMPENSATION_STATUS,
  LEADER_STATUS,
  LEADER_USAGE_STATUS,
  LEADER_TYPE,
  SETTLEMENT_STATUS,
} from '@/lib/labels';
import {
  diffDays,
  formatTHB,
  formatDate,
  formatDateRange,
  formatDateTime,
} from '@/lib/format';
import { summarizeSettlement } from '@/lib/logic/settlement';
import {
  primaryContact,
} from '@/lib/logic/leaderProfile';
import {
  entryDurationLabel,
  formatEmploymentPeriod,
  sortByDisplayOrder,
  summarizeExperience,
} from '@/modules/tour-leaders/experience';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  Callout,
  CopyButton,
  cx,
  EmptyState,
  Pill,
  StatusBadge,
} from '@/components/ui/Primitives';
import { StatCard } from '@/components/ui/Charts';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { TabPanel, Tabs } from '@/components/ui/Tabs';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Icon } from '@/components/ui/Icon';
import { LanguageSkillsPanel } from '@/components/leaders/LanguageSkillsPanel';
import { LeaderSectionEditModal, type LeaderSectionKey } from '@/components/leaders/LeaderSectionEditModal';
import { LeaderStatusModal } from '@/components/leaders/LeaderStatusModal';
import { LeaderStatusTab } from '@/components/leaders/LeaderStatusTab';
import { LeaderLeaveTab } from '@/components/leaders/LeaderLeaveTab';
import { LeaderAccountTab } from '@/components/leaders/LeaderAccountTab';
import { LeaderOverviewTab } from '@/components/leaders/LeaderOverviewTab';
import { LeaderIdentityTab } from '@/components/leaders/LeaderIdentityTab';
import { LeaderScheduleTab, useLeaderScheduleRows } from '@/components/leaders/LeaderScheduleTab';
import { activeOrUpcomingLeaveCount } from '@/lib/logic/availabilityStatus';
import { cancellationsForLeader, hasPendingReminder } from '@/lib/logic/guideCancellations';
import { monthKeyOf } from '@/services/monthRosterStore';
import { getIdentityDocument } from '@/services/tourLeaderMaster';
import { SkillSectionEditModal, type SkillSectionKey } from '@/components/leaders/SkillSectionEditModal';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { ExpertiseScopeView } from '@/components/leaders/ExpertiseScopeView';
import { RowMenu } from '@/components/leaders/reorderControls';
import { getExpertiseScopes } from '@/services/expertiseScopeStore';
import { getGroupExpertise, saveGroupExpertise } from '@/services/groupExpertiseStore';
import { readLastTab, writeLastTab } from '@/services/leaderTabStore';
import { groupExpertiseName, groupExpertiseCountLabel, isAllGroups } from '@/lib/logic/groupExpertise';
import { TourGroupScoreTable } from '@/components/scores/TourGroupScoreTable';
import { buildGroupScoreRows } from '@/lib/logic/tourGroupScoreRows';
import { formatScore } from '@/lib/logic/groupScore';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { groupResponsesByPeriod, getTravelerCountMap, getScoreScale } from '@/services/groupScoreStore';
import { passportStatus, PASSPORT_STATUS_META, passportRemainingText } from '@/lib/logic/tourLeaderMaster';
import type { DocumentKind, EmploymentHistory, Settlement, SettlementStatus } from '@/types';

/**
 * ชนิดเอกสาร (รูปแบน) ของแต่ละแท็บ — ใช้แยกว่า badge เตือนหมดอายุควรขึ้นแท็บไหน
 * รูปแบนมีชนิดหยาบกว่า record: บัตรหัวหน้าทัวร์ = license · ใบเซอร์ = certificate
 */
const IDENTITY_LEGACY_KINDS: DocumentKind[] = ['passport', 'visa', 'license', 'national_id'];
const OTHER_LEGACY_KINDS: DocumentKind[] = ['certificate', 'health', 'other'];

/**
 * แท็บหลัก (เรียงตามลำดับที่แสดง) — เอกสารแยกเป็น 3 แท็บตามกลุ่มการใช้งาน
 *
 * ⚠️ ชนิด TabKey และรายการแท็บที่รับจาก ?tab= ต้องมาจากรายการนี้ที่เดียว
 *    เดิมแยกเป็นสองที่แล้วลืมอัปเดตพร้อมกัน ทำให้แท็บใหม่เปิดผ่าน URL ไม่ได้ (ตกไป "ภาพรวม")
 */
const TAB_KEYS = [
  'summary', 'identity', 'skills',
  'idDocs', 'otherDocs', 'financeDocs',
  'schedule', 'survey', 'leave', 'account',
] as const;

type TabKey = (typeof TAB_KEYS)[number];

/* ------------------------- การเคลียร์เงินกรุ๊ป (ในแท็บตารางงาน) ------------------------- */

type SettlementFilterKey = 'all' | 'pending' | 'overdue' | 'done';

const SETTLEMENT_FILTERS: { key: SettlementFilterKey; label: string }[] = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รอเคลียร์' },
  { key: 'overdue', label: 'เกินกำหนด' },
  { key: 'done', label: 'เคลียร์แล้ว' },
];

/** สถานะที่ถือว่าเคลียร์เงินกรุ๊ปจบแล้ว — ที่เหลือยังอยู่ระหว่างดำเนินการ */
const SETTLED_STATUSES = new Set<SettlementStatus>(['settled', 'closed']);

/** เกินกำหนด = ยังไม่จบ และเลยวันกำหนดส่งแล้ว (คำนวณจากวันจริง ไม่ใช่สถานะที่บันทึกไว้) */
function isOverdueSettlement(s: Settlement, today: string): boolean {
  return !SETTLED_STATUSES.has(s.status) && diffDays(today, s.dueDate) < 0;
}

function matchesSettlementFilter(s: Settlement, key: SettlementFilterKey, today: string): boolean {
  switch (key) {
    case 'pending': return !SETTLED_STATUSES.has(s.status);
    case 'overdue': return isOverdueSettlement(s, today);
    case 'done': return SETTLED_STATUSES.has(s.status);
    default: return true;
  }
}

const countSettlements = (list: Settlement[], key: SettlementFilterKey, today: string) =>
  list.filter((s) => matchesSettlementFilter(s, key, today)).length;

export default function LeaderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    leaders,
    jobs,
    settlements,
    availabilityRecords,
    guideCancellations,
    countries,
    currentUser,
    today,
    ready,
    loadError,
    reload,
  } = useDemo();

  /*
    แท็บที่เปิดอยู่ — ลำดับความสำคัญ: ?tab= ใน URL → แท็บล่าสุดของหัวหน้าทัวร์คนนี้ → "ภาพรวม"
    URL เป็นแหล่งความจริง (Refresh แล้วอยู่แท็บเดิม · แชร์ลิงก์ได้ · Back/Forward ทำงาน)
  */
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const validTabs: readonly TabKey[] = TAB_KEYS;
  /** แท็บเดิมที่ถูกรวม/เปลี่ยนชื่อ — คง URL เก่าให้ใช้ได้ ไม่ให้ลิงก์ที่เคยส่งไว้พัง */
  const TAB_ALIAS: Record<string, TabKey> = {
    status: 'leave',            // "จัดการความพร้อมและการลา" → "สถานะ / การลา"
    overview: 'identity',
    documents: 'idDocs',        // "เอกสารส่วนตัว" แยกเป็น 3 แท็บ — ลิงก์เดิมมาที่เอกสารประจำตัว
    passport: 'idDocs',         // Passport อยู่ในเอกสารประจำตัว
    finance: 'financeDocs',     // บัญชีธนาคาร → เอกสารการเงิน
    tourJobs: 'survey',         // "คะแนนและประวัติผลงาน" = ผลแบบสอบถามในวันนี้
    employment: 'identity',     // ประวัติการทำงานย้ายมาอยู่ในข้อมูลส่วนตัว
    audit: 'summary',           // ประวัติการแก้ไขไม่เป็นแท็บแล้ว (เปิดจากเมนู "...")
  };
  const isTabKey = (v: string | null): v is TabKey => !!v && (validTabs as string[]).includes(v);
  const resolvedParam = tabParam ? (TAB_ALIAS[tabParam] ?? tabParam) : null;

  const [tab, setTabState] = useState<TabKey>(() => {
    if (isTabKey(resolvedParam)) return resolvedParam;
    const remembered = readLastTab(params.id);
    return isTabKey(remembered) ? remembered : 'summary';
  });

  /** เขียน ?tab= ลง URL (external system) — replace ไม่เพิ่ม history ซ้อนทุกครั้งที่สลับแท็บ */
  const syncTabToUrl = useCallback((next: TabKey) => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tab') === next) return;
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url.toString());
  }, []);

  /** เปลี่ยนแท็บ — state + URL (การจำแท็บทำที่ effect ด้านล่าง ครอบคลุมการเปิดผ่าน URL ด้วย) */
  const setTab = useCallback((next: TabKey) => {
    setTabState(next);
    syncTabToUrl(next);
  }, [syncTabToUrl]);

  /*
    ซิงก์ไปยัง external system เมื่อแท็บเปลี่ยน — URL + แท็บล่าสุดของหัวหน้าทัวร์คนนี้
    ต้องจำที่นี่ (ไม่ใช่ใน setTab) เพราะการเปิดหน้าด้วย ?tab= ตรง ๆ ไม่ผ่าน setTab
    ครอบคลุมกรณีเปิดหน้าโดยไม่มี ?tab= และกรณีใช้ alias เก่า (เช่น ?tab=finance)
  */
  useEffect(() => {
    syncTabToUrl(tab);
    writeLastTab(params.id, tab);
  }, [tab, params.id, syncTabToUrl]);

  // Modal เฉพาะหมวดมีการ์ดเตือนของตัวเองแล้ว — ที่นี่แค่สลับแท็บ
  const requestTab = (next: TabKey) => { if (next !== tab) setTab(next); };
  /**
   * §1 Flow B — หัวหน้าทัวร์ที่มีข้อมูลแล้วแก้ไขจาก Card ที่เกี่ยวข้องเท่านั้น
   * ไม่มี Modal แก้ไขแบบหลายแท็บในหน้านี้อีกต่อไป (§2)
   */
  const [sectionEditKey, setSectionEditKey] = useState<LeaderSectionKey | null>(null);
  // §1 โหมดที่ 2 — แก้ไขเฉพาะ Card ในหมวดความสามารถ (เปิดฟอร์มเฉพาะส่วน ไม่ใช่ Modal เต็ม §7)
  const [sectionEdit, setSectionEdit] = useState<{ section: SkillSectionKey; mode: 'add' | 'edit' } | null>(null);
  const openSection = (section: SkillSectionKey, mode: 'add' | 'edit') => setSectionEdit({ section, mode });
  // §11/§15 ความเชี่ยวชาญ โซน→ประเทศ→เส้นทาง อ่านจาก store · รีเฟรชเมื่อปิด Modal แก้ไข
  const [scopeRev, setScopeRev] = useState(0);
  const closeSection = () => { setSectionEdit(null); setScopeRev((v) => v + 1); };
  const expertiseScopes = useMemo(() => { void scopeRev; return getExpertiseScopes(params.id); }, [params.id, scopeRev]);
  // §2/§8 ประเภทกรุ๊ปที่ถนัด — อ่านจาก store · รีเฟรชด้วย scopeRev เดียวกัน
  const groupCodes = useMemo(() => { void scopeRev; return getGroupExpertise(params.id); }, [params.id, scopeRev]);
  const [confirmClearGroups, setConfirmClearGroups] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  /** ประวัติการแก้ไข — ย้ายออกจากแท็บหลัก เปิดเป็น Drawer จากเมนู "..." */
  const [auditOpen, setAuditOpen] = useState(false);

  const leader = leaders.find((l) => l.id === params.id);

  /**
   * จำนวนงานทัวร์ที่กำลังจะเดินทาง — Badge ของแท็บ "ตารางงาน"
   * ⚠️ ต้องประกาศก่อน early return ทั้งหมด (กฎ Hooks: ลำดับต้องเท่ากันทุกรอบ render)
   * อ่านจาก useLeaderScheduleRows ชุดเดียวกับที่ LeaderScheduleTab ใช้แสดงเนื้อหาในแท็บ —
   * เดิมคำนวณจาก `jobs` (ชุดข้อมูลเก่า) แยกต่างหาก ทำให้ตัวเลขบน Badge กับเนื้อหาในแท็บขัดแย้งกันเอง
   */
  const { upcoming: upcomingJobCount } = useLeaderScheduleRows(leader, today);

  /**
   * แถวตารางคะแนนกรุ๊ปของหัวหน้าทัวร์คนนี้ — เชื่อม Tour Period Master × การมอบหมาย × แบบสอบถาม
   * ใช้ชุดข้อมูลเดียวกับ "รายละเอียดกรุ๊ป" (ไม่เก็บคะแนนซ้ำ)
   */
  const groupScoreData = useMemo(() => {
    const base = {
      periods: getTourPeriods(),
      assignments: loadActiveGuideAssignments().map((a) => ({ periodId: a.periodId, tourLeaderId: a.tourLeaderId })),
      leaderNameById: new Map(leaders.map((l) => [l.id, `${l.firstName} ${l.lastName}`])),
      responsesByPeriod: groupResponsesByPeriod(),
      travelerCountByPeriod: getTravelerCountMap(),
      tourLeaderId: params.id,
    };
    /*
      สร้างแถวตั้งแต่ "มีงาน" (มอบหมายแล้ว) เพื่อให้ Group Code · โปรแกรม · ประเทศ · ช่วงเดินทาง
      ขึ้นรอไว้ก่อน แล้วคะแนนค่อยมาเติมทีหลังจากไฟล์แบบสอบถาม
    */
    const all = buildGroupScoreRows({ ...base, markTravelledAsOf: today });
    return { all, travelledCount: all.filter((r) => r.travelled).length };
  }, [leaders, params.id, today]);
  const groupScoreRows = groupScoreData.all;
  const upcomingCount = groupScoreRows.length - groupScoreData.travelledCount;

  /** สรุปด้านบนคำนวณจากแถวเดียวกับตาราง — ตัวเลขจึงตรงกันเสมอ */
  const groupScoreSummary = useMemo(() => {
    const scored = groupScoreRows.filter((r) => r.overall !== null);
    return {
      // การ์ดสรุปนับเฉพาะกรุ๊ปที่เดินทางแล้ว ตามป้ายที่เขียนไว้ ("จำนวนกรุ๊ปที่เดินทางแล้ว")
      groups: groupScoreRows.filter((r) => r.travelled).length,
      scoredGroups: scored.length,
      countries: new Set(groupScoreRows.map((r) => r.countryName).filter(Boolean)).size,
      averageScore: scored.length > 0
        ? scored.reduce((sum, r) => sum + (r.overall ?? 0), 0) / scored.length
        : null,
    };
  }, [groupScoreRows]);

  /** ประสบการณ์การทำงานกับสถานประกอบการ */
  const experience = useMemo(
    () => summarizeExperience(leader?.employmentHistory ?? [], today),
    [leader, today],
  );
  // แสดงตามลำดับที่ผู้ใช้จัดไว้ (sortOrder) ไม่ใช่เรียงตามวันที่อัตโนมัติ
  const employmentRows = useMemo(
    () => sortByDisplayOrder(leader?.employmentHistory ?? []),
    [leader],
  );

  const leaderSettlements = useMemo(
    () => settlements.filter((s) => s.leaderId === params.id),
    [settlements, params.id],
  );

  /** ตัวกรองรายการเคลียร์เงินกรุ๊ปในแท็บ "ตารางงาน" — ทั้งหมด / รอเคลียร์ / เกินกำหนด / เคลียร์แล้ว */
  const [settlementFilter, setSettlementFilter] = useState<SettlementFilterKey>('all');
  const shownSettlements = useMemo(
    () => leaderSettlements.filter((s) => matchesSettlementFilter(s, settlementFilter, today)),
    [leaderSettlements, settlementFilter, today],
  );

  /* ข้อมูลหนังสือเดินทาง/ส่วนบุคคลจาก Tour Leader Master (แยกเก็บ · ตรวจสิทธิ์ §8) */
  const canViewIdentity = currentUser.role === 'admin' || currentUser.role === 'coordinator';
  /**
   * เอกสารของการ์ด "เอกสาร" — รวมเอกสารที่บันทึกผ่าน documentStore เข้ากับรายการเดิม
   * ⚠️ ต้องเรียกก่อนทุก early-return ด้านล่าง (กฎของ Hook — ลำดับการเรียกต้องคงที่ทุกรอบ)
   */
  const [docRev, setDocRev] = useState(0);
  const documents = useLeaderDocumentsView(leader, canViewIdentity, docRev);

  /*
    แยกสถานะหน้าจอให้ชัด — โหลดไม่สำเร็จ / กำลังโหลด / ไม่พบข้อมูล / แสดงผล
    เดิม `if (!ready) return null` ทำให้ทั้งหน้าว่างเปล่าโดยไม่บอกอะไร และไม่รองรับกรณีโหลดพลาดเลย
  */
  if (loadError) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full zego-icon-well--danger">
            <Icon name="warning" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold zego-text">โหลดข้อมูลไม่สำเร็จ</p>
            <p className="mt-1 text-sm zego-text-tertiary">
              เกิดข้อผิดพลาดระหว่างโหลดข้อมูลหัวหน้าทัวร์ {params.id}
            </p>
          </div>
          <Button variant="primary" onClick={reload}>ลองใหม่</Button>
        </div>
      </Card>
    );
  }

  if (!ready) {
    return (
      <Card>
        <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm zego-text-tertiary">
          <Icon name="clock" className="h-4 w-4 animate-pulse" />
          กำลังโหลดข้อมูลหัวหน้าทัวร์…
        </div>
      </Card>
    );
  }

  if (!leader) {
    return (
      <Card>
        <EmptyState
          icon="search"
          title="ไม่พบหัวหน้าทัวร์รายนี้"
          description={`ไม่มีข้อมูลรหัส ${params.id} ในระบบ`}
          action={
            <Button variant="secondary" onClick={() => router.push('/leaders')}>
              กลับไปหน้ารายการ
            </Button>
          }
        />
      </Card>
    );
  }

  // ประวัติถูกยกเลิกงาน — ข้อมูลกลาง ไม่ผูกกับผู้ใช้คนใดคนหนึ่ง (ทุกคนเห็นตรงกัน)
  const leaderCancellations = cancellationsForLeader(guideCancellations, leader.id);
  const pendingReminder = hasPendingReminder(guideCancellations, leader.id, monthKeyOf(today));

  const canEdit = can(currentUser.role, 'leader.edit');
  /** เงินเดือนเป็นข้อมูลอ่อนไหว — ปิดบังตามสิทธิ์ */
  const canSeeSalary = currentUser.role === 'admin' || currentUser.role === 'accounting';

  const identity = getIdentityDocument(leader.id, canViewIdentity);
  const passSt = passportStatus(identity?.passportExpiryDate ?? null, today);

  const primaryPhone = primaryContact(leader, 'phone');

  /**
   * เอกสารในแท็บ "เอกสารส่วนตัว" — ไม่นับบัตรประชาชน
   * เพราะข้อมูลบัตรประชาชนย้ายไปอยู่ใน Card "ข้อมูลทั่วไป" ของแท็บ "ข้อมูลส่วนตัว" แล้ว
   * (Passport และเอกสารประเภทอื่นยังนับตามปกติ)
   */
  const personalDocs = documents.filter((d) => d.kind !== 'national_id');

  const expiredDocs = personalDocs.filter(
    (d) => d.expiresAt && diffDays(today, d.expiresAt) < 0,
  );
  const soonDocs = personalDocs.filter((d) => {
    if (!d.expiresAt) return false;
    const left = diffDays(today, d.expiresAt);
    return left >= 0 && left <= 120;
  });

  /** จำนวนเอกสารที่ต้องดำเนินการของแต่ละกลุ่ม — ใช้เป็น badge ให้ตรงแท็บที่ต้องไปแก้ */
  const countAlerts = (kinds: readonly DocumentKind[]) =>
    [...expiredDocs, ...soonDocs].filter((d) => kinds.includes(d.kind)).length;

  /**
   * คำเตือนเอกสารหมดอายุ — แสดงเหมือนกันในทุกแท็บเอกสาร
   * เพราะเอกสารที่ต้องดำเนินการอาจอยู่คนละแท็บกับที่ผู้ใช้กำลังเปิดอยู่
   */
  const documentAlert = (expiredDocs.length > 0 || soonDocs.length > 0) ? (
    <Callout
      tone={expiredDocs.length > 0 ? 'red' : 'amber'}
      title={`เอกสารต้องดำเนินการ ${expiredDocs.length + soonDocs.length} รายการ`}
    >
      {expiredDocs.length > 0 && `หมดอายุแล้ว: ${expiredDocs.map((d) => d.name).join(', ')}`}
      {expiredDocs.length > 0 && soonDocs.length > 0 && ' · '}
      {soonDocs.length > 0 && `ใกล้หมดอายุ: ${soonDocs.map((d) => d.name).join(', ')}`}
    </Callout>
  ) : null;

  /**
   * §1 แท็บหลัก 6 แท็บ — "ภาพรวม" เป็นแท็บแรกและค่าเริ่มต้น
   * Badge แสดงเฉพาะค่าที่มีประโยชน์และไม่เป็น 0 (Tabs ซ่อน badge ที่เป็น 0 ให้เอง)
   *   ความเชี่ยวชาญฯ = จำนวนรายการที่บันทึก · เอกสารส่วนตัว = จำนวนที่ใกล้/เลยหมดอายุ
   *   ตารางงาน = งานที่กำลังจะมาถึง · สถานะ / การลา = รายการลาที่กำลังจะถึง
   * "ประวัติการแก้ไข" ไม่เป็นแท็บหลักแล้ว — ย้ายไปเมนู "..." มุมขวาบน
   */
  const tabs: { key: TabKey; label: string; badge?: number }[] = [
    { key: 'summary', label: 'ภาพรวม' },
    { key: 'identity', label: 'ข้อมูลส่วนตัว' },
    {
      key: 'skills',
      label: 'ความเชี่ยวชาญและทักษะ',
      badge: leader.languages.length + expertiseScopes.length + leader.tourSkills.length,
    },
    {
      key: 'idDocs',
      label: 'เอกสารประจำตัว',
      badge: countAlerts(IDENTITY_LEGACY_KINDS),
    },
    {
      key: 'otherDocs',
      label: 'เอกสารอื่น ๆ',
      badge: countAlerts(OTHER_LEGACY_KINDS),
    },
    { key: 'financeDocs', label: 'เอกสารการเงิน' },
    { key: 'schedule', label: 'ตารางงาน', badge: upcomingJobCount },
    { key: 'survey', label: 'ผลแบบสอบถาม' },
    {
      key: 'leave',
      label: 'สถานะ / การลา',
      badge: activeOrUpcomingLeaveCount(availabilityRecords, leader.id, today),
    },
    // บัญชีผู้ใช้ (User name สำหรับ login) — เฉพาะเจ้าหน้าที่ที่แก้ข้อมูลหัวหน้าทัวร์ได้
    ...(can(currentUser.role, 'leader.edit') ? [{ key: 'account' as const, label: 'บัญชีผู้ใช้' }] : []),
  ];

  const salaryText = (entry: EmploymentHistory) => {
    if (entry.salary === undefined) return '—';
    if (!canSeeSalary) return '••••••';
    return entry.currency === 'THB'
      ? formatTHB(entry.salary)
      : `${entry.salary.toLocaleString('th-TH')} ${entry.currency}`;
  };

  const employmentColumns: Column<EmploymentHistory>[] = [
    {
      key: 'employer',
      header: 'ชื่อสถานประกอบการ',
      render: (row) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-medium zego-text">
            <span className="truncate">{row.employerName}</span>
            {row.isCurrentJob && <Pill tone="green">ปัจจุบัน</Pill>}
          </p>
          {row.jobDescription && (
            <p className="truncate text-xs zego-text-tertiary">{row.jobDescription}</p>
          )}
        </div>
      ),
    },
    {
      key: 'phone',
      header: 'เบอร์โทร',
      hideOnMobile: true,
      render: (row) => (
        <span className="whitespace-nowrap text-sm zego-text-secondary">
          {row.employerPhone || '—'}
        </span>
      ),
    },
    {
      key: 'salary',
      header: 'เงินเดือน',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <span className="whitespace-nowrap tabular-nums zego-text-secondary">{salaryText(row)}</span>
      ),
    },
    {
      key: 'period',
      header: 'จาก – ถึง',
      render: (row) => (
        <div className="whitespace-nowrap">
          <p className="text-sm zego-text-secondary">{formatEmploymentPeriod(row)}</p>
          <p className="text-xs zego-text-tertiary">{entryDurationLabel(row, today)}</p>
        </div>
      ),
    },
    {
      key: 'position',
      header: 'หน้าที่ / ตำแหน่ง',
      render: (row) => <span className="text-sm zego-text-secondary">{row.position}</span>,
    },
    {
      key: 'reason',
      header: 'เหตุผลที่ออก',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-xs zego-text-secondary">
          {row.isCurrentJob ? '— (ยังทำงานอยู่)' : row.reasonForLeaving || '—'}
        </span>
      ),
    },
  ];

  return (
    <>
      <button
        type="button"
        // ย้อนกลับด้วยประวัติเบราว์เซอร์จริง (ไม่ push ไป /leaders เปล่า ๆ) — กลับไปหน้ารายการ
        // พร้อมค่าที่ตั้งไว้ก่อนเข้ามา (หน้า/ตัวกรอง/โหมด "ไกด์ของฉัน") แทนที่จะรีเซ็ตทุกครั้ง
        // เข้ามาตรง ๆ โดยไม่มีประวัติในแอป (เช่น เปิดลิงก์ตรง ๆ) — กลับไป /leaders แทนไม่ให้หลุดออกนอกแอป
        onClick={() => {
          if (typeof window !== 'undefined' && window.history.length > 1) router.back();
          else router.push('/leaders');
        }}
        className="mb-3 inline-flex items-center gap-1 text-sm zego-text-tertiary hover:text-[var(--zego-text)]"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        กลับไปรายการหัวหน้าทัวร์
      </button>

      {/* ------------------------------ ส่วนหัว ------------------------------ */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar
            initials={leader.avatarInitials}
            color={leader.avatarColor}
            size="lg"
            src={leader.photoUrl}
            alt={`รูปของ ${leader.firstName} ${leader.lastName}`}
          />

          {/* §1/§10/§11 Profile Header กระชับ 3 บรรทัด — ข้อมูลที่จำเป็นเท่านั้น (ไม่ซ้ำใน Tab Content) */}
          <div className="min-w-0 flex-1">
            {/* บรรทัด 1: ชื่อ-นามสกุล | ประเภทหัวหน้าทัวร์ | สถานะ */}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold zego-text">
                {leader.firstName} {leader.lastName}
              </h1>
              {leader.nickname && <span className="zego-text-tertiary">({leader.nickname})</span>}
              {/* สถานะพร้อมรับงาน · สถานะโปรไฟล์ — แยกกัน ห้ามรวมเป็นป้ายเดียว (รูปแบบการร่วมงานอยู่บรรทัด 2)
                  สถานะโปรไฟล์แสดงเมื่อไม่ใช่ “ใช้งาน” เท่านั้น (ระงับการใช้งาน / สิ้นสุดการร่วมงาน)
                  เดิมใช้ !active ซึ่งเป็นจริงเฉพาะ “สิ้นสุด” จึงไม่เตือนกรณีถูกระงับ */}
              <StatusBadge meta={LEADER_STATUS[leader.status]} />
              {leader.usageStatus !== 'active' && (
                <StatusBadge meta={LEADER_USAGE_STATUS[leader.usageStatus]} />
              )}
            </div>
            {/* บรรทัด 2: รหัสหัวหน้าทัวร์ | รูปแบบการร่วมงาน */}
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm zego-text-tertiary">
              <span className="font-mono">{leader.id}</span>
              <span aria-hidden="true">|</span>
              <span>{LEADER_TYPE[leader.leaderType].label}</span>
            </p>
            {/* บรรทัด 3: เบอร์โทรศัพท์ — คะแนนเฉลี่ยอยู่ในการ์ดคะแนนของแท็บภาพรวม */}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
              {primaryPhone ? (
                <span className="inline-flex items-center gap-1.5 zego-text-secondary">
                  <Icon name="phone" className="h-4 w-4 zego-text-tertiary" />
                  {primaryPhone.value}
                  <CopyButton value={primaryPhone.value} />
                </span>
              ) : (
                <span className="zego-text-disabled">ยังไม่มีเบอร์โทรศัพท์</span>
              )}
            </div>
          </div>

          {/* §1 ปุ่มเปลี่ยนสถานะอยู่ขวา — ปุ่ม "ดูข้อมูลส่วนตัว" ถูกนำออก (ซ้ำกับแท็บ "ข้อมูลส่วนตัว")
              จอเล็กปุ่มลงแถวของตัวเอง — ไม่งั้นแย่งที่จนชื่อ/เบอร์โทรตัดบรรทัดทีละท่อน */}
          <div className="flex shrink-0 flex-wrap gap-2 max-sm:w-full max-sm:justify-end">
            {can(currentUser.role, 'leader.changeStatus') && (
              <Button variant="primary" onClick={() => setStatusOpen(true)}>
                เปลี่ยนสถานะ
              </Button>
            )}
            {/* เมนูเพิ่มเติม — ประวัติการแก้ไขย้ายมาที่นี่ ไม่เป็นแท็บหลักแล้ว */}
            <RowMenu
              label="เมนูเพิ่มเติม"
              items={[
                {
                  label: `ประวัติการแก้ไข${leader.auditLog.length > 0 ? ` (${leader.auditLog.length})` : ''}`,
                  onClick: () => setAuditOpen(true),
                },
              ]}
            />
          </div>
        </div>

        {/* ข้อควรระวัง — แสดงเป็น Callout เด่น */}
        {leader.cautions && (
          <div className="mt-4">
            <Callout tone="amber" title="ข้อควรระวัง">
              {leader.cautions}
            </Callout>
          </div>
        )}

        {expiredDocs.length > 0 && (
          <div className="mt-4">
            <Callout tone="red" title={`มีเอกสารหมดอายุแล้ว ${expiredDocs.length} รายการ`}>
              {expiredDocs.map((d) => d.name).join(', ')} — ไม่ควรจัดงานต่างประเทศจนกว่าจะต่ออายุ
            </Callout>
          </div>
        )}

        {/* คำเตือนหนังสือเดินทาง (§15) — แสดงสถานะ ไม่แสดงเลขเอกสาร */}
        {(passSt === 'EXPIRED' || passSt.startsWith('EXPIRING')) && (
          <div className="mt-4">
            <Callout tone={passSt === 'EXPIRED' ? 'red' : 'amber'} title={`หนังสือเดินทาง: ${PASSPORT_STATUS_META[passSt].label}`}>
              {passportRemainingText(identity?.passportExpiryDate ?? null, today)} — โปรดตรวจสอบก่อนมอบหมายงานต่างประเทศ (ดูรายละเอียดที่แท็บ “ข้อมูลหนังสือเดินทาง”)
            </Callout>
          </div>
        )}

        {/* Reminder ชดเชยงาน — ไกด์รายนี้มีประวัติถูกยกเลิกงานในเดือนที่ผ่านมาและยังไม่ได้รับงานชดเชย */}
        {pendingReminder && (
          <div className="mt-4">
            <Callout tone="amber" title="มีประวัติถูกยกเลิกงานในเดือนที่ผ่านมา และยังไม่ได้รับงานชดเชย">
              โปรดพิจารณาจัดงานทดแทนให้ไกด์รายนี้ — ดูรายละเอียดที่แท็บ “ตารางงาน”{' '}
              <button
                type="button"
                onClick={() => requestTab('schedule')}
                className="font-medium underline hover:no-underline"
              >
                ไปที่แท็บตารางงาน
              </button>
            </Callout>
          </div>
        )}
      </Card>

      <Tabs items={tabs} value={tab} onChange={(k) => requestTab(k as TabKey)} />

      {/*
        Error Boundary ครอบเนื้อหาแท็บ — ถ้าเนื้อหาแท็บใดเรนเดอร์ล้มเหลว จะแสดง Error State + ปุ่ม "ลองใหม่"
        แทน "หน้าว่าง" โดย Header และแถบ Tab ด้านบนไม่หาย · resetKey={tab} → สลับแท็บแล้วล้าง error อัตโนมัติ
      */}
      <ErrorBoundary resetKey={tab} title="ไม่สามารถแสดงเนื้อหาแท็บนี้ได้">

      {/* ================= ภาพรวมข้อมูลหัวหน้าทัวร์ (Dashboard สรุป §2–§10) ================= */}
      <TabPanel active={tab === 'summary'}>
        {/*
          ผ่าน TAB_ALIAS ก่อนเสมอ — คีย์ที่ถูกเปลี่ยนชื่อ (status/tourJobs) เคยถูกส่งเข้า setTab
          ตรง ๆ จนไม่มี TabPanel ไหนตรง หน้าจึงว่างทั้งหน้า (ไม่มีแท็บไหนถูกเลือกด้วย)
        */}
        <LeaderOverviewTab leader={leader} onGoTab={(t) => { const k = TAB_ALIAS[t] ?? t; if (isTabKey(k)) setTab(k); }} />
      </TabPanel>

      {/* ====================== 2. ข้อมูลส่วนตัว ======================
          Card 1-3 (ข้อมูลทั่วไป · ติดต่อ · การร่วมงาน) + Card 4 ประวัติการทำงาน
          ⚠️ Passport ไม่อยู่แท็บนี้ — ย้ายไปแท็บ "เอกสารส่วนตัว" แล้ว
          ⚠️ "ประวัติการทำงาน" = สถานประกอบการที่เคยทำงาน ห้ามปนกับ "ตารางงาน" (งานทัวร์ที่ได้รับมอบหมาย) */}
      <TabPanel active={tab === 'identity'}>
        <div className="space-y-5">
          <LeaderIdentityTab
            leader={leader}
            sections={['personal']}
            onGoStatus={() => requestTab('leave')}
            onGoDocuments={() => requestTab('idDocs')}
            onGoOtherDocs={() => requestTab('otherDocs')}
          />
        {/* ---- ประวัติการทำงาน (สถานประกอบการ) — รวมมาไว้แท็บนี้ตาม §1 ---- */}
        <div className="mt-6 zego-divider-top pt-5">
          <h3 className="mb-3 text-base font-semibold zego-text">ประวัติการทำงาน (สถานประกอบการ)</h3>
        <Callout tone="blue" title="ประวัติ / ประสบการณ์การทำงาน">
          หมายถึงการทำงานกับ <strong>บริษัท ร้านค้า องค์กร หรือสถานประกอบการ</strong> —
          คนละส่วนกับแท็บ “ผลแบบสอบถาม”
        </Callout>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="จำนวนสถานประกอบการ"
            value={experience.employerCount}
            tone="blue"
          />
          <StatCard
            label="ประสบการณ์รวม"
            value={experience.label}
            tone="violet"
            hint="ไม่นับเดือนที่ซ้อนกันซ้ำ"
          />
          <StatCard
            label="งานปัจจุบัน"
            value={experience.currentJobs.length}
            tone={experience.currentJobs.length > 0 ? 'green' : 'slate'}
            hint={experience.currentJobs.map((e) => e.employerName).join(' · ') || 'ไม่มี'}
          />
          <StatCard label="ตำแหน่งล่าสุด" value={experience.latestPosition} tone="amber" />
        </div>

        {experience.hasOverlap && (
          <div className="mt-5">
            <Callout tone="amber" title="มีช่วงเวลาทำงานที่ซ้อนกัน">
              ระบบ<strong>ไม่นับเดือนซ้ำ</strong>ในการคำนวณประสบการณ์รวม
            </Callout>
          </div>
        )}

        <Card className="mt-5">
          <CardHeader
            title="ตารางประวัติการทำงาน"
            description="เรียงจากงานปัจจุบัน → งานล่าสุด → งานในอดีต"
            action={
              canEdit ? (
                <Button size="sm" variant="secondary" icon="edit" onClick={() => setSectionEditKey('work-history')}>
                  แก้ไขประวัติการทำงาน
                </Button>
              ) : undefined
            }
          />
          <DataTable
            columns={employmentColumns}
            rows={employmentRows}
            rowKey={(r) => r.id}
            rowClassName={(r) => (r.isCurrentJob ? 'bg-emerald-50/40' : undefined)}
            emptyIcon="briefcase"
            emptyTitle="ยังไม่มีประวัติการทำงาน"
            emptyDescription="หัวหน้าทัวร์รายนี้ยังไม่ได้บันทึกประวัติการทำงานกับสถานประกอบการใด"
            emptyAction={
              canEdit ? (
                <Button variant="primary" size="sm" onClick={() => setSectionEditKey('work-history')}>
                  เพิ่มประวัติการทำงาน
                </Button>
              ) : undefined
            }
          />
        </Card>

        {/* Timeline จากปัจจุบัน → อดีต */}
        {employmentRows.length > 0 && (
          <Card className="mt-5">
            <CardHeader title="Timeline" description="จากปัจจุบันย้อนไปอดีต" />
            <ol className="relative space-y-4 border-l zego-border-color pl-5">
              {employmentRows.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    className={cx(
                      'absolute -left-[26px] top-1.5 h-3 w-3 rounded-full ring-4 ring-[var(--zego-surface)]',
                      entry.isCurrentJob ? 'bg-emerald-500' : 'bg-[var(--zego-text-tertiary)]',
                    )}
                    aria-hidden="true"
                  />
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold zego-text">
                    {entry.employerName}
                    {entry.isCurrentJob && <Pill tone="green">ปัจจุบัน</Pill>}
                  </p>
                  <p className="text-xs zego-text-tertiary">
                    {entry.position} · {formatEmploymentPeriod(entry)} ·{' '}
                    {entryDurationLabel(entry, today)}
                  </p>
                  {entry.jobDescription && (
                    <p className="mt-1 rounded-md zego-surface-soft-bg px-2.5 py-1.5 text-xs zego-text-secondary">
                      {entry.jobDescription}
                    </p>
                  )}
                  {!entry.isCurrentJob && entry.reasonForLeaving && (
                    <p className="mt-1 text-xs zego-text-tertiary">
                      เหตุผลที่ออก: {entry.reasonForLeaving}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </Card>
        )}
        </div>
        </div>
      </TabPanel>

      {/* ============================== ความสามารถ ============================= */}
      <TabPanel active={tab === 'skills'}>
        <div className="space-y-5">
          {/* §1 ทักษะด้านภาษา — แบบฟอร์ม Inline ในหน้าหลัก ไม่เปิด Modal */}
          <LanguageSkillsPanel leader={leader} canEdit={canEdit} />

          <Card>
            <CardHeader
              title="โซน ประเทศ และเส้นทางที่เชี่ยวชาญ"
              description="เลือกได้หลายโซน หลายประเทศ และหลายเส้นทาง หรือระบุเฉพาะประเทศโดยไม่เลือกโซนก็ได้"
              action={
                canEdit && expertiseScopes.length > 0 ? (
                  <Button size="sm" variant="secondary" icon="edit" onClick={() => openSection('country-route', 'edit')}>
                    แก้ไข
                  </Button>
                ) : undefined
              }
            />
            {expertiseScopes.length === 0 ? (
              <EmptyState
                icon="plane"
                title="ยังไม่มีความเชี่ยวชาญ"
                description="ยังไม่ได้ระบุโซน ประเทศ หรือเส้นทางที่เชี่ยวชาญ"
                action={
                  canEdit ? (
                    <Button variant="primary" size="sm" onClick={() => openSection('country-route', 'add')}>
                      เพิ่มความเชี่ยวชาญ
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ExpertiseScopeView scopes={expertiseScopes} countries={countries} />
            )}
          </Card>

          {/*
            §2/§6 ประเภทกรุ๊ปที่ถนัด — เต็มความกว้าง
            Card “ประเภททัวร์ (กลุ่มลูกค้า)” ถูกนำออกจากหน้าจอแล้ว จึงไม่แบ่งเป็น 2 คอลัมน์อีก
            ความถนัดด้านรูปแบบกลุ่มลูกค้าให้ใช้ Card นี้เป็นข้อมูลหลัก
            (ข้อมูล tourSkills หมวด customer_group ยังอยู่ในโมเดล — ซ่อนเฉพาะการแสดงผล)
          */}
          <Card>
            <CardHeader
              title="ประเภทกรุ๊ปที่ถนัด"
              description={groupCodes.length > 0 ? groupExpertiseCountLabel(groupCodes) : undefined}
              action={
                canEdit && groupCodes.length > 0 ? (
                  <span className="flex gap-1.5">
                    <Button size="sm" variant="secondary" icon="edit" onClick={() => openSection('group-type', 'edit')}>แก้ไข</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmClearGroups(true)}>ล้างข้อมูล</Button>
                  </span>
                ) : undefined
              }
            />
            {groupCodes.length === 0 ? (
              <EmptyState
                title="ยังไม่ได้ระบุประเภทกรุ๊ปที่ถนัด"
                action={
                  canEdit ? (
                    <Button variant="primary" size="sm" onClick={() => openSection('group-type', 'add')}>เพิ่มข้อมูล</Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {isAllGroups(groupCodes) ? (
                  <Pill tone="green">ทุกประเภท</Pill>
                ) : (
                  groupCodes.map((code) => <Pill key={code} tone="blue">{groupExpertiseName(code)}</Pill>)
                )}
              </div>
            )}
          </Card>
        </div>
      </TabPanel>

      {/* ============================== ตารางงาน ============================== */}
      <TabPanel active={tab === 'schedule'}>
        <LeaderScheduleTab leader={leader} today={today} />

        {/* ---- การเคลียร์เงินกรุ๊ป — ย้ายมาจากแท็บ "เอกสารส่วนตัว"
             การเคลียร์เงินกรุ๊ป 1 รายการ = 1 งานทัวร์ (ผูกด้วย jobId) ไม่ใช่เอกสารส่วนบุคคล
             สถานะการเคลียร์เงินกรุ๊ป (SETTLEMENT_STATUS) แยกจากสถานะการมอบหมายงาน (JOB_STATUS) ---- */}
        <div className="mt-6 zego-divider-top pt-5">
          <Card>
            <CardHeader
              title="การเคลียร์เงินกรุ๊ป"
              description={`${leaderSettlements.length} รายการ · ผูกกับงานทัวร์รายกรุ๊ป — เปิดรายละเอียดจากงานที่เกี่ยวข้อง`}
              action={
                <div className="flex flex-wrap items-center gap-1">
                  {SETTLEMENT_FILTERS.map((f) => {
                    const n = countSettlements(leaderSettlements, f.key, today);
                    return (
                      <button
                        key={f.key}
                        type="button"
                        aria-pressed={settlementFilter === f.key}
                        onClick={() => setSettlementFilter(f.key)}
                        className={cx(
                          'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                          settlementFilter === f.key
                            ? 'zego-badge--info'
                            : 'zego-badge--slate zego-hover-surface',
                        )}
                      >
                        {f.label} <span className="zego-text-tertiary">{n}</span>
                      </button>
                    );
                  })}
                </div>
              }
            />
            {shownSettlements.length === 0 ? (
              <EmptyState
                icon="checklist"
                title={
                  leaderSettlements.length === 0
                    ? 'ยังไม่มีรายการเคลียร์เงินกรุ๊ป'
                    : 'ไม่พบรายการตามตัวกรองที่เลือก'
                }
                description={
                  leaderSettlements.length === 0
                    ? 'เมื่อจบทัวร์และมีการเปิดรอบเคลียร์เงินกรุ๊ป รายการจะแสดงที่นี่โดยอัตโนมัติ'
                    : undefined
                }
              />
            ) : (
              <ul className="space-y-2">
                {shownSettlements.map((settlement) => {
                  const summary = summarizeSettlement(settlement, today);
                  const job = jobs.find((j) => j.id === settlement.jobId);
                  return (
                    <li
                      key={settlement.id}
                      className="rounded-lg border zego-border-color px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          {/* อ้างอิงงานทัวร์ที่เป็นเจ้าของรายการนี้ — ระบุได้เสมอว่าเป็นของงานใด */}
                          <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium zego-text">
                            <Link
                              href={`/jobs/${settlement.jobId}`}
                              className="zego-text-info hover:underline"
                            >
                              {settlement.jobId}
                            </Link>
                            {job && <span className="truncate zego-text-secondary">{job.title}</span>}
                          </p>
                          <p className="mt-0.5 text-xs zego-text-tertiary">
                            {settlement.id} · กำหนดส่ง {formatDate(settlement.dueDate)}
                            {job && ` · เดินทาง ${formatDateRange(job.departDate, job.returnDate)}`}
                            {summary.overdueDays > 0 && (
                              <span className="ml-1 font-medium zego-text-danger">
                                (เกินกำหนด {summary.overdueDays} วัน)
                              </span>
                            )}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-x-3 text-xs zego-text-tertiary">
                            <span>เงินสำรองจ่าย {formatTHB(summary.advanceTHB)}</span>
                            <span>ยอดใช้จริง {formatTHB(summary.approvedTHB)}</span>
                            <span className={cx('font-medium', summary.direction === 'leader_returns' ? 'zego-text-warning' : summary.direction === 'company_pays' ? 'zego-text-success' : 'zego-text-secondary')}>
                              {summary.direction === 'leader_returns'
                                ? `คืนบริษัท ${formatTHB(Math.abs(summary.netTHB))}`
                                : summary.direction === 'company_pays'
                                  ? `บริษัทจ่ายเพิ่ม ${formatTHB(summary.netTHB)}`
                                  : 'เคลียร์พอดี'}
                            </span>
                          </p>
                        </div>
                        {/* สถานะการเคลียร์เงินกรุ๊ป — คนละชุดกับสถานะการมอบหมายงาน */}
                        <StatusBadge meta={SETTLEMENT_STATUS[settlement.status]} size="sm" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>


        {/* ---- ประวัติถูกยกเลิกงาน + Reminder การชดเชยงาน ----
             ข้อมูลกลาง (ไม่ผูกผู้ใช้คนใดคนหนึ่ง) — สร้างอัตโนมัติเมื่องานที่ไกด์ Assign อยู่แล้วถูกยกเลิก ---- */}
        <div className="mt-6 zego-divider-top pt-5">
          <Card>
            <CardHeader
              title="ประวัติถูกยกเลิกงาน"
              description={`${leaderCancellations.length} รายการ${
                leaderCancellations.some((r) => r.compensationStatus === 'pending')
                  ? ` · รอชดเชย ${leaderCancellations.filter((r) => r.compensationStatus === 'pending').length} รายการ`
                  : ''
              }`}
            />
            {leaderCancellations.length === 0 ? (
              <EmptyState
                icon="checklist"
                title="ยังไม่มีประวัติถูกยกเลิกงาน"
                description="เมื่อกรุ๊ปที่ไกด์รายนี้ได้รับมอบหมายถูกยกเลิก ระบบจะบันทึกรายการไว้ที่นี่โดยอัตโนมัติ"
              />
            ) : (
              <ul className="space-y-2">
                {leaderCancellations.map((record) => (
                  <li key={record.id} className="rounded-lg border zego-border-color px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium zego-text">
                          {/* record.jobId เป็นได้ทั้งรหัสงาน (JOB-...) หรือ Group Code จากหน้าการจัดสเก็ต — ลิงก์ได้เฉพาะแบบแรก */}
                          {record.jobId.startsWith('JOB-') ? (
                            <Link href={`/jobs/${record.jobId}`} className="zego-text-info hover:underline">
                              {record.jobId}
                            </Link>
                          ) : (
                            <span className="font-mono zego-text-secondary">{record.jobId}</span>
                          )}
                          <span className="truncate zego-text-secondary">{record.jobTitle}</span>
                          <span className="zego-text-disabled">·</span>
                          <span className="zego-text-tertiary">{record.route}</span>
                        </p>
                        <p className="mt-0.5 text-xs zego-text-tertiary">
                          {record.id} · เดินทาง {formatDate(record.originalTravelDate)}–{formatDate(record.originalReturnDate)} · ยกเลิกเมื่อ {formatDate(record.cancelledDate)} · ผู้รับผิดชอบกรุ๊ป {record.responsibleUser}
                        </p>
                        {record.compensationStatus === 'compensated' && (
                          <p className="mt-0.5 text-xs zego-text-success">
                            ชดเชยแล้วเมื่อ {record.compensatedAt ? formatDate(record.compensatedAt) : '—'}
                            {record.compensatedBy ? ` โดย ${record.compensatedBy}` : ''}
                            {record.compensatedJobId ? ` · งานชดเชย ${record.compensatedJobId}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <StatusBadge meta={GUIDE_COMPENSATION_STATUS[record.compensationStatus]} size="sm" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </TabPanel>

      {/* ============ 6. ผลแบบสอบถาม (กรุ๊ปที่มอบหมาย + คะแนนแบบสอบถามรายกรุ๊ป) ============ */}
      <TabPanel active={tab === 'survey'}>
        <div className="space-y-5">
          <Callout tone="blue" title="ผลแบบสอบถาม">
            คะแนนแบบสอบถามรายกรุ๊ปของกรุ๊ปที่หัวหน้าทัวร์รายนี้ได้รับมอบหมาย —
            ใช้ตารางและคะแนนชุดเดียวกับ “รายละเอียดกรุ๊ป” ในเมนูรายงาน · คลิกที่แถวเพื่อดูรายละเอียดคะแนนของกรุ๊ป
          </Callout>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="จำนวนกรุ๊ปที่เดินทางแล้ว" value={groupScoreSummary.groups} tone="blue" />
            <StatCard
              label="กรุ๊ปที่มีผลแบบสอบถาม"
              value={groupScoreSummary.scoredGroups}
              tone="violet"
              hint={upcomingCount > 0 ? `อีก ${upcomingCount} กรุ๊ปยังไม่ถึงวันเดินทาง` : undefined}
            />
            <StatCard label="ประเทศที่เคยทำ" value={groupScoreSummary.countries} tone="green" />
            <StatCard
              label="คะแนนเฉลี่ย"
              value={formatScore(groupScoreSummary.averageScore)}
              tone="amber"
              hint={groupScoreSummary.averageScore === null ? 'ยังไม่มีผลแบบสอบถาม' : getScoreScale().label}
            />
          </div>

          {/* ใช้ตารางเดียวกับ "รายละเอียดกรุ๊ป" — คอลัมน์/การคำนวณ/การเรียงตรงกันเสมอ */}
          <TourGroupScoreTable
            rows={groupScoreRows}
            title="ตารางผลแบบสอบถาม"
            description={`${groupScoreRows.length} กรุ๊ปที่มอบหมาย (เดินทางแล้ว ${groupScoreData.travelledCount}) · ใช้ข้อมูลชุดเดียวกับ “รายละเอียดกรุ๊ป”`}
            emptyTitle="ยังไม่มีผลแบบสอบถาม"
            emptyDescription="เมื่อมอบหมายกรุ๊ปให้หัวหน้าทัวร์รายนี้ Group Code · โปรแกรม · ประเทศ · ช่วงเดินทาง จะขึ้นที่นี่ทันที แล้วคะแนนค่อยเติมภายหลัง"
          />
        </div>
      </TabPanel>

      {/* ================= 6. สถานะ / การลา (ความพร้อมรับงาน + รายการลา) ================= */}
      <TabPanel active={tab === 'leave'}>
        <div className="space-y-5">
          <LeaderStatusTab leader={leader} />
          <LeaderLeaveTab leader={leader} />
        </div>
      </TabPanel>

      {/* บัญชีผู้ใช้ — User name สำหรับ login (ไม่เก็บรหัสผ่าน) */}
      <TabPanel active={tab === 'account'}>
        <LeaderAccountTab leader={leader} />
      </TabPanel>

      {/* ====================== 4. เอกสารประจำตัว ======================
          Passport (หลายเล่ม + เล่มหลัก) · การตรวจสอบข้อมูล · บัตรหัวหน้าทัวร์/วีซ่า/บัตรประชาชน
          Passport อยู่ที่นี่ที่เดียว — ไม่แสดงซ้ำในแท็บ "ข้อมูลส่วนตัว" */}
      <TabPanel active={tab === 'idDocs'}>
        <div className="space-y-5">
          {documentAlert}

          <LeaderIdentityTab
            leader={leader}
            sections={['documents']}
            onGoStatus={() => requestTab('leave')}
            onGoDocuments={() => requestTab('idDocs')}
            onGoOtherDocs={() => requestTab('otherDocs')}
          />

          <LeaderDocumentsCard
            leader={leader}
            kinds={IDENTITY_DOC_KINDS}
            title="วีซ่า"
            description="วีซ่าของประเทศปลายทาง"
            onChanged={() => setDocRev((v) => v + 1)}
          />
        </div>
      </TabPanel>

      {/* ====================== 5. เอกสารอื่น ๆ ======================
          เอกสารที่ตัวไฟล์คือเนื้อหาหลัก — ทุกฉบับต้องแนบไฟล์ */}
      <TabPanel active={tab === 'otherDocs'}>
        <div className="space-y-5">
          {documentAlert}

          <LeaderDocumentsCard
            leader={leader}
            kinds={OTHER_DOC_KINDS}
            addKind="other"
            title="เอกสารอื่น ๆ"
            description="เลือกชื่อเอกสารจาก list ตอนเพิ่ม — ทุกฉบับต้องแนบไฟล์ PDF หรือรูปภาพ"
            onChanged={() => setDocRev((v) => v + 1)}
          />
        </div>
      </TabPanel>

      {/* ====================== 6. เอกสารการเงิน ====================== */}
      <TabPanel active={tab === 'financeDocs'}>
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader
                title="บัญชีธนาคาร"
                description="เลขบัญชีถูกปิดบังก่อนบันทึกเสมอ"
                action={
                  canEdit ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="edit"
                      onClick={() => setSectionEditKey('bank')}
                    >
                      แก้ไข
                    </Button>
                  ) : undefined
                }
              />
              {leader.bankAccounts.length === 0 ? (
                <EmptyState
                  icon="money"
                  title="ยังไม่มีบัญชีธนาคาร"
                  action={
                    canEdit ? (
                      <Button variant="primary" size="sm" onClick={() => setSectionEditKey('bank')}>
                        เพิ่มบัญชี
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {leader.bankAccounts.map((account) => (
                    <li
                      key={account.id}
                      className={cx(
                        'rounded-lg border px-3 py-2.5',
                        account.isPrimary ? 'zego-selected-border zego-selected-tint' : 'zego-border-color',
                        !account.active && 'opacity-60',
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium zego-text">{account.bank}</span>
                        <div className="flex gap-1">
                          {account.isPrimary && <Pill tone="blue">บัญชีหลัก</Pill>}
                          {!account.active && <Pill tone="slate">ปิดใช้งาน</Pill>}
                        </div>
                      </div>
                      <p className="mt-1 font-mono text-sm zego-text-secondary">
                        {account.accountNoMasked}
                        <span className="ml-1 font-sans text-xs zego-text-tertiary">(ปิดบัง)</span>
                      </p>
                      <p className="text-xs zego-text-tertiary">
                        {account.accountName}
                        {account.branch && ` · ${account.branch}`}
                      </p>
                      {account.promptPay && (
                        <p className="text-xs zego-text-tertiary">PromptPay: {account.promptPay}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/*
              การ์ด "การเคลียร์เงินกรุ๊ป" ถูกย้ายไปแท็บ "ตารางงาน" แล้ว —
              การเคลียร์เงินกรุ๊ปผูกกับงานทัวร์รายกรุ๊ป (jobId) ไม่ใช่เอกสารส่วนบุคคล
              ⚠️ ห้ามนำเอกสาร/ยอดค่าใช้จ่ายของกรุ๊ปกลับมาแสดงในแท็บนี้อีก
            */}
          </div>
        </div>
      </TabPanel>

      {/* ประวัติการแก้ไข — ไม่เป็นแท็บหลักแล้ว เปิดจากปุ่ม "..." มุมขวาบนของหน้า */}
      <Modal open={auditOpen} onClose={() => setAuditOpen(false)} size="lg" title="ประวัติการแก้ไขข้อมูล" description={`${leader.firstName} ${leader.lastName} (${leader.id})`}>
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="ประวัติการแก้ไขข้อมูล"
              description="ค่าเดิม → ค่าใหม่ · ข้อมูลอ่อนไหวถูกปิดบัง"
            />
            {leader.auditLog.length === 0 ? (
              <EmptyState title="ยังไม่มีประวัติการแก้ไข" />
            ) : (
              <ul className="space-y-2">
                {leader.auditLog.map((entry) => (
                  <li key={entry.id} className="rounded-lg border zego-border-color px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge meta={AUDIT_CATEGORY[entry.category]} size="sm" dot={false} />
                        <p className="text-sm font-medium zego-text">{entry.action}</p>
                      </div>
                      <span className="text-xs zego-text-tertiary">{formatDateTime(entry.at)}</span>
                    </div>
                    <p className="mt-0.5 text-xs zego-text-tertiary">โดย {entry.by}</p>

                    {(entry.oldValue || entry.newValue) && (
                      <div className="mt-1.5 grid gap-1 text-xs sm:grid-cols-2">
                        <div className="rounded px-2 py-1 zego-badge--danger">
                          <span className="font-semibold">ค่าเดิม: </span>
                          {entry.oldValue ?? '(ไม่มี)'}
                        </div>
                        <div className="rounded px-2 py-1 zego-badge--success">
                          <span className="font-semibold">ค่าใหม่: </span>
                          {entry.newValue ?? '(ไม่มี)'}
                        </div>
                      </div>
                    )}

                    {entry.reason && (
                      <p className="mt-1 rounded zego-surface-soft-bg px-2 py-1 text-xs zego-text-secondary">
                        เหตุผล: {entry.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title="ประวัติการเปลี่ยนประเภท" />
              {leader.typeHistory.length === 0 ? (
                <EmptyState title="ยังไม่เคยเปลี่ยนประเภท" />
              ) : (
                <ul className="space-y-2">
                  {leader.typeHistory.map((entry) => (
                    <li key={entry.id} className="rounded-lg border zego-border-color px-3 py-2">
                      <p className="flex flex-wrap items-center gap-1.5 text-sm zego-text">
                        {entry.from && (
                          <>
                            <span className="zego-text-tertiary">{LEADER_TYPE[entry.from].label}</span>
                            <span className="zego-text-disabled">→</span>
                          </>
                        )}
                        <strong>{LEADER_TYPE[entry.to].label}</strong>
                        <span className="text-xs zego-text-tertiary">
                          (มีผล {formatDate(entry.effectiveDate)})
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs zego-text-tertiary">
                        โดย {entry.by} · {formatDateTime(entry.at)}
                      </p>
                      {entry.reason && (
                        <p className="mt-1 rounded zego-surface-soft-bg px-2 py-1 text-xs zego-text-secondary">
                          {entry.reason}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {currentUser.role !== 'leader' && (
              <Card>
                <CardHeader
                  title="หมายเหตุภายในและข้อควรระวัง"
                  description="เห็นเฉพาะเจ้าหน้าที่"
                />
                <p className="mb-1.5 text-xs font-semibold zego-text-tertiary">หมายเหตุภายใน</p>
                <p className="whitespace-pre-line rounded-lg border px-4 py-3 text-sm zego-badge--warning">
                  {leader.internalNote || 'ไม่มีหมายเหตุ'}
                </p>

                <p className="mb-1.5 mt-4 text-xs font-semibold zego-text-tertiary">ข้อควรระวัง</p>
                <p className="whitespace-pre-line rounded-lg border px-4 py-3 text-sm zego-badge--danger">
                  {leader.cautions || 'ไม่มีข้อควรระวัง'}
                </p>

                <dl className="mt-4 space-y-2 zego-divider-top pt-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="zego-text-tertiary">สร้างเมื่อ</dt>
                    <dd className="zego-text-secondary">
                      {formatDateTime(leader.createdAt)} โดย {leader.createdBy}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="zego-text-tertiary">แก้ไขล่าสุด</dt>
                    <dd className="zego-text-secondary">
                      {formatDateTime(leader.updatedAt)} โดย {leader.updatedBy}
                    </dd>
                  </div>
                </dl>
              </Card>
            )}
          </div>
        </div>
      </Modal>

      </ErrorBoundary>

      {/* §1/§8 Modal เฉพาะหมวด — ประวัติการทำงาน / เอกสารแนบ / บัญชีธนาคาร */}
      <LeaderSectionEditModal
        open={sectionEditKey !== null}
        leader={leader}
        section={sectionEditKey ?? 'work-history'}
        onClose={() => setSectionEditKey(null)}
      />

      {/* §1 โหมดที่ 2 — แก้ไขเฉพาะ Card ในหมวดความสามารถ (ไม่มี Tab Bar) */}
      <SkillSectionEditModal
        open={!!sectionEdit}
        onClose={closeSection}
        leader={leader}
        section={sectionEdit?.section ?? 'country-route'}
        mode={sectionEdit?.mode ?? 'edit'}
      />

      {/* §6 ยืนยันก่อนล้างข้อมูลประเภทกรุ๊ปที่ถนัด */}
      <ConfirmDialog
        open={confirmClearGroups}
        onClose={() => setConfirmClearGroups(false)}
        onConfirm={() => { saveGroupExpertise(params.id, []); setConfirmClearGroups(false); setScopeRev((v) => v + 1); }}
        tone="danger"
        title="ล้างข้อมูลประเภทกรุ๊ปที่ถนัด?"
        confirmLabel="ล้างข้อมูล"
        message="ต้องการล้างประเภทกรุ๊ปที่ถนัดทั้งหมดของหัวหน้าทัวร์รายนี้หรือไม่"
      />
      <LeaderStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} leader={leader} />
    </>
  );
}

