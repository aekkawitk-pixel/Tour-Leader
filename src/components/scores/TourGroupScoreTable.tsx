'use client';

/**
 * TourGroupScoreTable — ตารางคะแนนกรุ๊ปที่ใช้ร่วมกัน
 *
 * ใช้ 2 ที่: "รายละเอียดกรุ๊ป" (เมนูรายงาน) และ "ผลแบบสอบถาม" (หน้ารายละเอียดหัวหน้าทัวร์)
 * → ชื่อคอลัมน์ รูปแบบคะแนน การคำนวณ การเรียง และหน้ารายละเอียด เหมือนกันทั้งหมด
 *   แก้ที่นี่ที่เดียว มีผลทั้งสองที่พร้อมกัน
 *
 * คะแนนทั้งหมดมาจาก groupScoreStore ชุดเดียว — ไม่มีการเก็บ/คำนวณซ้ำแยกกัน
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Button, Card, CardHeader, Callout, cx } from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Drawer } from '@/components/ui/Modal';
import { Icon, type IconName } from '@/components/ui/Icon';
import { MultiSelectControl } from '@/components/ui/MultiSelect';
import { formatDate, formatDateRange } from '@/lib/format';
import {
  formatRate, formatRespondents, formatScore,
} from '@/lib/logic/groupScore';
import {
  filterGroupScoreRows, groupScoreFilterOptions,
  type GroupScoreFilters, type TourGroupScoreRow,
} from '@/lib/logic/tourGroupScoreRows';
import type { SaleStatus } from '@/data/schedule/types';
import { getScoreScale, hasSurveyData } from '@/services/groupScoreStore';
import { SCORE_CATEGORIES, SCORE_CATEGORY_FULL, SCORE_CATEGORY_LABEL } from '@/data/scores/groupScoreTypes';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';

/**
 * จอแคบลง → ซ่อนคะแนนรายหัวข้อก่อน (ประเทศ/เส้นทาง/วันเดินทาง/คะแนนรวม/Action ไม่ถูกซ่อน)
 * ตั้งจุดตัดให้ทุกคอลัมน์ที่เหลือ "พอดีความกว้าง" จริง — ไม่ให้เกิดแถบเลื่อนแนวนอนบนเดสก์ท็อป
 *   • ≥1536px (2xl) เห็นครบทุกหัวข้อ
 *   • 1280-1535px เห็น TL/Guide
 *   • <1024px เห็นเฉพาะคอลัมน์สำคัญ (กดดูรายละเอียดเพิ่มเติมได้)
 */
export function TourGroupScoreTable({
  rows,
  title,
  description,
  emptyTitle = 'ยังไม่มีกรุ๊ปที่ตรงกับเงื่อนไข',
  emptyDescription,
}: {
  rows: TourGroupScoreRow[];
  title: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [filters, setFilters] = useState<GroupScoreFilters>({});
  const [detail, setDetail] = useState<TourGroupScoreRow | null>(null);

  const options = useMemo(() => groupScoreFilterOptions(rows), [rows]);
  const visible = useMemo(() => filterGroupScoreRows(rows, filters), [rows, filters]);
  const scale = getScoreScale();
  const surveyReady = hasSurveyData();

  const set = <K extends keyof GroupScoreFilters>(key: K, value: GroupScoreFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const columns: Column<TourGroupScoreRow>[] = [
    {
      key: 'group',
      header: 'กรุ๊ป',
      width: '25%',
      className: 'px-2',
      headerClassName: 'px-2',
      sortValue: (r) => `${r.countryName} ${r.groupCode}`,
      render: (r) => (
        <div className="min-w-0">
          <p className="zego-text truncate text-sm font-semibold uppercase">
            {r.countryName || '—'}
            <span className="zego-text-tertiary font-normal"> · {r.routeCode ?? '—'}</span>
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span
              aria-hidden
              className={cx('h-1.5 w-1.5 shrink-0 rounded-full', r.respondents === 0 ? 'zego-dot--danger' : 'zego-dot--success')}
            />
            <span className="zego-text-secondary truncate font-mono text-xs">{r.groupCode || '—'}</span>
            {r.comments.length > 0 && (
              <span title="มีข้อเสนอแนะจากลูกค้า" className="zego-text-success shrink-0">
                <Icon name="chat" className="h-3.5 w-3.5" />
              </span>
            )}
            <SaleBadge status={r.saleStatus} />
            {/* สร้างแถวตั้งแต่มีงาน — ต้องบอกให้ชัดว่ายังไม่เดินทาง ไม่ใช่เดินทางแล้วแต่ไม่มีคะแนน */}
            {r.travelled === false && (
              <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-medium', TONE_ZEGO_BADGE.sky)}>ยังไม่เดินทาง</span>
            )}
            {/* ไม่มีใครตอบแบบสอบถามเลย — ต่างจาก "ยังไม่ได้นำเข้าไฟล์" จึงต้องเห็นได้ทันที */}
            {surveyReady && r.travelled !== false && r.respondents === 0 && (
              <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-medium', TONE_ZEGO_BADGE.red)}>No Resp</span>
            )}
          </p>
          {/* ชื่อโปรแกรม — สร้างแถวได้ตั้งแต่มีงาน แล้วรอคะแนนมาเติมทีหลัง */}
          {r.programName && (
            <p className="zego-text-tertiary truncate text-xs" title={r.programName}>{r.programName}</p>
          )}
        </div>
      ),
    },
    {
      key: 'departDate',
      header: 'วันเดินทาง / TL',
      width: '16%',
      headerWrap: true,
      className: 'px-2',
      headerClassName: 'px-2',
      sortValue: (r) => r.departDate,
      render: (r) => (
        <div className="min-w-0">
          <p className="zego-text tabular-nums">
            {r.departDate ? formatDateRange(r.departDate, r.returnDate ?? r.departDate) : '—'}
          </p>
          <p className="zego-text-tertiary truncate text-xs">
            {r.leaderName ? `คุณ ${r.leaderName}` : 'ยังไม่ระบุหัวหน้าทัวร์'}
          </p>
        </div>
      ),
    },
    {
      key: 'pax',
      header: 'ผู้ตอบ / Pax',
      align: 'center',
      width: '10%',
      headerWrap: true,
      className: 'px-2',
      headerClassName: 'px-2',
      sortValue: (r) => r.respondents,
      render: (r) => (
        <div>
          <p className={cx('tabular-nums', r.respondents === 0 ? 'font-medium zego-text-danger' : 'zego-text')}>
            {formatRespondents(r.respondents, r.travelers)}
          </p>
          {/* ตอบ 0 คน (แต่รู้จำนวน Pax) → 0.00% · ไม่ทราบ Pax → — */}
          <p className="zego-text-tertiary text-xs tabular-nums">{formatRate(r.responseRatePct)}</p>
        </div>
      ),
    },
    ...SCORE_CATEGORIES.map<Column<TourGroupScoreRow>>((cat) => ({
      key: cat,
      header: SCORE_CATEGORY_LABEL[cat],
      align: 'center',
      width: '6%',
      headerWrap: true,
      className: 'px-1',
      headerClassName: 'px-1',
      sortValue: (r) => r.scores[cat],
      render: (r) => <ScorePill value={r.scores[cat]} />,
    })),
    {
      /* "รวม" อยู่ท้ายสุดต่อจากคะแนนรายหมวด — อ่านซ้ายไปขวาแล้วจบที่ผลรวม */
      key: 'overall',
      header: 'รวม',
      align: 'center',
      width: '7%',
      headerWrap: true,
      className: 'px-1',
      headerClassName: 'px-1',
      sortValue: (r) => r.overall,
      render: (r) => <ScorePill value={r.overall} strong />,
    },
  ];

  return (
    <>
      <Card>
        <CardHeader
          title={title}
          description={description ?? `${visible.length} กรุ๊ป · ${scale.label}`}
        />

        {!surveyReady && (
          <div className="mb-3">
            <Callout tone="amber" title="ยังไม่ได้นำเข้าข้อมูลแบบสอบถาม">
              คอลัมน์คะแนนทั้งหมดจึงแสดง “—” — โครงสร้างตารางพร้อมใช้งานแล้ว เมื่อนำเข้าไฟล์แบบสอบถามจริง
              คะแนนจะคำนวณและแสดงทันทีทั้งหน้านี้และ “ผลแบบสอบถาม” จากข้อมูลชุดเดียวกัน
            </Callout>
          </div>
        )}

        {/*
          แถบตัวกรอง — อ่านอย่างเดียว ใช้ย่อว่าจะแสดงแถวไหนเท่านั้น
          ไม่เขียนค่าลงกรุ๊ปหรือที่เก็บใด ๆ (ผลแบบสอบถามคำนวณจากกรุ๊ปที่มอบหมายจริง)
          จึงจงใจไม่ใช้หน้าตาแบบฟอร์ม — ไม่มีป้าย "ไม่บังคับ" ซึ่งเป็นภาษาของช่องกรอกข้อมูล
        */}
        <div className="mb-4 flex flex-wrap items-end gap-x-3 gap-y-3">
          <FilterField icon="filter" label="ประเทศ" className="w-[128px]">
            <PillSelect
              value={filters.country ?? ''}
              onChange={(v) => set('country', v || undefined)}
              placeholder="All Country"
              options={options.countries.map((c) => ({ value: c, label: c }))}
            />
          </FilterField>

          <FilterField icon="search" label="ค้นหารายการทัวร์ | รหัสกรุ๊ป" className="min-w-[176px] flex-1">
            <div className="relative">
              <Icon name="search" className="zego-text-tertiary pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
              <input
                value={filters.keyword ?? ''}
                onChange={(e) => set('keyword', e.target.value || undefined)}
                placeholder="ชื่อโปรแกรมทัวร์ | รหัสกรุ๊ป"
                className={cx(
                  'h-10 w-full rounded-full border zego-border-color zego-surface-bg pl-9 pr-3 text-sm zego-text',
                  'placeholder:text-[var(--zego-text-tertiary)] focus:border-[var(--zego-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--zego-focus)]',
                )}
              />
            </div>
          </FilterField>

          <FilterField icon="calendar" label="ปี (หลังเดินทาง)" className="w-[128px]">
            <PillSelect
              value={filters.year ?? ''}
              onChange={(v) => set('year', v || undefined)}
              placeholder="ทุกปี"
              options={options.years.map((y) => ({ value: y, label: y }))}
            />
          </FilterField>

          {/* เลือกได้หลายเดือน — เช่นดูเฉพาะไฮซีซัน ต.ค.–ธ.ค. โดยไม่ต้องกรองทีละเดือน */}
          <FilterField icon="calendar" label="เดือน" className="w-[152px]">
            <MultiSelectControl
              ariaLabel="เดือนที่เดินทาง"
              value={filters.months ?? []}
              onChange={(next) => set('months', next.length > 0 ? next : undefined)}
              options={MONTH_OPTIONS}
              allLabel="ทั้งปี"
              summaryAfter={1}
              summaryFormat={(n) => `${n} เดือน`}
              triggerClassName={PILL_TRIGGER}
              panelClassName="w-max min-w-full"
            />
          </FilterField>

          <FilterField icon="filter" label="เส้นทาง" className="w-[124px]">
            <PillSelect
              value={filters.routeCode ?? ''}
              onChange={(v) => set('routeCode', v || undefined)}
              placeholder="ทุกเส้นทาง"
              options={options.routes.map((r) => ({ value: r, label: r }))}
            />
          </FilterField>

          <FilterField icon="chart" label="คะแนน" className="w-auto">
            <div className="zego-border-color zego-surface-bg inline-flex h-10 items-center rounded-full border p-1">
              {([['all', 'ทั้งหมด'], ['scored', 'มีคะแนนแล้ว'], ['unscored', 'ยังไม่มีคะแนน']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={(filters.scoreState ?? 'all') === v}
                  onClick={() => set('scoreState', v)}
                  className={cx(
                    'rounded-full px-2 py-1 text-[11px] transition-colors',
                    (filters.scoreState ?? 'all') === v
                      ? 'zego-selected-fill font-medium'
                      : 'zego-text-secondary zego-hover-surface',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </FilterField>

          {(filters.country || filters.routeCode || filters.keyword || filters.year || filters.months?.length
            || (filters.scoreState && filters.scoreState !== 'all')) && (
            <Button size="sm" variant="ghost" onClick={() => setFilters({})}>ล้างตัวกรอง</Button>
          )}
        </div>
        {/* คะแนนครบทุกหมวดต้องเห็นเสมอ และต้องพอดีกรอบ — ไม่มีแถบเลื่อนซ้ายขวา */}
        <DataTable
          columns={columns}
          rows={visible}
          rowKey={(r) => r.key}
          onRowClick={(r) => setDetail(r)}
          rowClassName={(r) => (surveyReady && r.travelled !== false && r.respondents === 0 ? 'zego-warned-tint' : undefined)}
          defaultSortKey="departDate"
          defaultSortDir="desc"
          layout="fixed"
          minWidthClass=""
          keepHeaderWhenEmpty
          emptyIcon="chart"
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
        />
      </Card>

      <GroupScoreDetail row={detail} onClose={() => setDetail(null)} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** §12 รายละเอียดคะแนนกรุ๊ป */
function GroupScoreDetail({ row, onClose }: { row: TourGroupScoreRow | null; onClose: () => void }) {
  const scale = getScoreScale();
  if (!row) return null;

  return (
    <Drawer open={!!row} onClose={onClose} title="รายละเอียดคะแนนกรุ๊ป" description={row.groupCode} size="xl">
      <div className="space-y-5">
        {/* ข้อมูลกรุ๊ป */}
        <section>
          <h3 className="zego-text mb-2 text-sm font-semibold">ข้อมูลกรุ๊ป</h3>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="รหัสกรุ๊ป" value={<span className="font-mono">{row.groupCode || '—'}</span>} />
            <Row label="ประเทศ" value={row.countryName || '—'} />
            <Row label="รหัสเส้นทาง" value={row.routeCode ?? '—'} />
            <Row
              label="วันเดินทาง"
              value={row.departDate ? (row.returnDate ? formatDateRange(row.departDate, row.returnDate) : formatDate(row.departDate)) : '—'}
            />
            <Row label="หัวหน้าทัวร์" value={row.leaderName ?? '—'} />
            <Row label="จำนวนผู้เดินทาง" value={row.travelers !== null ? `${row.travelers} ท่าน` : '—'} />
            <Row label="จำนวนผู้ตอบแบบสอบถาม" value={`${row.respondents} ท่าน`} />
            <Row label="อัตราการตอบ" value={formatRate(row.responseRatePct)} />
          </dl>
        </section>

        {/* คะแนน */}
        <section>
          <h3 className="zego-text mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
            คะแนน
            <span className="zego-text-tertiary text-xs font-normal">{scale.label}</span>
          </h3>
          <div className="zego-surface-soft-bg mb-3 rounded-xl px-4 py-3">
            <p className="zego-text-tertiary text-xs">คะแนนรวม (เฉลี่ยจากหัวข้อที่ประเมินจริง)</p>
            <p className={cx('text-2xl font-bold tabular-nums', row.overall === null ? 'zego-text-disabled' : 'zego-text')}>
              {formatScore(row.overall)}
            </p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {SCORE_CATEGORIES.map((cat) => (
              <li key={cat} className="zego-border-color flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                <span className="min-w-0">
                  <span className="zego-text text-sm font-medium">{SCORE_CATEGORY_LABEL[cat]}</span>
                  <span className="zego-text-tertiary ml-1.5 text-xs">{SCORE_CATEGORY_FULL[cat]}</span>
                </span>
                <span className={cx('tabular-nums font-semibold', row.scores[cat] === null ? 'zego-text-disabled' : 'zego-text')}>
                  {formatScore(row.scores[cat])}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* คำตอบแบบสอบถาม */}
        <section>
          <h3 className="zego-text mb-2 text-sm font-semibold">คำตอบแบบสอบถาม ({row.responses.length})</h3>
          {row.responses.length === 0 ? (
            <p className="zego-surface-soft-bg zego-text-tertiary rounded-lg px-3 py-2 text-sm">
              ยังไม่มีแบบสอบถามของกรุ๊ปนี้ในระบบ
            </p>
          ) : (
            <ul className="space-y-2">
              {row.responses.map((res) => (
                <li key={res.surveyResponseId} className="zego-border-color rounded-lg border px-3 py-2">
                  <p className="zego-text-tertiary flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono">{res.surveyResponseId}</span>
                    {res.submittedAt && <span>ตอบเมื่อ {formatDate(res.submittedAt.slice(0, 10))}</span>}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {res.answers.map((a) => (
                      <span key={a.category} className={cx('rounded px-1.5 py-0.5 text-[11px]', TONE_ZEGO_BADGE.slate)}>
                        {SCORE_CATEGORY_LABEL[a.category]} {a.score.toFixed(2)}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ข้อเสนอแนะ */}
        <section>
          <h3 className="zego-text mb-2 text-sm font-semibold">ข้อเสนอแนะจากลูกค้า ({row.comments.length})</h3>
          {row.comments.length === 0 ? (
            <p className="zego-surface-soft-bg zego-text-tertiary rounded-lg px-3 py-2 text-sm">ไม่มีข้อเสนอแนะ</p>
          ) : (
            <ul className="space-y-2">
              {row.comments.map((c) => (
                <li key={c.surveyResponseId} className={cx('rounded-lg px-3 py-2 text-sm border', TONE_ZEGO_BADGE.amber)}>
                  <span className="zego-text-tertiary mr-1.5 font-mono text-[11px]">{c.surveyResponseId}</span>
                  {c.comment}
                </li>
              ))}
            </ul>
          )}
        </section>

        {row.overall === null && (
          <Callout tone="blue" title="กรุ๊ปนี้ยังไม่มีผลแบบสอบถาม">
            เมื่อนำเข้าแบบสอบถามของกรุ๊ปนี้ ระบบจะคำนวณคะแนนให้อัตโนมัติ — ไม่ต้องกรอกคะแนนซ้ำ
          </Callout>
        )}
      </div>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="zego-text-tertiary w-40 shrink-0">{label}</dt>
      <dd className="zego-text-secondary min-w-0 flex-1">{value}</dd>
    </div>
  );
}

/* --------------------------- ส่วนประกอบย่อยของตาราง --------------------------- */

const MONTH_OPTIONS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
].map((label, i) => ({ value: String(i + 1).padStart(2, '0'), label }));

/** ช่องตัวกรอง 1 ช่อง — ไอคอน + ชื่อช่องอยู่เหนือตัวควบคุม */
function FilterField({
  icon, label, className, children,
}: { icon: IconName; label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="zego-text-secondary inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
        <Icon name={icon} className="zego-text-tertiary h-4 w-4" />
        {label}
      </span>
      {children}
    </label>
  );
}

/** ทรงแคปซูลของแถบตัวกรอง — ใช้ทั้ง <select> และปุ่มเลือกหลายค่า ให้สูง/ขอบตรงกันทั้งแถว */
const PILL_TRIGGER =
  'flex h-10 w-full items-center justify-between gap-2 rounded-full border zego-border-color zego-surface-bg px-3 text-left text-sm';

/** ตัวเลือกทรงแคปซูล — ตัวเลือกแรกคือ "ทั้งหมด" ของช่องนั้น (ค่าว่าง) */
function PillSelect({
  value, onChange, placeholder, options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx(
        'h-10 w-full rounded-full border zego-border-color zego-surface-bg px-3 text-sm zego-text',
        'focus:border-[var(--zego-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--zego-focus)]',
      )}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** ป้ายสถานะขายของพีเรียด (มาจาก Tour Period Master — ไม่ได้คำนวณที่นี่) */
function SaleBadge({ status }: { status: SaleStatus }) {
  const meta: Record<SaleStatus, { label: string; cls: string }> = {
    SELL: { label: 'Sell', cls: TONE_ZEGO_BADGE.green },
    NO_SELL: { label: 'No Sell', cls: TONE_ZEGO_BADGE.slate },
    CLOSED: { label: 'Closed', cls: TONE_ZEGO_BADGE.amber },
  };
  const m = meta[status];
  if (!m) return null;
  return <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-medium', m.cls)}>{m.label}</span>;
}

/**
 * เม็ดคะแนน — สีบอกระดับคร่าว ๆ โดยไม่ต้องอ่านตัวเลขทีละช่อง
 * ยังไม่มีคะแนน (null) แสดง "—" แบบจาง ไม่ใช่ 0.00 ซึ่งจะอ่านเป็นคะแนนแย่
 */
function ScorePill({ value, strong = false }: { value: number | null; strong?: boolean }) {
  if (value === null) return <span className="zego-text-disabled tabular-nums">—</span>;
  const tone = value >= 9
    ? TONE_ZEGO_BADGE.green
    : value >= 8
      ? TONE_ZEGO_BADGE.blue
      : TONE_ZEGO_BADGE.amber;
  return (
    <span
      className={cx(
        'inline-flex justify-center rounded-full px-1.5 py-0.5 text-xs tabular-nums',
        tone, strong && 'font-semibold',
      )}
    >
      {formatScore(value)}
    </span>
  );
}
