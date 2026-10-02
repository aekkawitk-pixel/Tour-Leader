'use client';

/**
 * Context กลางของ Demo — เก็บ state ทั้งหมดไว้ใน memory
 * ทุกการบันทึกวิ่งผ่าน `service` (src/services) เพื่อให้เปลี่ยนไปใช้ API จริงได้โดยไม่แก้ Component
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_USER_ID,
  demoUsers,
  DEMO_TODAY,
  groupBudgetsSeed,
  leaderAvailabilityRecords as seedAvailabilityRecords,
  notifications as seedNotifications,
} from '@/data';
import { service } from '@/services';
import { makeStatusEvent } from '@/lib/logic/workflow';
import { backdatedAssignmentError, leaderAssignmentGate } from '@/lib/logic/leaderJobs';
import { checkProgramAvailability, leaderUnavailability } from '@/lib/logic/leaderAvailability';
import { isValidAvailabilityType } from '@/lib/logic/availabilityStatus';
import {
  LEAVE_STORAGE_KEY,
  loadLeaveEvents,
  nextLeaveEventId,
  updateLeaveEvent,
  upsertLeaveEvent,
} from '@/services/leave-storage';
import {
  ASSIGNMENT_STORAGE_KEY,
  appendAudit,
  loadAssignments,
  loadAudit,
  upsertAssignments,
} from '@/services/assignment-storage';
import { loadImportedAdvanceDocs, sampleAdvanceDocs, upsertImportedAdvanceDocs } from '@/services/advanceImportStore';
import { clearSavedExpenses, loadEvidenceImages, loadSavedExpenses, persistExpense } from '@/services/expenseStore';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { attachMedia, clearEnvelopes, loadEnvelopeMedia, loadEnvelopes, loadNoEnvelopeMarks, persistEnvelope, persistNoEnvelopeMark, removeEnvelope } from '@/services/cashEnvelopeStore';
import { envelopeName, type CashEnvelope, type NoEnvelopeMark } from '@/lib/logic/cashEnvelope';
import { toISODate, toISODateTime } from '@/lib/format';

/** ผู้ใช้ที่สลับไว้ล่าสุด (Demo ไม่มี Login จริง) */
const CURRENT_USER_STORAGE_KEY = 'demoCurrentUserId';

/** แสดงใบเบิกตัวอย่างตั้งต้นของ Demo (EXP-2026-001…010) — ปิดไว้ตามที่ตกลง ให้เห็นเฉพาะที่บันทึกจริง · เปิดกลับได้ที่นี่จุดเดียว */
const SHOW_SEED_EXPENSES = false;
import { LEADER_STORAGE_KEY } from '@/services/leader-storage';
import { saveErrorMessage } from '@/services/browserStorage';
import {
  GUIDE_CANCELLATION_STORAGE_KEY,
  addGuideCancellation,
  loadGuideCancellations,
  nextGuideCancellationId,
  updateGuideCancellation,
} from '@/services/guideCancellationStore';
import { buildCancellationRecordFromPeriod } from '@/lib/logic/guideCancellations';
import { buildCommit, type StagedAssignment, type CommitResult } from '@/lib/logic/scheduleAssignment';
import type { MatchingContext } from '@/lib/logic/tourLeaderMatching';
import {
  LEADER_STATUS,
  LEADER_USAGE_STATUS,
  READINESS_TERM,
  USAGE_STATUS_TERM,
} from '@/lib/labels';
import { tourLeaderRepository } from '@/modules/tour-leaders/repository';
import type { LeaderFormState } from '@/modules/tour-leaders/mappers';
import type {
  Appointment,
  AppointmentStatus,
  AvailabilityApproval,
  LeaderAvailabilityRecord,
  CashCustodyBatch,
  Country,
  DemoUser,
  ExpenseLine,
  ExpenseRequest,
  ExpenseStatus,
  GroupBudget,
  GuideCancellationRecord,
  JobStatus,
  LeaderStatus,
  LeaderUsageStatus,
  MasterDataMap,
  MasterItem,
  MasterKey,
  Notification,
  Role,
  Settlement,
  SettlementItem,
  SettlementStatus,
  ToastMessage,
  ToastTone,
  TourJob,
  TourLeader,
  TourRoute,
  TourScheduleAssignment,
  AssignmentAudit,
} from '@/types';

interface DemoState {
  ready: boolean;
  /** โหลดข้อมูลเริ่มต้นไม่สำเร็จ */
  loadError: boolean;
  /** โหลดข้อมูลใหม่ (ปุ่ม "ลองใหม่") */
  reload: () => void;
  saving: boolean;
  today: string;

  currentUser: DemoUser;
  users: DemoUser[];
  setUserById: (id: string) => void;
  /** นับเฉพาะการสลับผู้ใช้โดยผู้ใช้กดเอง — ไม่นับการคืนผู้ใช้ที่จำไว้ตอนรีเฟรช (AppShell ใช้ตัดสินว่าจะพาไปหน้าแรกของบทบาทไหม) */
  userSwitchSeq: number;
  setRole: (role: Role) => void;

  leaders: TourLeader[];
  jobs: TourJob[];
  expenses: ExpenseRequest[];
  settlements: Settlement[];
  appointments: Appointment[];
  availabilityRecords: LeaderAvailabilityRecord[];
  master: MasterDataMap;
  /** Master Data ลำดับชั้น: ประเทศ → เส้นทาง */
  countries: Country[];
  routes: TourRoute[];
  /** ประวัติงานที่บันทึกย้อนหลังเอง */

  notifications: Notification[];
  markNotificationsRead: () => void;

  toasts: ToastMessage[];
  pushToast: (tone: ToastTone, title: string, description?: string) => void;
  dismissToast: (id: string) => void;

  // ---- หัวหน้าทัวร์ ----
  /** บันทึกจากฟอร์ม (ผ่าน repository: แปลงข้อมูล + สร้าง audit + คงข้อมูลสะสม) */
  saveLeaderForm: (
    form: LeaderFormState,
    existing?: TourLeader,
    reason?: string,
  ) => Promise<TourLeader>;
  /** บันทึก record ตรง ๆ (ใช้ภายใน เช่น เปลี่ยนสถานะ) */
  saveLeader: (leader: TourLeader) => Promise<void>;
  createLeaderCode: () => string;
  setLeaderStatus: (leaderId: string, status: LeaderStatus, note?: string) => Promise<void>;
  /** ปรับสถานะการใช้งาน — ระงับ/สิ้นสุด จะตั้งความพร้อมรับงานเป็นไม่พร้อมรับงานให้อัตโนมัติ */
  setLeaderUsageStatus: (leaderId: string, usage: LeaderUsageStatus, note?: string) => Promise<void>;
  setLeaderActive: (leaderId: string, active: boolean, reason?: string) => Promise<void>;

  // ---- งานทัวร์ ----
  saveJob: (job: TourJob) => Promise<void>;
  createJobId: () => Promise<string>;
  assignLeader: (jobId: string, leaderId: string | null, note?: string) => Promise<void>;
  changeJobStatus: (jobId: string, status: JobStatus, note?: string) => Promise<void>;

  // ---- ประวัติไกด์ถูกยกเลิกงาน + Reminder การชดเชยงาน ----
  guideCancellations: GuideCancellationRecord[];
  /** ทำเครื่องหมายว่าไกด์รายนี้ได้รับงานชดเชยแล้ว — ระบุงานที่นำมาชดเชยได้ (ไม่บังคับ) */
  markGuideCompensated: (recordId: string, compensatedJobId?: string, note?: string) => Promise<void>;
  /** บันทึกประวัติถูกยกเลิกงานจากหน้า "การจัดสเก็ต" (Tour Period Master) — คนละระบบกับ TourJob */
  recordGuideGroupCancellation: (params: {
    leaderId: string;
    groupCode: string;
    periodTitle: string;
    route: string | null;
    travelDate: string;
    returnDate: string;
  }) => Promise<void>;

  // ---- จัดหัวหน้าทัวร์ลงตารางงาน (matching/assignment) ----
  scheduleAssignments: TourScheduleAssignment[];
  assignmentAudit: AssignmentAudit[];
  /** ยืนยันลงตารางงาน (§10) — ตรวจซ้ำ → บันทึกเฉพาะที่ผ่าน → สถานะ "รอคอนเฟิร์ม" + Audit */
  commitAssignments: (staged: StagedAssignment[]) => Promise<CommitResult>;

  // ---- เบิกจ่าย ----
  saveExpense: (expense: ExpenseRequest) => Promise<void>;
  createExpenseId: () => Promise<string>;
  /** นำเข้าใบเบิกเงินทดรองจากไฟล์ .xls — เก็บถาวรใน localStorage (id ซ้ำ = แทนที่ของเดิม) */
  importAdvanceDocs: (docs: ExpenseRequest[]) => void;
  /** ซองเงินตามเอกสารเบิกค่าใช้จ่ายกรุ๊ป (จัดซอง/ส่งมอบ/รับ) — เก็บถาวรในเบราว์เซอร์ */
  envelopes: CashEnvelope[];
  /** บันทึกซองเงิน (upsert) + ต่อประวัติ 1 รายการ — การกระทำใช้ชื่อผู้ใช้ปัจจุบันและเวลาจริง */
  saveEnvelope: (env: CashEnvelope, action: string, note?: string, photo?: string) => Promise<CashEnvelope>;
  /** ลบซองที่ยังไม่ปิด (เช่น สร้างเกิน) */
  deleteEnvelope: (env: CashEnvelope) => Promise<void>;
  /** รีเซ็ตซองเงินทั้งหมด (ทุกกรุ๊ปกลับไป "รอจัดซอง") — สำหรับทดสอบใหม่ */
  resetEnvelopes: () => Promise<void>;
  /** รีเซ็ตใบเบิกที่ส่งเข้ามา (ค่าใช้จ่ายจริง/ค่าตอบแทน/ค่าส่งกรุ๊ป ฯลฯ) — เอกสารเบิกค่าใช้จ่ายกรุ๊ปยังอยู่ · สำหรับทดสอบใหม่ */
  resetSubmittedExpenses: () => Promise<void>;
  /** กรุ๊ปที่การเงินระบุว่าไม่มีซองเงินให้รับ */
  noEnvelopeMarks: NoEnvelopeMark[];
  /** ระบุว่ากรุ๊ปนี้ไม่มีซอง (reason) หรือยกเลิกการระบุ (null) — ใช้ชื่อผู้ใช้ปัจจุบันและเวลาจริง */
  setNoEnvelope: (periodId: string, mark: { reason: string; note?: string } | null) => void;
  /**
   * อนุมัติใบเบิก — ทั้งใบ หรือบางรายการ: rejected = บรรทัดที่ไม่อนุมัติ (line id → เหตุผล)
   * ว่าง = อนุมัติเต็มจำนวน · ยอดบาท (totalTHB) คิดใหม่จากบรรทัดที่อนุมัติเท่านั้น
   */
  approveExpenseLines: (expenseId: string, rejected: Record<string, string>) => Promise<void>;
  changeExpenseStatus: (
    expenseId: string,
    status: ExpenseStatus,
    note?: string,
    paidRef?: string,
  ) => Promise<void>;

  // ---- เคลียร์งาน ----
  reviewSettlementItem: (settlementId: string, item: SettlementItem) => Promise<void>;
  changeSettlementStatus: (
    settlementId: string,
    status: SettlementStatus,
    note?: string,
    paymentRef?: string,
  ) => Promise<void>;
  linkAppointmentToSettlement: (settlementId: string, appointmentId: string) => Promise<void>;
  submitSettlementClaim: (params: {
    periodId: string;
    periodEndDate: string;
    leaderId: string;
    items: SettlementItem[];
    customerCount?: number;
    companionCount?: number;
    cancelledCustomerNote?: string;
    submitForApproval: boolean;
  }) => Promise<string>;

  // ---- เงินค่าแลนด์ที่เจ้าหน้าที่ส่งกรุ๊ปถือไปให้หัวหน้าทัวร์ (custody) ----
  custodyBatches: CashCustodyBatch[];
  /** ฝ่ายการเงินจัดเงินก้อนหนึ่งให้เจ้าหน้าที่ส่งกรุ๊ปถือไป แบ่งเผื่อได้หลายกรุ๊ปพร้อมกัน */
  createCustodyBatch: (params: {
    staffId: string;
    currency: string;
    allocations: { periodId: string; leaderId: string; amount: number }[];
    note?: string;
  }) => Promise<string>;
  /** หัวหน้าทัวร์ยืนยันว่าได้รับเงินค่าแลนด์จากเจ้าหน้าที่ส่งกรุ๊ปแล้ว — ต้องยืนยันก่อนจึงเพิ่มรายการค่าแลนด์ในฟอร์มเคลียร์ได้ */
  acknowledgeCustodyAllocation: (batchId: string, allocationId: string, note?: string) => Promise<void>;

  // ---- งบประมาณต่อกรุ๊ป (ตัวอย่าง — ยังไม่มีหน้าให้โอพีสร้างเอง) ----
  groupBudgets: GroupBudget[];

  // ---- วันลา / ช่วงไม่พร้อม ----
  saveAvailabilityRecord: (record: LeaderAvailabilityRecord) => Promise<void>;
  setAvailabilityApproval: (
    id: string,
    approval: AvailabilityApproval,
    reason?: string,
  ) => Promise<void>;
  createAvailabilityId: () => string;

  // ---- นัดหมาย ----
  saveAppointment: (appointment: Appointment) => Promise<void>;
  createAppointmentId: () => Promise<string>;
  changeAppointmentStatus: (
    appointmentId: string,
    status: AppointmentStatus,
    note?: string,
    newDate?: string,
    newTime?: string,
  ) => Promise<void>;

  // ---- ประวัติงานย้อนหลัง ----

  // ---- ตั้งค่าระบบ ----
  saveMasterItem: (key: MasterKey, item: MasterItem) => Promise<void>;
  toggleMasterItem: (key: MasterKey, itemId: string) => Promise<void>;
  createMasterId: () => string;
  saveCountry: (country: Country) => Promise<void>;
  toggleCountry: (countryId: string) => Promise<void>;
  saveRoute: (route: TourRoute) => Promise<void>;
  toggleRoute: (routeId: string) => Promise<void>;
  toggleUserActive: (userId: string) => void;
}

const DemoContext = createContext<DemoState | null>(null);

const emptyMaster: MasterDataMap = {
  languages: [],
  customerGroups: [],
  workSkills: [],
  expenseTypes: [],
  currencies: [],
  banks: [],
  documentTypes: [],
  statuses: [],
  appointmentModes: [],
};

let toastSeq = 0;
let masterSeq = 900;

/**
 * นำการมอบหมายที่ persist ไว้ (localStorage) มาทาบลงบนงานที่ seed ตอนโหลด
 * เพื่อให้คอลัมน์หัวหน้าทัวร์คงชื่อ + สถานะ "รอคอนเฟิร์ม" หลัง refresh (§10)
 * ใช้เฉพาะรายการที่ยัง active (pending) — ไม่แตะงานที่ปิดแล้ว
 */
function applyAssignments(jobs: TourJob[], assignments: TourScheduleAssignment[]): TourJob[] {
  if (assignments.length === 0) return jobs;
  const byJob = new Map(assignments.map((a) => [a.tourJobId, a]));
  return jobs.map((job) => {
    const a = byJob.get(job.id);
    if (!a || a.assignmentStatus !== 'pending' || job.status === 'closed') return job;
    return { ...job, leaderId: a.tourLeaderId, status: 'offered' as JobStatus };
  });
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [users, setUsers] = useState<DemoUser[]>(demoUsers);
  const [currentUserId, setCurrentUserId] = useState(DEFAULT_USER_ID);
  const [userSwitchSeq, setUserSwitchSeq] = useState(0);

  const [leaders, setLeaders] = useState<TourLeader[]>([]);
  const [jobs, setJobs] = useState<TourJob[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRequest[]>([]);
  const [envelopes, setEnvelopes] = useState<CashEnvelope[]>([]);
  const [noEnvelopeMarks, setNoEnvelopeMarks] = useState<NoEnvelopeMark[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [custodyBatches, setCustodyBatches] = useState<CashCustodyBatch[]>([]);
  /* งบประมาณต่อกรุ๊ป — ยังไม่มีหน้าให้โอพีสร้างเอง จึงเป็นข้อมูลตัวอย่างคงที่ (อ่านอย่างเดียว ไม่มี setter) */
  const [groupBudgets] = useState<GroupBudget[]>(groupBudgetsSeed);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [availabilityRecords, setAvailabilityRecords] = useState<LeaderAvailabilityRecord[]>(
    seedAvailabilityRecords,
  );
  const [master, setMaster] = useState<MasterDataMap>(emptyMaster);
  const [countries, setCountries] = useState<Country[]>([]);
  const [routes, setRoutes] = useState<TourRoute[]>([]);
  const [scheduleAssignments, setScheduleAssignments] = useState<TourScheduleAssignment[]>([]);
  const [assignmentAudit, setAssignmentAudit] = useState<AssignmentAudit[]>([]);
  const [guideCancellations, setGuideCancellations] = useState<GuideCancellationRecord[]>([]);

  const [notifs, setNotifs] = useState<Notification[]>(seedNotifications);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [reloadTick, setReloadTick] = useState(0);
  /** สั่งโหลดข้อมูลใหม่ (ใช้กับปุ่ม "ลองใหม่" เมื่อโหลดไม่สำเร็จ) */
  const reload = useCallback(() => {
    setReady(false);
    setLoadError(false);
    setReloadTick((t) => t + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    service
      .loadAll()
      .then((snapshot) => {
        if (cancelled) return;
        setLeaders(snapshot.tourLeaders);
        // §10 ทาบการมอบหมายที่ persist ไว้ลงบนงาน (คอลัมน์คงหลัง refresh)
        const persistedAssignments = loadAssignments();
        setScheduleAssignments(persistedAssignments);
        setAssignmentAudit(loadAudit());
        setJobs(applyAssignments(snapshot.jobs, persistedAssignments));
        // ใบเบิกที่นำเข้าจากไฟล์ (.xls) อยู่ถาวรใน localStorage — ทาบลงบนข้อมูลตั้งต้น (id ซ้ำ = ใช้ของที่นำเข้า)
        const imported = loadImportedAdvanceDocs();
        const importedIds = new Set(imported.map((e) => e.id));
        // + ใบเบิกตัวอย่างที่ติดมากับระบบ ผูกตามรหัสกรุ๊ป (เช่น EXPOP26090218 → KIX-261001K-MM)
        const samples = sampleAdvanceDocs(importedIds);
        // ใบเบิก/ค่าใช้จ่ายที่บันทึกหรือเปลี่ยนสถานะไว้ (savedExpenses) ชนะทุกแหล่ง — รีเฟรชแล้วไม่หาย
        // ใบเบิกตัวอย่างตั้งต้นของ Demo (src/data/expenses.ts — EXP-2026-001…010 ผูกงาน JOB-…) ไม่แสดงแล้ว
        // เหลือเฉพาะที่บันทึกจริง + เอกสารเบิกกรุ๊ป · ตัดฉบับที่เคยแก้/เปลี่ยนสถานะแล้วถูกเก็บไว้ด้วย ไม่ให้โผล่กลับมา
        const seedIds = SHOW_SEED_EXPENSES ? new Set<string>() : new Set(snapshot.expenses.map((e) => e.id));
        const saved = loadSavedExpenses().filter((e) => !seedIds.has(e.id));
        const savedIds = new Set(saved.map((e) => e.id));
        const seed = SHOW_SEED_EXPENSES ? snapshot.expenses.filter((e) => !importedIds.has(e.id)) : [];
        const base = [...imported, ...samples, ...seed];
        setExpenses([...saved, ...base.filter((e) => !savedIds.has(e.id))]);
        // รูปหลักฐานอยู่ IndexedDB (อ่านแบบ async) — เติมเข้าไปทีหลัง ไม่ทำให้หน้ารอ
        // ซองเงิน — ตัวข้อมูลจาก localStorage ทันที · ลายเซ็น/รูปผู้รับจาก IndexedDB ตามมา
        setEnvelopes(loadEnvelopes());
        setNoEnvelopeMarks(loadNoEnvelopeMarks());
        void loadEnvelopeMedia().then((media) => {
          if (cancelled || media.size === 0) return;
          setEnvelopes((prev) => prev.map((e) => attachMedia(e, media)));
        });
        void loadEvidenceImages().then((images) => {
          if (cancelled || images.size === 0) return;
          setExpenses((prev) => prev.map((e) => {
            const img = images.get(e.id);
            return img && !e.lines.some((l) => l.evidenceImage) ? { ...e, lines: e.lines.map((l) => ({ ...l, evidenceImage: img })) } : e;
          }));
        });
        setSettlements(snapshot.settlements);
        setAppointments(snapshot.appointments);
        // §2/§9 โหลดวันลาจาก localStorage (seed เฉพาะเมื่อยังไม่มี Key) — ไม่ทับข้อมูลเดิม
        setAvailabilityRecords(loadLeaveEvents());
        // โหลดประวัติไกด์ถูกยกเลิกงาน (ข้อมูลกลาง — ไม่ผูกผู้ใช้คนใดคนหนึ่ง)
        setGuideCancellations(loadGuideCancellations());
        setMaster(snapshot.masterData);
        setCountries(snapshot.countries);
        setRoutes(snapshot.tourRoutes);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadTick]);

  // §12 ซิงก์ข้ามแท็บ — เมื่อแท็บอื่นแก้ข้อมูลใน localStorage ให้อัปเดต state ตาม
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === LEAVE_STORAGE_KEY) setAvailabilityRecords(loadLeaveEvents());
      if (e.key === GUIDE_CANCELLATION_STORAGE_KEY) setGuideCancellations(loadGuideCancellations());
      // แท็บอื่นเพิ่ม/แก้หัวหน้าทัวร์ → ดึงรายชื่อล่าสุดจากแหล่งข้อมูลเดียวกัน
      if (e.key === LEADER_STORAGE_KEY) {
        service.listLeaders().then(setLeaders).catch(() => { /* ซิงก์ไม่สำเร็จ — คงข้อมูลเดิมไว้ */ });
      }
      if (e.key === ASSIGNMENT_STORAGE_KEY) {
        const next = loadAssignments();
        setScheduleAssignments(next);
        setAssignmentAudit(loadAudit());
        setJobs((prev) => applyAssignments(prev, next));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const currentUser = useMemo(
    () => users.find((u) => u.id === currentUserId) ?? users[0],
    [users, currentUserId],
  );

  /* --------------------------------- Toast -------------------------------- */

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (tone: ToastTone, title: string, description?: string) => {
      toastSeq += 1;
      const id = `T-${toastSeq}`;
      setToasts((prev) => [...prev, { id, tone, title, description }]);
      setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast],
  );

  /* --------------------------------- ผู้ใช้ ------------------------------- */

  const setUserById = useCallback(
    (id: string) => {
      const user = users.find((u) => u.id === id);
      if (!user) return;
      setCurrentUserId(id);
      setUserSwitchSeq((n) => n + 1);
      // จำผู้ใช้ที่สลับไว้ — รีเฟรชแล้วไม่เด้งกลับเป็นผู้ใช้ตั้งต้น (เช่น อยู่ในพอร์ทัลหัวหน้าทัวร์แล้วรีเฟรช)
      try { window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, id); } catch { /* private mode — แค่ไม่จำ */ }
      pushToast('info', `สลับบทบาทเป็น: ${user.position}`, `กำลังใช้งานในนาม ${user.name}`);
    },
    [users, pushToast],
  );

  // คืนผู้ใช้ที่จำไว้หลังโหลดฝั่ง Client (อ่าน localStorage ตอนสร้าง state ไม่ได้ — HTML ฝั่ง server จะไม่ตรง)
  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY); } catch { /* ไม่มี storage */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    if (saved && demoUsers.some((u) => u.id === saved && u.active)) setCurrentUserId(saved);
  }, []);

  const setRole = useCallback(
    (role: Role) => {
      const user = users.find((u) => u.role === role && u.active);
      if (user) setUserById(user.id);
    },
    [users, setUserById],
  );

  const markNotificationsRead = useCallback(() => {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const stamp = useCallback(() => `${DEMO_TODAY}T${new Date().toTimeString().slice(0, 5)}`, []);

  /* ----------------------------- หัวหน้าทัวร์ ----------------------------- */

  /**
   * บันทึก record ตรง ๆ (ใช้ภายใน)
   * บันทึกไม่สำเร็จ → โยนต่อให้ผู้เรียกแสดงสาเหตุจริง และไม่แตะ state (ข้อมูลบนจอไม่โกหก)
   */
  const saveLeader = useCallback(async (leader: TourLeader) => {
    setSaving(true);
    try {
      await service.saveLeader(leader);
      setLeaders((prev) => {
        const exists = prev.some((l) => l.id === leader.id);
        return exists ? prev.map((l) => (l.id === leader.id ? leader : l)) : [leader, ...prev];
      });
    } finally {
      setSaving(false); // ต้องคืนสถานะเสมอ ไม่งั้นปุ่มบันทึกทั้งระบบค้างเป็น Loading
    }
  }, []);

  /**
   * บันทึกจากฟอร์ม — ผ่าน repository (จุดเดียวที่ทุกหน้า/ทุก Modal ของหัวหน้าทัวร์เรียกใช้)
   * repository จะแปลงฟอร์มเป็น record, สร้างประวัติการเปลี่ยนแปลง (diff)
   * และคงข้อมูลสะสม (คะแนน / การประเมิน / ประวัติ) ไว้ครบ
   *
   * ลำดับสำคัญ: บันทึกลงแหล่งข้อมูลให้สำเร็จก่อน → อัปเดต state → ค่อยแจ้งสำเร็จ
   * ถ้าบันทึกไม่สำเร็จจะโยน error ออกไป (ไม่มี Toast สำเร็จ · Modal ไม่ปิด · ค่าที่กรอกไม่หาย)
   */
  const saveLeaderForm = useCallback(
    async (form: LeaderFormState, existing?: TourLeader, reason?: string) => {
      setSaving(true);
      try {
        const { leader, isNew } = await tourLeaderRepository.save({
          form,
          existing,
          countries,
          routes,
          actor: currentUser.name,
          now: stamp(),
          today: DEMO_TODAY,
          reason,
        });

        setLeaders((prev) =>
          isNew ? [leader, ...prev] : prev.map((l) => (l.id === leader.id ? leader : l)),
        );
        pushToast(
          'success',
          'บันทึกข้อมูลหัวหน้าทัวร์สำเร็จ',
          `${leader.firstName} ${leader.lastName} (${leader.id})`,
        );
        return leader;
      } finally {
        setSaving(false);
      }
    },
    [countries, routes, currentUser.name, stamp, pushToast],
  );

  const createLeaderCode = useCallback(
    () => tourLeaderRepository.nextCode(leaders),
    [leaders],
  );

  const setLeaderStatus = useCallback(
    async (leaderId: string, status: LeaderStatus, note?: string) => {
      setSaving(true);
      const target = leaders.find((l) => l.id === leaderId);
      if (!target) {
        setSaving(false);
        return;
      }
      const updated: TourLeader = {
        ...target,
        status,
        internalNote: note ? `${target.internalNote}\n[${DEMO_TODAY}] ${note}` : target.internalNote,
        updatedAt: stamp(),
        updatedBy: currentUser.name,
        auditLog: [
          {
            id: `AU-${Date.now()}`,
            at: stamp(),
            by: currentUser.name,
            category: 'workStatus',
            action: `เปลี่ยน${READINESS_TERM}`,
            oldValue: LEADER_STATUS[target.status].label,
            newValue: LEADER_STATUS[status].label,
            reason: note,
          },
          ...target.auditLog,
        ],
      };
      try {
        await service.saveLeader(updated);
        setLeaders((prev) => prev.map((l) => (l.id === leaderId ? updated : l)));
        pushToast('success', 'บันทึกข้อมูลหัวหน้าทัวร์สำเร็จ', `เปลี่ยน${READINESS_TERM} ${target.firstName} ${target.lastName}`);
      } catch (err) {
        pushToast('error', `เปลี่ยน${READINESS_TERM}ไม่สำเร็จ`, saveErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [leaders, currentUser.name, stamp, pushToast],
  );

  /**
   * ปรับสถานะการใช้งาน (ใช้งาน / ระงับการใช้งาน / สิ้นสุดการใช้งาน)
   * เมื่อไม่ใช่ "ใช้งาน" → ตั้งความพร้อมรับงานเป็น "ไม่พร้อมรับงาน" อัตโนมัติ
   * ไม่ลบโปรไฟล์/ประวัติงาน/คะแนน/เอกสาร/ประวัติการเปลี่ยนสถานะใด ๆ
   */
  const setLeaderUsageStatus = useCallback(
    async (leaderId: string, usage: LeaderUsageStatus, note?: string) => {
      setSaving(true);
      const target = leaders.find((l) => l.id === leaderId);
      if (!target) {
        setSaving(false);
        return;
      }
      const forcedUnavailable = usage !== 'active';
      const nextStatus: LeaderStatus = forcedUnavailable ? 'unavailable' : target.status;
      const at = stamp();
      const audit = [
        {
          id: `AU-${Date.now()}`,
          at,
          by: currentUser.name,
          category: 'workStatus' as const,
          action: `เปลี่ยน${USAGE_STATUS_TERM}`,
          oldValue: LEADER_USAGE_STATUS[target.usageStatus].label,
          newValue: LEADER_USAGE_STATUS[usage].label,
          reason: note,
        },
        ...(nextStatus !== target.status
          ? [
              {
                id: `AU-${Date.now() + 1}`,
                at,
                by: currentUser.name,
                category: 'workStatus' as const,
                action: `เปลี่ยน${READINESS_TERM} (อัตโนมัติตาม${USAGE_STATUS_TERM})`,
                oldValue: LEADER_STATUS[target.status].label,
                newValue: LEADER_STATUS[nextStatus].label,
                reason: note,
              },
            ]
          : []),
        ...target.auditLog,
      ];
      const updated: TourLeader = {
        ...target,
        usageStatus: usage,
        // active = ข้อมูลยังใช้อยู่ในระบบ → false เฉพาะ "สิ้นสุดการใช้งาน"
        // (ระงับการใช้งานเป็นการหยุดชั่วคราว — ยังค้นเจอในรายการหลักได้ แต่จัดงานใหม่ไม่ได้)
        active: usage !== 'ended',
        status: nextStatus,
        internalNote: note ? `${target.internalNote}\n[${DEMO_TODAY}] ${note}` : target.internalNote,
        updatedAt: at,
        updatedBy: currentUser.name,
        auditLog: audit,
      };
      try {
        await service.saveLeader(updated);
        setLeaders((prev) => prev.map((l) => (l.id === leaderId ? updated : l)));
        pushToast(
          'success',
          `บันทึก${USAGE_STATUS_TERM}แล้ว`,
          `${target.firstName} ${target.lastName} → ${LEADER_USAGE_STATUS[usage].label}` +
            (forcedUnavailable ? ` · ตั้ง${READINESS_TERM}เป็น “${LEADER_STATUS.unavailable.label}” ให้อัตโนมัติ` : ''),
        );
      } catch (err) {
        pushToast('error', `บันทึก${USAGE_STATUS_TERM}ไม่สำเร็จ`, saveErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [leaders, currentUser.name, stamp, pushToast],
  );

  /** ปิด/เปิดใช้งานข้อมูล — ไม่ลบข้อมูลถาวร */
  const setLeaderActive = useCallback(
    async (leaderId: string, active: boolean, reason?: string) => {
      setSaving(true);
      const target = leaders.find((l) => l.id === leaderId);
      if (!target) {
        setSaving(false);
        return;
      }
      try {
        const updated = await tourLeaderRepository.setActive(target, active, {
          actor: currentUser.name,
          now: stamp(),
          reason,
          countries,
          routes,
        });
        setLeaders((prev) => prev.map((l) => (l.id === leaderId ? updated : l)));
        pushToast(
          'success',
          active ? 'เปิดใช้งานข้อมูลแล้ว' : 'ปิดใช้งานข้อมูลแล้ว (ไม่ได้ลบข้อมูล)',
          `${target.firstName} ${target.lastName}`,
        );
      } catch (err) {
        pushToast('error', 'เปลี่ยนสถานะการใช้งานไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [leaders, currentUser.name, stamp, countries, routes, pushToast],
  );

  /* -------------------------------- งานทัวร์ ------------------------------ */

  const saveJob = useCallback(
    async (job: TourJob) => {
      setSaving(true);
      await service.saveJob(job);
      setJobs((prev) => {
        const exists = prev.some((j) => j.id === job.id);
        return exists ? prev.map((j) => (j.id === job.id ? job : j)) : [job, ...prev];
      });
      setSaving(false);
      pushToast('success', 'บันทึกงานทัวร์แล้ว', `${job.id} — ${job.title}`);
    },
    [pushToast],
  );

  const createJobId = useCallback(() => service.nextId('JOB'), []);

  const changeJobStatus = useCallback(
    async (jobId: string, status: JobStatus, note?: string) => {
      setSaving(true);
      const target = jobs.find((j) => j.id === jobId);
      if (!target) {
        setSaving(false);
        return;
      }
      const updated: TourJob = {
        ...target,
        status,
        history: [
          ...target.history,
          makeStatusEvent(target.status, status, currentUser.name, stamp(), note),
        ],
      };
      await service.saveJob(updated);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));

      // เมื่องานเข้าสถานะ "รอเคลียร์" ให้สร้างรายการเคลียร์งานอัตโนมัติ (จำลอง)
      if (status === 'awaiting_settlement' && updated.leaderId) {
        const already = settlements.some((s) => s.jobId === jobId);
        if (!already) {
          const stlId = await service.nextId('STL');
          const advance = expenses
            .filter((e) => e.jobId === jobId && e.category === 'advance' && e.status === 'paid')
            .reduce((sum, e) => sum + e.totalTHB, 0);
          const newSettlement: Settlement = {
            id: stlId,
            jobId,
            leaderId: updated.leaderId,
            advanceTHB: advance,
            items: [],
            dueDate: addBusinessDays(updated.returnDate, 14),
            status: 'awaiting_docs',
            history: [makeStatusEvent(null, 'awaiting_docs', 'ระบบ (จำลอง)', stamp())],
          };
          await service.saveSettlement(newSettlement);
          setSettlements((prev) => [newSettlement, ...prev]);
          pushToast('info', 'สร้างรายการรอเคลียร์อัตโนมัติ', `${stlId} สำหรับงาน ${jobId}`);
        }
      }

      setSaving(false);
      pushToast('success', 'เปลี่ยนสถานะงานแล้ว', `${jobId}`);
    },
    [jobs, expenses, settlements, currentUser.name, stamp, pushToast],
  );

  const markGuideCompensated = useCallback(
    async (recordId: string, compensatedJobId?: string, note?: string) => {
      setSaving(true);
      try {
        const next = updateGuideCancellation(recordId, {
          compensationStatus: 'compensated',
          compensatedAt: stamp(),
          compensatedBy: currentUser.name,
          compensatedJobId,
          compensatedNote: note,
        });
        setGuideCancellations(next);
        pushToast('success', 'ทำเครื่องหมายว่าชดเชยงานแล้ว', recordId);
      } catch (err) {
        pushToast('error', 'บันทึกไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [currentUser.name, stamp, pushToast],
  );

  const recordGuideGroupCancellation = useCallback(
    async (params: { leaderId: string; groupCode: string; periodTitle: string; route: string | null; travelDate: string; returnDate: string }) => {
      const leader = leaders.find((l) => l.id === params.leaderId);
      if (!leader) return;
      const recordId = nextGuideCancellationId(guideCancellations);
      const record = buildCancellationRecordFromPeriod(
        recordId,
        { internalId: params.groupCode, groupCode: params.groupCode, displayName: params.periodTitle, route: params.route, startDate: params.travelDate, endDate: params.returnDate },
        leader,
        currentUser.name,
        stamp(),
      );
      try {
        const next = addGuideCancellation(record);
        setGuideCancellations(next);
        pushToast(
          'info',
          'บันทึกประวัติไกด์ถูกยกเลิกงานแล้ว',
          `${leader.firstName} ${leader.lastName} — ${params.groupCode}`,
        );
      } catch (err) {
        pushToast('error', 'บันทึกประวัติถูกยกเลิกงานไม่สำเร็จ', saveErrorMessage(err));
      }
    },
    [leaders, guideCancellations, currentUser.name, stamp, pushToast],
  );

  const assignLeader = useCallback(
    async (jobId: string, leaderId: string | null, note?: string) => {
      setSaving(true);
      const target = jobs.find((j) => j.id === jobId);
      if (!target) {
        setSaving(false);
        return;
      }
      // การตรวจชั้น service (§11) — การถอดหัวหน้าทัวร์ออก (leaderId === null) ยังทำได้เสมอ
      if (leaderId !== null) {
        // ห้ามมอบหมาย/เปลี่ยนหัวหน้าทัวร์ย้อนหลัง (กันหน้าค้างข้ามวัน)
        const backdated = backdatedAssignmentError(target, DEMO_TODAY);
        if (backdated) {
          setSaving(false);
          pushToast('error', 'มอบหมายย้อนหลังไม่ได้', `${jobId} — ${backdated}`);
          return;
        }
        /**
         * กฎการนำไปจัดงาน — ตรวจตามลำดับ (1) สถานะการใช้งาน (2) ความพร้อมรับงาน
         * (3) งานเดิมทับซ้อน (4) รายการลา/ช่วงไม่พร้อมทับซ้อน
         */
        const targetLeader = leaders.find((l) => l.id === leaderId);
        // ช่วงทับซ้อนจากข้อมูลล่าสุด — แยกงานเดิม/นัดหมาย ออกจากวันลา/ช่วงไม่พร้อม
        const jobWindows = leaderUnavailability(leaderId, jobs, appointments, [], target.id);
        const leaveWindows = leaderUnavailability(leaderId, [], [], availabilityRecords, target.id);
        const jobCheck = checkProgramAvailability(target, jobWindows);
        const leaveCheck = checkProgramAvailability(target, leaveWindows);

        if (targetLeader) {
          const gate = leaderAssignmentGate(targetLeader, {
            hasJobOverlap: jobCheck.verdict === 'blocked',
            hasLeaveOverlap: leaveCheck.verdict === 'blocked',
          });
          if (!gate.ok) {
            setSaving(false);
            const detail =
              gate.failed === 'job_overlap'
                ? `${jobId}: ${jobCheck.detail ?? jobCheck.reason}`
                : gate.failed === 'leave_overlap'
                  ? `${jobId}: ${leaveCheck.detail ?? leaveCheck.reason}`
                  : `${jobId}`;
            pushToast('error', 'มอบหมายไม่ได้', `${gate.reason} — ${detail}`);
            return;
          }
        }
      }
      const nextStatus: JobStatus =
        leaderId === null
          ? 'need_leader'
          : target.status === 'draft' ||
              target.status === 'need_leader' ||
              target.status === 'rejected'
            ? 'offered' // มอบหมายใหม่/เปลี่ยนคน → กลับไปรอตอบรับเสมอ
            : target.status;

      const updated: TourJob = {
        ...target,
        leaderId,
        status: nextStatus,
        history:
          nextStatus === target.status
            ? [
                ...target.history,
                makeStatusEvent(target.status, target.status, currentUser.name, stamp(), note ?? 'เปลี่ยนหัวหน้าทัวร์'),
              ]
            : [
                ...target.history,
                makeStatusEvent(target.status, nextStatus, currentUser.name, stamp(), note),
              ],
      };
      await service.saveJob(updated);
      setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)));
      setSaving(false);
      pushToast(
        'success',
        leaderId ? 'จัดหัวหน้าทัวร์เรียบร้อย' : 'ถอดหัวหน้าทัวร์ออกจากงานแล้ว',
        `${jobId}`,
      );
    },
    [jobs, leaders, appointments, availabilityRecords, currentUser.name, stamp, pushToast],
  );

  /* ------------------ จัดหัวหน้าทัวร์ลงตารางงาน (§10) ------------------ */
  const commitAssignments = useCallback(
    async (staged: StagedAssignment[]): Promise<CommitResult> => {
      setSaving(true);
      const jobsById = new Map(jobs.map((j) => [j.id, j]));
      const leadersById = new Map(leaders.map((l) => [l.id, l]));
      const ctx: MatchingContext = {
        countries,
        routes,
        allJobs: jobs,
        today: DEMO_TODAY,
        appointments,
        records: availabilityRecords,
      };
      const at = stamp();
      // ตรวจซ้ำ + แยกผ่าน/มีปัญหา + สร้าง assignment/audit (ทั้งหมดใน service)
      const result = buildCommit(staged, jobsById, leadersById, ctx, currentUser.name, at);

      if (result.passed.length > 0) {
        const passedByJob = new Map(result.passed.map((p) => [p.assignment.tourJobId, p]));
        const updatedJobs = jobs.map((job) => {
          const p = passedByJob.get(job.id);
          if (!p) return job;
          const note = p.assignment.manualOverride
            ? `จัดหัวหน้าทัวร์ลงตารางงาน (override: ${p.assignment.overrideReason ?? '-'})`
            : 'จัดหัวหน้าทัวร์ลงตารางงาน';
          return {
            ...job,
            leaderId: p.assignment.tourLeaderId,
            status: 'offered' as JobStatus, // §10/§11 เริ่มต้น "รอคอนเฟิร์ม"
            history: [...job.history, makeStatusEvent(job.status, 'offered', currentUser.name, at, note)],
          };
        });
        for (const p of result.passed) {
          const uj = updatedJobs.find((j) => j.id === p.assignment.tourJobId);
          if (uj) await service.saveJob(uj);
        }
        setJobs(updatedJobs);
        setScheduleAssignments(upsertAssignments(result.passed.map((p) => p.assignment)));
        setAssignmentAudit(appendAudit(result.passed.map((p) => p.audit)));
      }

      setSaving(false);
      if (result.passed.length > 0) {
        pushToast('success', 'จัดหัวหน้าทัวร์ลงตารางงานเรียบร้อยแล้ว', `${result.passed.length} งาน`);
      }
      if (result.failed.length > 0) {
        pushToast('warning', `มี ${result.failed.length} งานที่ยังจัดไม่ได้`, 'ตรวจสอบเหตุผลในหน้าจัดหัวหน้าทัวร์');
      }
      return result;
    },
    [jobs, leaders, countries, routes, appointments, availabilityRecords, currentUser.name, stamp, pushToast],
  );

  /* --------------------------- วันลา / ช่วงไม่พร้อม --------------------------- */

  // id ที่ไม่ซ้ำจากค่าสูงสุดที่มี (กันชนกับข้อมูลที่ persist ไว้ใน localStorage)
  const createAvailabilityId = useCallback(
    () => nextLeaveEventId(availabilityRecords),
    [availabilityRecords],
  );

  const saveAvailabilityRecord = useCallback(
    async (record: LeaderAvailabilityRecord) => {
      // §4 ตรวจที่ชั้น service: รับเฉพาะ 4 ประเภทที่รองรับเท่านั้น
      if (!isValidAvailabilityType(record.type)) {
        pushToast('error', 'บันทึกไม่ได้', `ประเภทไม่รองรับ: ${record.type}`);
        throw new Error(`ประเภทวันลาไม่รองรับ: ${record.type}`);
      }
      setSaving(true);
      try {
        // §3/§4 อ่านล่าสุดจาก localStorage → upsert (ไม่ทับของคนอื่น) → persist + อัปเดต state
        const next = upsertLeaveEvent(record);
        setAvailabilityRecords(next);
        pushToast(
          'success',
          record.approval === 'pending' ? 'ส่งคำขอวันลาแล้ว (รออนุมัติ)' : 'บันทึกวันลา/ช่วงไม่พร้อมสำเร็จ',
          record.id,
        );
      } catch (err) {
        pushToast('error', 'บันทึกวันลาไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [pushToast],
  );

  const setAvailabilityApproval = useCallback(
    async (id: string, approval: AvailabilityApproval, reason?: string) => {
      setSaving(true);
      const target = availabilityRecords.find((r) => r.id === id);
      if (!target) {
        setSaving(false);
        return;
      }
      const updatedAt = stamp();
      const history = [
        ...target.history,
        makeStatusEvent(target.approval, approval, currentUser.name, updatedAt, reason),
      ];
      try {
        // §4/§5 อ่านล่าสุด → แก้เฉพาะ id ที่ตรง → persist + อัปเดต state
        const next = updateLeaveEvent(id, { approval, updatedAt, history });
        setAvailabilityRecords(next);
        const label =
          approval === 'approved'
            ? 'อนุมัติวันลาแล้ว'
            : approval === 'rejected'
              ? 'ปฏิเสธคำขอวันลาแล้ว'
              : 'ยกเลิกรายการแล้ว';
        pushToast('success', label, id);
      } catch (err) {
        pushToast('error', 'อัปเดตวันลาไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [availabilityRecords, currentUser.name, stamp, pushToast],
  );

  /* -------------------------------- เบิกจ่าย ------------------------------ */

  const saveExpense = useCallback(
    async (expense: ExpenseRequest) => {
      setSaving(true);
      try {
        await persistExpense(expense);
      } catch (err) {
        setSaving(false);
        pushToast('error', 'บันทึกใบเบิกไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      }
      await service.saveExpense(expense);
      setExpenses((prev) => {
        const exists = prev.some((e) => e.id === expense.id);
        return exists ? prev.map((e) => (e.id === expense.id ? expense : e)) : [expense, ...prev];
      });
      setSaving(false);
      pushToast('success', 'บันทึกใบเบิกแล้ว', `${expense.id}`);
    },
    [pushToast],
  );

  // ตัวนับเลขของ service เริ่มใหม่ทุกครั้งที่รีเฟรช แต่ใบที่บันทึกไว้ยังอยู่ → ข้ามเลขที่มีแล้ว กันเขียนทับใบเดิม
  const createExpenseId = useCallback(async () => {
    const taken = new Set(expenses.map((e) => e.id));
    let id = await service.nextId('EXP');
    while (taken.has(id)) id = await service.nextId('EXP');
    return id;
  }, [expenses]);

  const saveEnvelope = useCallback(
    async (env: CashEnvelope, action: string, note?: string, photo?: string) => {
      // ชื่อผู้ปิดซอง/ผู้ส่งมอบที่ยังว่าง = ผู้ใช้ปัจจุบัน (ผู้เรียกไม่ต้องรู้ชื่อเอง)
      // photo = รูปหลักฐานของทอดนี้ — เก็บติดกับรายการประวัติด้วย Timeline จึงเปิดดูได้แม้ทอดนั้นถูกล้าง/ทำซ้ำในรอบหลัง
      const next: CashEnvelope = {
        ...env,
        ...(env.sealed && !env.sealed.byName ? { sealed: { ...env.sealed, byName: currentUser.name } } : {}),
        ...(env.handover && !env.handover.byName ? { handover: { ...env.handover, byName: currentUser.name } } : {}),
        history: [...env.history, { at: toISODateTime(new Date()), byName: currentUser.name, action, ...(note ? { note } : {}), ...(photo ? { photo } : {}) }],
      };
      try {
        await persistEnvelope(next);
      } catch (err) {
        pushToast('error', 'บันทึกซองเงินไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      }
      setEnvelopes((prev) => [next, ...prev.filter((e) => e.id !== next.id)]);
      pushToast('success', action, envelopeName(next));
      return next;
    },
    [currentUser.name, pushToast],
  );

  const deleteEnvelope = useCallback(
    async (env: CashEnvelope) => {
      if (env.sealed) throw new Error('ซองปิดแล้ว ลบไม่ได้');
      try {
        await removeEnvelope(env);
      } catch (err) {
        pushToast('error', 'ลบซองไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      }
      setEnvelopes((prev) => prev.filter((e) => e.id !== env.id));
      pushToast('success', 'ลบซองแล้ว', envelopeName(env));
    },
    [pushToast],
  );

  const resetSubmittedExpenses = useCallback(async () => {
    let removed: string[];
    try {
      removed = await clearSavedExpenses(isGroupAdvanceDoc);
    } catch (err) {
      pushToast('error', 'รีเซ็ตใบเบิกไม่สำเร็จ', saveErrorMessage(err));
      throw err;
    }
    // ตัดใบที่ไม่ใช่เอกสารเบิกกรุ๊ปออกทั้งหมด (รวมใบที่ยังไม่เคยถูกเก็บ) ให้ตรงกับหลังรีเฟรช
    setExpenses((prev) => prev.filter(isGroupAdvanceDoc));
    pushToast('success', 'รีเซ็ตใบเบิกแล้ว', `ลบ ${removed.length} ใบ · เอกสารเบิกค่าใช้จ่ายกรุ๊ปยังอยู่`);
  }, [pushToast]);

  const resetEnvelopes = useCallback(async () => {
    try {
      await clearEnvelopes();
    } catch (err) {
      pushToast('error', 'รีเซ็ตซองเงินไม่สำเร็จ', saveErrorMessage(err));
      throw err;
    }
    setEnvelopes([]);
    setNoEnvelopeMarks([]);
    pushToast('success', 'รีเซ็ตซองเงินแล้ว', 'ทุกกรุ๊ปกลับไปสถานะรอจัดซอง');
  }, [pushToast]);

  const setNoEnvelope = useCallback(
    (periodId: string, mark: { reason: string; note?: string } | null) => {
      const full: NoEnvelopeMark | null = mark
        ? { periodId, reason: mark.reason, ...(mark.note ? { note: mark.note } : {}), at: toISODateTime(new Date()), byName: currentUser.name }
        : null;
      try {
        persistNoEnvelopeMark(periodId, full);
      } catch (err) {
        pushToast('error', 'บันทึกไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      }
      setNoEnvelopeMarks((prev) => [...(full ? [full] : []), ...prev.filter((m) => m.periodId !== periodId)]);
      pushToast('success', full ? 'ระบุว่ากรุ๊ปนี้ไม่มีซองแล้ว' : 'ยกเลิกการระบุ "ไม่มีซอง" แล้ว', full?.reason);
    },
    [currentUser.name, pushToast],
  );

  const importAdvanceDocs = useCallback(
    (docs: ExpenseRequest[]) => {
      try {
        upsertImportedAdvanceDocs(docs);
      } catch (err) {
        pushToast('error', 'นำเข้าใบเบิกไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      }
      const ids = new Set(docs.map((d) => d.id));
      setExpenses((prev) => [...docs, ...prev.filter((e) => !ids.has(e.id))]);
      pushToast('success', `นำเข้าใบเบิกแล้ว ${docs.length} ใบ`, docs.map((d) => d.id).join(', '));
    },
    [pushToast],
  );

  const changeExpenseStatus = useCallback(
    async (expenseId: string, status: ExpenseStatus, note?: string, paidRef?: string) => {
      setSaving(true);
      const target = expenses.find((e) => e.id === expenseId);
      if (!target) {
        setSaving(false);
        return;
      }
      const updated: ExpenseRequest = {
        ...target,
        status,
        // เวลาจริง ไม่ใช่วันที่จำลองของ Demo — ให้ตรงกับ "บันทึกเมื่อ" ที่หัวหน้าทัวร์เห็น
        paidAt: status === 'paid' ? toISODate(new Date()) : target.paidAt,
        paidRef: status === 'paid' ? (paidRef ?? `PAY-DEMO-${Math.floor(Math.random() * 900000 + 100000)}`) : target.paidRef,
        history: [
          ...target.history,
          makeStatusEvent(target.status, status, currentUser.name, toISODateTime(new Date()), note),
        ],
      };
      try {
        await persistExpense(updated);
      } catch (err) {
        setSaving(false);
        pushToast('error', 'อัปเดตใบเบิกไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      }
      await service.saveExpense(updated);
      setExpenses((prev) => prev.map((e) => (e.id === expenseId ? updated : e)));
      setSaving(false);

      const messages: Partial<Record<ExpenseStatus, string>> = {
        submitted: 'ส่งอนุมัติแล้ว',
        approved: 'อนุมัติใบเบิกแล้ว',
        revise: 'ส่งกลับให้แก้ไขแล้ว',
        rejected: 'ปฏิเสธใบเบิกแล้ว',
        awaiting_payment: 'ตั้งเรื่องรอจ่ายแล้ว',
        paid: 'บันทึกการจ่ายเงินแล้ว (จำลอง)',
        cancelled: 'ยกเลิกรายการนี้แล้ว',
      };
      pushToast('success', messages[status] ?? 'อัปเดตใบเบิกแล้ว', expenseId);
    },
    [expenses, currentUser.name, pushToast],
  );

  const approveExpenseLines = useCallback(
    async (expenseId: string, rejected: Record<string, string>) => {
      const target = expenses.find((e) => e.id === expenseId);
      if (!target) return;
      const lines: ExpenseLine[] = target.lines.map((l) => {
        const note = rejected[l.id];
        // ล้างผลตรวจรอบก่อน (ถ้าเคยส่งกลับแก้ไขแล้วส่งมาใหม่) แล้วใส่ผลรอบนี้
        const { rejected: _r, rejectNote: _n, ...rest } = l;
        void _r; void _n;
        return note !== undefined ? { ...rest, rejected: true, rejectNote: note } : rest;
      });
      const kept = lines.filter((l) => !l.rejected);
      const off = lines.filter((l) => l.rejected);
      const note = off.length === 0
        ? 'อนุมัติใบเบิกเต็มจำนวน'
        : `อนุมัติบางรายการ ${kept.length}/${lines.length} · ไม่อนุมัติ: ${off.map((l) => `${l.purpose} (${l.rejectNote})`).join(', ')}`;
      const updated: ExpenseRequest = {
        ...target,
        lines,
        totalTHB: kept.reduce((sum, l) => sum + l.amountTHB, 0),
        status: 'approved',
        history: [...target.history, makeStatusEvent(target.status, 'approved', currentUser.name, toISODateTime(new Date()), note)],
      };
      setSaving(true);
      try {
        await persistExpense(updated);
      } catch (err) {
        setSaving(false);
        pushToast('error', 'อนุมัติใบเบิกไม่สำเร็จ', saveErrorMessage(err));
        throw err;
      }
      await service.saveExpense(updated);
      setExpenses((prev) => prev.map((e) => (e.id === expenseId ? updated : e)));
      setSaving(false);
      pushToast('success', off.length === 0 ? 'อนุมัติใบเบิกแล้ว' : `อนุมัติบางรายการแล้ว (${kept.length}/${lines.length})`, expenseId);
    },
    [expenses, currentUser.name, pushToast],
  );

  /* ------------------------------- เคลียร์งาน ----------------------------- */

  const reviewSettlementItem = useCallback(
    async (settlementId: string, item: SettlementItem) => {
      setSaving(true);
      const target = settlements.find((s) => s.id === settlementId);
      if (!target) {
        setSaving(false);
        return;
      }
      const updated: Settlement = {
        ...target,
        items: target.items.map((i) => (i.id === item.id ? item : i)),
      };
      await service.saveSettlement(updated);
      setSettlements((prev) => prev.map((s) => (s.id === settlementId ? updated : s)));
      setSaving(false);
      pushToast('success', 'บันทึกผลการตรวจรายการแล้ว', item.purpose);
    },
    [settlements, pushToast],
  );

  const changeSettlementStatus = useCallback(
    async (settlementId: string, status: SettlementStatus, note?: string, paymentRef?: string) => {
      setSaving(true);
      const target = settlements.find((s) => s.id === settlementId);
      if (!target) {
        setSaving(false);
        return;
      }
      const updated: Settlement = {
        ...target,
        status,
        settledAt: status === 'settled' ? DEMO_TODAY : target.settledAt,
        paymentRef: paymentRef ?? target.paymentRef,
        history: [
          ...target.history,
          makeStatusEvent(target.status, status, currentUser.name, stamp(), note),
        ],
      };
      await service.saveSettlement(updated);
      setSettlements((prev) => prev.map((s) => (s.id === settlementId ? updated : s)));

      // ปิดการเคลียร์งาน → ปิดงานทัวร์ด้วย
      if (status === 'closed') {
        const job = jobs.find((j) => j.id === target.jobId);
        if (job && job.status !== 'closed') {
          const closedJob: TourJob = {
            ...job,
            status: 'closed',
            history: [
              ...job.history,
              makeStatusEvent(job.status, 'closed', currentUser.name, stamp(), 'ปิดงานจากการเคลียร์งาน'),
            ],
          };
          await service.saveJob(closedJob);
          setJobs((prev) => prev.map((j) => (j.id === job.id ? closedJob : j)));
        }
      }

      setSaving(false);
      pushToast('success', 'อัปเดตสถานะการเคลียร์งานแล้ว', settlementId);
    },
    [settlements, jobs, currentUser.name, stamp, pushToast],
  );

  const linkAppointmentToSettlement = useCallback(
    async (settlementId: string, appointmentId: string) => {
      const target = settlements.find((s) => s.id === settlementId);
      if (!target) return;
      const updated: Settlement = {
        ...target,
        appointmentId,
        status: target.status === 'settled' || target.status === 'closed' ? target.status : 'appointment_set',
        history: [
          ...target.history,
          makeStatusEvent(target.status, 'appointment_set', currentUser.name, stamp(), `นัดหมาย ${appointmentId}`),
        ],
      };
      await service.saveSettlement(updated);
      setSettlements((prev) => prev.map((s) => (s.id === settlementId ? updated : s)));
    },
    [settlements, currentUser.name, stamp],
  );

  /**
   * บันทึกแบบฟอร์ม "เคลียร์ค่าใช้จ่ายรายกรุ๊ป" จากพอร์ทัลหัวหน้าทัวร์ — สร้าง Settlement ใหม่ถ้ายังไม่มี
   * (ต่างจาก changeJobStatus ที่สร้างอัตโนมัติตอนงานเข้าสถานะ awaiting_settlement เท่านั้น — ที่นี่หัวหน้าทัวร์
   * เริ่มเองได้ทันทีจากกรุ๊ปที่เดินทางเสร็จแล้ว โดยไม่ต้องรอ TourJob เปลี่ยนสถานะก่อน)
   * submitForApproval=false (บันทึกแบบร่าง) = แทนที่ items แต่คงสถานะเดิมไว้ (หรือ awaiting_docs ถ้าเพิ่งสร้าง)
   * submitForApproval=true (ส่งอนุมัติ) = เปลี่ยนสถานะเป็น under_review ให้บัญชีเห็นและเริ่มตรวจได้
   */
  const submitSettlementClaim = useCallback(
    async ({
      periodId,
      periodEndDate,
      leaderId,
      items,
      customerCount,
      companionCount,
      cancelledCustomerNote,
      submitForApproval,
    }: {
      periodId: string;
      periodEndDate: string;
      leaderId: string;
      items: SettlementItem[];
      customerCount?: number;
      companionCount?: number;
      cancelledCustomerNote?: string;
      submitForApproval: boolean;
    }) => {
      setSaving(true);
      try {
        const existing = settlements.find((s) => s.jobId === periodId && s.leaderId === leaderId);
        const at = stamp();
        const nextStatus: SettlementStatus = submitForApproval ? 'under_review' : (existing?.status ?? 'awaiting_docs');
        const note = submitForApproval ? 'ส่งเอกสารเคลียร์ค่าใช้จ่ายจากพอร์ทัลหัวหน้าทัวร์' : 'บันทึกแบบร่างจากพอร์ทัลหัวหน้าทัวร์';

        let updated: Settlement;
        if (existing) {
          const statusChanged = existing.status !== nextStatus;
          updated = {
            ...existing,
            items,
            customerCount,
            companionCount,
            cancelledCustomerNote,
            submittedAt: at,
            status: nextStatus,
            history: statusChanged
              ? [...existing.history, makeStatusEvent(existing.status, nextStatus, currentUser.name, at, note)]
              : existing.history,
          };
        } else {
          const id = await service.nextId('STL');
          updated = {
            id,
            jobId: periodId,
            leaderId,
            advanceTHB: 0,
            items,
            dueDate: addBusinessDays(periodEndDate, 14),
            status: nextStatus,
            history: [makeStatusEvent(null, nextStatus, currentUser.name, at, note)],
            customerCount,
            companionCount,
            cancelledCustomerNote,
            submittedAt: at,
          };
        }
        await service.saveSettlement(updated);
        setSettlements((prev) => (existing ? prev.map((s) => (s.id === updated.id ? updated : s)) : [updated, ...prev]));

        // รายการ "ค่าแลนด์" ที่แปลงมาจากเงินที่รับผ่านเจ้าหน้าที่ส่งกรุ๊ป — ทำเครื่องหมายว่าถูกเบิกแล้ว กันเบิกซ้ำจากยอดเดิม
        const claimedAllocationIds = new Set(items.map((it) => it.custodyAllocationId).filter((x): x is string => Boolean(x)));
        if (claimedAllocationIds.size > 0) {
          setCustodyBatches((prev) => prev.map((batch) => ({
            ...batch,
            allocations: batch.allocations.map((a) => (claimedAllocationIds.has(a.id) && !a.claimedAt ? { ...a, claimedAt: at } : a)),
          })));
        }

        pushToast('success', submitForApproval ? 'ส่งเอกสารเคลียร์ค่าใช้จ่ายแล้ว' : 'บันทึกแบบร่างแล้ว', updated.id);
        return updated.id;
      } finally {
        setSaving(false);
      }
    },
    [settlements, currentUser.name, stamp, pushToast],
  );

  /* ------------- เงินค่าแลนด์ที่เจ้าหน้าที่ส่งกรุ๊ปถือไปให้หัวหน้าทัวร์ ------------- */

  /**
   * ฝ่ายการเงินจัดเงินก้อนหนึ่งให้เจ้าหน้าที่ส่งกรุ๊ปถือไป — ระบุล่วงหน้าว่าเผื่อไว้ให้กรุ๊ป/หัวหน้าทัวร์คนไหนบ้าง
   * (ตอบคำถามผู้ใช้แล้วว่าระบุกรุ๊ปตั้งแต่ตอนจัดเงินเลย ไม่ใช่มาจับคู่ทีหลัง) — 1 ก้อนแบ่งเผื่อได้หลายกรุ๊ปพร้อมกัน
   */
  const createCustodyBatch = useCallback(
    async ({
      staffId,
      currency,
      allocations,
      note,
    }: {
      staffId: string;
      currency: string;
      allocations: { periodId: string; leaderId: string; amount: number }[];
      note?: string;
    }) => {
      setSaving(true);
      try {
        const at = stamp();
        const id = await service.nextId('CUST');
        const fxRate = Number(master.currencies.find((c) => c.code === currency)?.extra ?? '1') || 1;
        const batch: CashCustodyBatch = {
          id,
          staffId,
          currency,
          fxRate,
          issuedBy: currentUser.id,
          issuedByName: currentUser.name,
          issuedAt: at,
          note,
          allocations: allocations.map((a, i) => ({
            id: `${id}-A${i + 1}`,
            periodId: a.periodId,
            leaderId: a.leaderId,
            amount: a.amount,
            amountTHB: Math.round(a.amount * fxRate),
          })),
        };
        await service.saveCustodyBatch(batch);
        setCustodyBatches((prev) => [batch, ...prev]);
        pushToast('success', 'จัดเงินค่าแลนด์แล้ว', id);
        return id;
      } finally {
        setSaving(false);
      }
    },
    [master.currencies, currentUser.id, currentUser.name, stamp, pushToast],
  );

  /** หัวหน้าทัวร์ยืนยันว่าได้รับเงินค่าแลนด์จากเจ้าหน้าที่ส่งกรุ๊ปแล้ว — ต้องยืนยันก่อนจึงเพิ่มรายการค่าแลนด์ในฟอร์มเคลียร์ได้ */
  const acknowledgeCustodyAllocation = useCallback(
    async (batchId: string, allocationId: string, note?: string) => {
      const at = stamp();
      const next = custodyBatches.map((batch) => (batch.id !== batchId ? batch : {
        ...batch,
        allocations: batch.allocations.map((a) => (a.id !== allocationId ? a : { ...a, acknowledgedAt: at, acknowledgedNote: note })),
      }));
      const batch = next.find((b) => b.id === batchId);
      if (batch) await service.saveCustodyBatch(batch);
      setCustodyBatches(next);
      pushToast('success', 'ยืนยันรับเงินค่าแลนด์แล้ว');
    },
    [custodyBatches, stamp, pushToast],
  );

  /* -------------------------------- นัดหมาย ------------------------------- */

  const saveAppointment = useCallback(
    async (appointment: Appointment) => {
      setSaving(true);
      await service.saveAppointment(appointment);
      setAppointments((prev) => {
        const exists = prev.some((a) => a.id === appointment.id);
        return exists
          ? prev.map((a) => (a.id === appointment.id ? appointment : a))
          : [appointment, ...prev];
      });
      setSaving(false);
      pushToast('success', 'บันทึกนัดหมายแล้ว', appointment.id);
    },
    [pushToast],
  );

  const createAppointmentId = useCallback(() => service.nextId('APT'), []);

  const changeAppointmentStatus = useCallback(
    async (
      appointmentId: string,
      status: AppointmentStatus,
      note?: string,
      newDate?: string,
      newTime?: string,
    ) => {
      setSaving(true);
      const target = appointments.find((a) => a.id === appointmentId);
      if (!target) {
        setSaving(false);
        return;
      }
      const updated: Appointment = {
        ...target,
        status,
        date: newDate ?? target.date,
        time: newTime ?? target.time,
        history: [
          ...target.history,
          makeStatusEvent(target.status, status, currentUser.name, stamp(), note),
        ],
      };
      await service.saveAppointment(updated);
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? updated : a)));
      setSaving(false);
      pushToast('success', 'อัปเดตนัดหมายแล้ว', appointmentId);
    },
    [appointments, currentUser.name, stamp, pushToast],
  );

  /* ------------------------------ ตั้งค่าระบบ ----------------------------- */

  const saveMasterItem = useCallback(
    async (key: MasterKey, item: MasterItem) => {
      setSaving(true);
      await service.saveMasterItem(key, item);
      setMaster((prev) => {
        const list = prev[key];
        const exists = list.some((i) => i.id === item.id);
        return {
          ...prev,
          [key]: exists ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item],
        };
      });
      setSaving(false);
      pushToast('success', 'บันทึกข้อมูลตั้งต้นแล้ว', `${item.code} — ${item.name}`);
    },
    [pushToast],
  );

  const toggleMasterItem = useCallback(
    async (key: MasterKey, itemId: string) => {
      const item = master[key].find((i) => i.id === itemId);
      if (!item) return;
      const updated = { ...item, active: !item.active };
      await service.saveMasterItem(key, updated);
      setMaster((prev) => ({
        ...prev,
        [key]: prev[key].map((i) => (i.id === itemId ? updated : i)),
      }));
      pushToast(
        'success',
        updated.active ? 'เปิดใช้งานรายการแล้ว' : 'ปิดใช้งานรายการแล้ว (ไม่ได้ลบข้อมูล)',
        `${item.code} — ${item.name}`,
      );
    },
    [master, pushToast],
  );

  const createMasterId = useCallback(() => {
    masterSeq += 1;
    return `M-${masterSeq}`;
  }, []);

  /* ----------------------- ประเทศและเส้นทาง (Master) ---------------------- */

  const saveCountry = useCallback(
    async (country: Country) => {
      setSaving(true);
      await service.saveCountry(country);
      setCountries((prev) => {
        const exists = prev.some((c) => c.id === country.id);
        return exists ? prev.map((c) => (c.id === country.id ? country : c)) : [...prev, country];
      });
      setSaving(false);
      pushToast('success', 'บันทึกประเทศแล้ว', `${country.code} — ${country.nameTh}`);
    },
    [pushToast],
  );

  const toggleCountry = useCallback(
    async (countryId: string) => {
      const target = countries.find((c) => c.id === countryId);
      if (!target) return;
      const updated = { ...target, isActive: !target.isActive };
      await service.saveCountry(updated);
      setCountries((prev) => prev.map((c) => (c.id === countryId ? updated : c)));
      pushToast(
        'success',
        updated.isActive ? 'เปิดใช้งานประเทศแล้ว' : 'ปิดใช้งานประเทศแล้ว (ไม่ได้ลบข้อมูล)',
        target.nameTh,
      );
    },
    [countries, pushToast],
  );

  const saveRoute = useCallback(
    async (route: TourRoute) => {
      setSaving(true);
      await service.saveRoute(route);
      setRoutes((prev) => {
        const exists = prev.some((r) => r.id === route.id);
        return exists ? prev.map((r) => (r.id === route.id ? route : r)) : [...prev, route];
      });
      setSaving(false);
      pushToast('success', 'บันทึกเส้นทางแล้ว', route.nameTh);
    },
    [pushToast],
  );

  const toggleRoute = useCallback(
    async (routeId: string) => {
      const target = routes.find((r) => r.id === routeId);
      if (!target) return;
      const updated = { ...target, isActive: !target.isActive };
      await service.saveRoute(updated);
      setRoutes((prev) => prev.map((r) => (r.id === routeId ? updated : r)));
      pushToast(
        'success',
        updated.isActive ? 'เปิดใช้งานเส้นทางแล้ว' : 'ปิดใช้งานเส้นทางแล้ว (ไม่ได้ลบข้อมูล)',
        target.nameTh,
      );
    },
    [routes, pushToast],
  );

  const toggleUserActive = useCallback(
    (userId: string) => {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, active: !u.active } : u)));
      const user = users.find((u) => u.id === userId);
      pushToast('success', user?.active ? 'ปิดใช้งานผู้ใช้แล้ว' : 'เปิดใช้งานผู้ใช้แล้ว', user?.name);
    },
    [users, pushToast],
  );

  const value: DemoState = {
    ready,
    loadError,
    reload,
    saving,
    today: DEMO_TODAY,
    currentUser,
    users,
    setUserById,
    userSwitchSeq,
    setRole,
    leaders,
    jobs,
    expenses,
    settlements,
    appointments,
    availabilityRecords,
    master,
    countries,
    routes,
    notifications: notifs,
    markNotificationsRead,
    toasts,
    pushToast,
    dismissToast,
    saveLeader,
    saveLeaderForm,
    createLeaderCode,
    setLeaderStatus,
    setLeaderUsageStatus,
    setLeaderActive,
    saveAvailabilityRecord,
    setAvailabilityApproval,
    createAvailabilityId,
    saveJob,
    createJobId,
    assignLeader,
    changeJobStatus,
    guideCancellations,
    markGuideCompensated,
    recordGuideGroupCancellation,
    scheduleAssignments,
    assignmentAudit,
    commitAssignments,
    saveExpense,
    createExpenseId,
    importAdvanceDocs,
    envelopes,
    saveEnvelope,
    deleteEnvelope,
    resetEnvelopes,
    resetSubmittedExpenses,
    noEnvelopeMarks,
    setNoEnvelope,
    approveExpenseLines,
    changeExpenseStatus,
    reviewSettlementItem,
    changeSettlementStatus,
    linkAppointmentToSettlement,
    submitSettlementClaim,
    custodyBatches,
    createCustodyBatch,
    acknowledgeCustodyAllocation,
    groupBudgets,
    saveAppointment,
    createAppointmentId,
    changeAppointmentStatus,
    saveMasterItem,
    toggleMasterItem,
    createMasterId,
    saveCountry,
    toggleCountry,
    saveRoute,
    toggleRoute,
    toggleUserActive,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoState {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo ต้องอยู่ภายใน <DemoProvider>');
  return ctx;
}

/** บวกวันแบบง่าย (Demo ไม่คิดวันหยุดจริง) */
function addBusinessDays(from: string, days: number): string {
  const [y, m, d] = from.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
