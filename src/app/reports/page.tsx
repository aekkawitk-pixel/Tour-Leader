'use client';

/** หน้ารายงาน — กราฟและตาราง พร้อมตัวกรองช่วงเวลาและปุ่มส่งออก (ต้นแบบ) */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { SETTLEMENT_STATUS, TONE_HEX } from '@/lib/labels';
import {
  cutExpenses,
  expensesPerJob,
  findExpiringDocuments,
  jobsPerLeader,
  leaderRatings,
  monthlyFees,
  outstandingSettlements,
  RANGE_PRESETS,
  type DateRange,
} from '@/lib/logic/reports';
import { formatNumber, formatTHB, formatDate } from '@/lib/format';
import {
  Button,
  Card,
  CardHeader,
  cx,
  PageHeader,
  StatusBadge,
} from '@/components/ui/Primitives';
import { BarChart, StatCard } from '@/components/ui/Charts';
import { DateField } from '@/components/ui/DateInput';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { Icon } from '@/components/ui/Icon';
import { TourGroupScoreTable } from '@/components/scores/TourGroupScoreTable';
import { buildGroupScoreRows } from '@/lib/logic/tourGroupScoreRows';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { groupResponsesByPeriod, getTravelerCountMap } from '@/services/groupScoreStore';
import type { SettlementStatus } from '@/types';

type ReportKey =
  | 'workload'
  | 'expenses'
  | 'outstanding'
  | 'cuts'
  | 'fees'
  | 'documents'
  | 'ratings';

export default function ReportsPage() {
  const { leaders, jobs, expenses, settlements, today, pushToast } = useDemo();

  const [preset, setPreset] = useState<string>('year');
  const [range, setRange] = useState<DateRange>({ from: '2026-01-01', to: '2026-12-31' });
  const [tab, setTab] = useState<ReportKey>('workload');

  const applyPreset = (key: string) => {
    setPreset(key);
    const found = RANGE_PRESETS.find((p) => p.key === key);
    if (found) setRange({ from: found.from, to: found.to });
  };

  const workload = useMemo(() => jobsPerLeader(leaders, jobs, range), [leaders, jobs, range]);
  const perJob = useMemo(() => expensesPerJob(jobs, expenses, range), [jobs, expenses, range]);
  const outstanding = useMemo(
    () => outstandingSettlements(settlements, leaders, jobs, today),
    [settlements, leaders, jobs, today],
  );
  const cuts = useMemo(() => cutExpenses(settlements, leaders), [settlements, leaders]);

  /** รายละเอียดกรุ๊ป — ทุกกรุ๊ปจาก Tour Period Master พร้อมคะแนนแบบสอบถาม (ชุดเดียวกับแท็บ "ผลแบบสอบถาม") */
  const groupScoreRows = useMemo(() => buildGroupScoreRows({
    periods: getTourPeriods(),
    assignments: loadActiveGuideAssignments().map((a) => ({ periodId: a.periodId, tourLeaderId: a.tourLeaderId })),
    leaderNameById: new Map(leaders.map((l) => [l.id, `${l.firstName} ${l.lastName}`])),
    responsesByPeriod: groupResponsesByPeriod(),
    travelerCountByPeriod: getTravelerCountMap(),
  }), [leaders]);
  const fees = useMemo(() => monthlyFees(jobs, range), [jobs, range]);
  const expiring = useMemo(() => findExpiringDocuments(leaders, today, 180), [leaders, today]);
  const ratings = useMemo(() => leaderRatings(leaders), [leaders]);

  const exportDemo = (format: 'Excel' | 'PDF') => {
    pushToast(
      'info',
      `ส่งออก ${format} — ยังเป็นฟังก์ชันต้นแบบ`,
      'ในเวอร์ชันจริงจะสร้างไฟล์จากข้อมูลที่กรองไว้ ขณะนี้ยังไม่มีการสร้างไฟล์',
    );
  };

  const tabs = [
    { key: 'workload', label: 'งานและวันทำงานต่อคน' },
    { key: 'expenses', label: 'ค่าใช้จ่ายแยกตามงาน' },
    { key: 'outstanding', label: 'เงินทดรองค้างเคลียร์', badge: outstanding.length },
    { key: 'cuts', label: 'ค่าใช้จ่ายที่ถูกตัด', badge: cuts.length },
    { key: 'fees', label: 'ค่าตอบแทนรายเดือน' },
    { key: 'documents', label: 'เอกสารใกล้หมดอายุ', badge: expiring.length },
    { key: 'ratings', label: 'คะแนนประเมิน' },
  ];

  const overdueCount = outstanding.filter((o) => o.overdueDays > 0).length;
  const totalCut = cuts.reduce((sum, c) => sum + c.cutTHB, 0);
  const totalAdvance = outstanding.reduce((sum, o) => sum + o.advanceTHB, 0);
  const totalFee = workload.reduce((sum, w) => sum + w.feeTHB, 0);

  return (
    <>
      <PageHeader
        title="รายงาน"
        description="รายงานตัวอย่างจากข้อมูลจำลอง — ตัวเลขทั้งหมดคำนวณสดจากข้อมูลในระบบ"
        actions={
          <>
            <Button variant="secondary" icon="download" onClick={() => exportDemo('Excel')}>
              ส่งออก Excel
            </Button>
            <Button variant="secondary" icon="download" onClick={() => exportDemo('PDF')}>
              ส่งออก PDF
            </Button>
          </>
        }
      />

      {/* ตัวกรองช่วงเวลา */}
      <Card className="mb-5">
        <CardHeader title="ช่วงเวลา" description="ใช้กับรายงานที่อ้างอิงวันเดินทาง" />
        <div className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              aria-pressed={preset === p.key}
              className={cx(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                preset === p.key
                  ? 'zego-badge--info'
                  : 'zego-badge--slate zego-hover-surface',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:w-1/2">
          <DateField
            label="ตั้งแต่วันที่"
            value={range.from}
            onChange={(v) => {
              setPreset('custom');
              setRange((r) => ({ ...r, from: v }));
            }}
          />
          <DateField
            label="ถึงวันที่"
            value={range.to}
            min={range.from || undefined}
            onChange={(v) => {
              setPreset('custom');
              setRange((r) => ({ ...r, to: v }));
            }}
          />
        </div>
      </Card>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="ค่าตอบแทนรวมในช่วง"
          value={formatTHB(totalFee)}
          tone="blue"
          hint="จากงานที่เดินทางในช่วงที่เลือก"
        />
        <StatCard
          label="เงินทดรองค้างเคลียร์"
          value={formatTHB(totalAdvance)}
          tone="amber"
          hint={`${outstanding.length} รายการ`}
        />
        <StatCard
          label="งานเคลียร์ล่าช้า"
          value={overdueCount}
          tone={overdueCount > 0 ? 'red' : 'green'}
          hint="เกินกำหนดวันเคลียร์"
        />
        <StatCard
          label="ค่าใช้จ่ายที่ถูกตัด"
          value={formatTHB(totalCut)}
          tone="violet"
          hint={`${cuts.length} รายการ`}
        />
      </div>

      <Card className="mb-5">
        <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as ReportKey)} />
      </Card>

      {tab === 'workload' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="จำนวนงานต่อหัวหน้าทัวร์" description="ในช่วงเวลาที่เลือก" />
            <BarChart
              data={workload.map((w) => ({
                label: w.name,
                value: w.jobCount,
                color: TONE_HEX.blue,
                display: `${w.jobCount} งาน`,
              }))}
            />
          </Card>
          <Card>
            <CardHeader title="วันทำงานต่อคน" description="นับรวมวันเดินทางไป–กลับ" />
            <BarChart
              data={workload.map((w) => ({
                label: w.name,
                value: w.dayCount,
                color: TONE_HEX.teal,
                display: `${w.dayCount} วัน`,
              }))}
            />
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="ตารางสรุป" />
            <DataTable
              columns={
                [
                  { key: 'name', header: 'หัวหน้าทัวร์', render: (r) => r.name },
                  {
                    key: 'jobs',
                    header: 'จำนวนงาน',
                    align: 'right',
                    render: (r) => <span className="tabular-nums">{r.jobCount}</span>,
                  },
                  {
                    key: 'days',
                    header: 'วันทำงาน',
                    align: 'right',
                    render: (r) => <span className="tabular-nums">{r.dayCount}</span>,
                  },
                  {
                    key: 'fee',
                    header: 'ค่าตอบแทนรวม',
                    align: 'right',
                    render: (r) => (
                      <span className="tabular-nums">{formatTHB(r.feeTHB)}</span>
                    ),
                  },
                  {
                    key: 'rating',
                    header: 'คะแนน',
                    align: 'right',
                    hideOnMobile: true,
                    render: (r) => <span className="tabular-nums">{r.rating.toFixed(1)}</span>,
                  },
                ] as Column<(typeof workload)[number]>[]
              }
              rows={workload}
              rowKey={(r) => r.leaderId}
              emptyTitle="ไม่มีข้อมูลในช่วงเวลาที่เลือก"
            />
          </Card>
        </div>
      )}

      {tab === 'expenses' && (
        <div className="grid gap-5">
          <Card>
            <CardHeader title="ค่าใช้จ่ายที่จ่ายจริงแยกตามงาน" description="เฉพาะใบเบิกที่จ่ายแล้ว" />
            <BarChart
              data={perJob.slice(0, 10).map((j) => ({
                label: j.jobId,
                value: j.paidTHB,
                color: j.overBudget ? TONE_HEX.red : TONE_HEX.teal,
                display: formatTHB(j.paidTHB),
              }))}
            />
          </Card>
          <Card>
            <CardHeader title="เทียบกับงบประมาณ" />
            <DataTable
              columns={
                [
                  {
                    key: 'job',
                    header: 'งานทัวร์',
                    render: (r) => (
                      <div className="min-w-0">
                        <p className="truncate font-medium zego-text">{r.title}</p>
                        <p className="text-xs zego-text-tertiary">
                          {r.jobId} · {r.country}
                        </p>
                      </div>
                    ),
                  },
                  {
                    key: 'budget',
                    header: 'งบประมาณ',
                    align: 'right',
                    render: (r) => (
                      <span className="tabular-nums">{formatTHB(r.budgetTHB)}</span>
                    ),
                  },
                  {
                    key: 'paid',
                    header: 'จ่ายแล้ว',
                    align: 'right',
                    render: (r) => (
                      <span
                        className={cx(
                          'font-semibold tabular-nums',
                          r.overBudget ? 'zego-text-danger' : 'zego-text',
                        )}
                      >
                        {formatTHB(r.paidTHB)}
                      </span>
                    ),
                  },
                  {
                    key: 'pending',
                    header: 'รอจ่าย',
                    align: 'right',
                    hideOnMobile: true,
                    render: (r) => (
                      <span className="tabular-nums zego-text-tertiary">
                        {formatTHB(r.pendingTHB)}
                      </span>
                    ),
                  },
                  {
                    key: 'flag',
                    header: 'สถานะงบ',
                    render: (r) =>
                      r.overBudget ? (
                        <span className="zego-badge--danger inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium">
                          <Icon name="warning" className="h-3 w-3" />
                          เกินงบ
                        </span>
                      ) : (
                        <span className="whitespace-nowrap text-xs zego-text-tertiary">อยู่ในงบ</span>
                      ),
                  },
                ] as Column<(typeof perJob)[number]>[]
              }
              rows={perJob}
              rowKey={(r) => r.jobId}
              emptyTitle="ไม่มีงานในช่วงเวลาที่เลือก"
            />
          </Card>
        </div>
      )}

      {tab === 'outstanding' && (
        <Card>
          <CardHeader
            title="เงินทดรองค้างเคลียร์และงานเคลียร์ล่าช้า"
            description="เรียงตามจำนวนวันที่เกินกำหนด"
          />
          <DataTable
            columns={
              [
                {
                  key: 'id',
                  header: 'รายการเคลียร์',
                  render: (r) => (
                    <div className="min-w-0">
                      <p className="font-medium zego-text">{r.id}</p>
                      <p className="truncate text-xs zego-text-tertiary">
                        {r.jobId} · {r.jobTitle}
                      </p>
                    </div>
                  ),
                },
                { key: 'leader', header: 'หัวหน้าทัวร์', render: (r) => r.leaderName },
                {
                  key: 'advance',
                  header: 'เงินทดรอง',
                  align: 'right',
                  render: (r) => <span className="tabular-nums">{formatTHB(r.advanceTHB)}</span>,
                },
                {
                  key: 'net',
                  header: 'ยอดสุทธิ',
                  align: 'right',
                  hideOnMobile: true,
                  render: (r) => (
                    <span
                      className={cx(
                        'tabular-nums',
                        r.netTHB > 0
                          ? 'zego-text-success'
                          : r.netTHB < 0
                            ? 'zego-text-danger'
                            : 'zego-text-tertiary',
                      )}
                    >
                      {r.netTHB === 0 ? 'พอดี' : formatTHB(Math.abs(r.netTHB))}
                    </span>
                  ),
                },
                {
                  key: 'due',
                  header: 'กำหนดเคลียร์',
                  render: (r) => (
                    <div className="whitespace-nowrap">
                      <p className="zego-text-secondary">{formatDate(r.dueDate)}</p>
                      {r.overdueDays > 0 && (
                        <p className="text-xs font-semibold zego-text-danger">
                          เกิน {r.overdueDays} วัน
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'status',
                  header: 'สถานะ',
                  render: (r) => (
                    <StatusBadge meta={SETTLEMENT_STATUS[r.status as SettlementStatus]} size="sm" />
                  ),
                },
              ] as Column<(typeof outstanding)[number]>[]
            }
            rows={outstanding}
            rowKey={(r) => r.id}
            rowClassName={(r) => (r.overdueDays > 14 ? 'bg-rose-50/50' : undefined)}
            emptyIcon="check"
            emptyTitle="ไม่มีเงินทดรองค้างเคลียร์"
          />
        </Card>
      )}

      {tab === 'cuts' && (
        <Card>
          <CardHeader
            title="ค่าใช้จ่ายที่ถูกตัด"
            description={`รวม ${formatTHB(totalCut)} จาก ${cuts.length} รายการ`}
          />
          <DataTable
            columns={
              [
                {
                  key: 'item',
                  header: 'รายการ',
                  render: (r) => (
                    <div className="min-w-0">
                      <p className="font-medium zego-text">{r.expenseType}</p>
                      <p className="truncate text-xs zego-text-tertiary">{r.purpose}</p>
                    </div>
                  ),
                },
                { key: 'leader', header: 'หัวหน้าทัวร์', render: (r) => r.leaderName },
                {
                  key: 'claimed',
                  header: 'ยอดที่แจ้ง',
                  align: 'right',
                  hideOnMobile: true,
                  render: (r) => <span className="tabular-nums">{formatTHB(r.claimedTHB)}</span>,
                },
                {
                  key: 'approved',
                  header: 'อนุมัติ',
                  align: 'right',
                  hideOnMobile: true,
                  render: (r) => <span className="tabular-nums">{formatTHB(r.approvedTHB)}</span>,
                },
                {
                  key: 'cut',
                  header: 'ถูกตัด',
                  align: 'right',
                  render: (r) => (
                    <span className="font-semibold tabular-nums zego-text-danger">
                      −{formatTHB(r.cutTHB)}
                    </span>
                  ),
                },
                {
                  key: 'reason',
                  header: 'เหตุผล',
                  hideOnMobile: true,
                  render: (r) => <span className="text-xs zego-text-secondary">{r.reason}</span>,
                },
              ] as Column<(typeof cuts)[number]>[]
            }
            rows={cuts}
            rowKey={(r) => `${r.settlementId}-${r.purpose}`}
            emptyIcon="check"
            emptyTitle="ยังไม่มีค่าใช้จ่ายที่ถูกตัด"
          />
        </Card>
      )}

      {tab === 'fees' && (
        <Card>
          <CardHeader
            title="ค่าตอบแทนหัวหน้าทัวร์รายเดือน"
            description="คิดตามเดือนที่เดินทางกลับ"
          />
          <BarChart
            data={fees.map((f) => ({
              label: f.label,
              value: f.value,
              color: TONE_HEX.indigo,
              display: formatTHB(f.value),
            }))}
          />
          <p className="zego-divider-top mt-4 pt-3 text-right text-sm">
            <span className="zego-text-tertiary">รวมทั้งช่วง: </span>
            <span className="font-bold tabular-nums zego-text">
              {formatTHB(fees.reduce((sum, f) => sum + f.value, 0))}
            </span>
          </p>
        </Card>
      )}

      {tab === 'documents' && (
        <Card>
          <CardHeader
            title="เอกสารใกล้หมดอายุ"
            description="ภายใน 180 วัน หรือหมดอายุแล้ว (ไม่ขึ้นกับช่วงเวลาที่เลือก)"
          />
          <DataTable
            columns={
              [
                { key: 'leader', header: 'หัวหน้าทัวร์', render: (r) => r.leaderName },
                { key: 'doc', header: 'เอกสาร', render: (r) => r.documentName },
                {
                  key: 'expiry',
                  header: 'วันหมดอายุ',
                  render: (r) => (
                    <span className="whitespace-nowrap">{formatDate(r.expiresAt)}</span>
                  ),
                },
                {
                  key: 'left',
                  header: 'สถานะ',
                  align: 'right',
                  render: (r) => (
                    <span
                      className={cx(
                        'whitespace-nowrap text-xs font-semibold',
                        r.expired
                          ? 'zego-text-danger'
                          : r.daysLeft <= 60
                            ? 'zego-text-warning'
                            : 'zego-text-secondary',
                      )}
                    >
                      {r.expired
                        ? `หมดอายุแล้ว ${Math.abs(r.daysLeft)} วัน`
                        : `เหลือ ${formatNumber(r.daysLeft)} วัน`}
                    </span>
                  ),
                },
              ] as Column<(typeof expiring)[number]>[]
            }
            rows={expiring}
            rowKey={(r) => `${r.leaderId}-${r.documentName}`}
            rowClassName={(r) => (r.expired ? 'bg-rose-50/50' : undefined)}
            emptyIcon="check"
            emptyTitle="ไม่มีเอกสารใกล้หมดอายุ"
          />
        </Card>
      )}

      {tab === 'ratings' && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="คะแนนประเมินหัวหน้าทัวร์" description="คะแนนเต็ม 5.0" />
            <BarChart
              data={ratings.map((r) => ({
                label: r.name,
                value: r.rating,
                color:
                  r.rating >= 4.5 ? TONE_HEX.green : r.rating >= 4 ? TONE_HEX.sky : TONE_HEX.amber,
                display: r.rating.toFixed(1),
              }))}
            />
          </Card>
          <Card>
            <CardHeader title="ตารางคะแนน" />
            <DataTable
              columns={
                [
                  { key: 'name', header: 'หัวหน้าทัวร์', render: (r) => r.name },
                  {
                    key: 'rating',
                    header: 'คะแนน',
                    align: 'right',
                    render: (r) => (
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Icon name="star" className="h-3.5 w-3.5 zego-text-warning" filled />
                        {r.rating.toFixed(1)}
                      </span>
                    ),
                  },
                  {
                    key: 'evals',
                    header: 'ประเมินแล้ว',
                    align: 'right',
                    render: (r) => <span className="tabular-nums">{r.evaluationCount}</span>,
                  },
                  {
                    key: 'jobs',
                    header: 'งานสะสม',
                    align: 'right',
                    hideOnMobile: true,
                    render: (r) => <span className="tabular-nums">{r.totalJobs}</span>,
                  },
                ] as Column<(typeof ratings)[number]>[]
              }
              rows={ratings}
              rowKey={(r) => r.leaderId}
              emptyTitle="ไม่มีข้อมูลคะแนน"
            />
          </Card>

          {/* รายละเอียดกรุ๊ป — ใช้ตารางเดียวกับแท็บ "ผลแบบสอบถาม" ในหน้าหัวหน้าทัวร์ */}
          <div className="lg:col-span-2">
            <TourGroupScoreTable
              rows={groupScoreRows}
              title="รายละเอียดกรุ๊ป"
              description={`${groupScoreRows.length} กรุ๊ป · คะแนนแบบสอบถามรายกรุ๊ป (ชุดข้อมูลเดียวกับ “ผลแบบสอบถาม”)`}
              emptyTitle="ไม่มีกรุ๊ปที่ตรงกับเงื่อนไข"
            />
          </div>
        </div>
      )}
    </>
  );
}
