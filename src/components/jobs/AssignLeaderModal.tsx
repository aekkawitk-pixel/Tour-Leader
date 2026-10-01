'use client';

/**
 * เลือกหัวหน้าทัวร์ให้งาน
 * แสดงคะแนนความเหมาะสม (เส้นทาง + ภาษา + ความถนัดกรุ๊ป + คะแนน + สถานะ + ตารางว่าง)
 * พร้อมเหตุผลที่ตรวจสอบได้ และคำเตือนเมื่อมีความเสี่ยง
 */

import { useMemo, useState } from 'react';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import {
  Avatar,
  Button,
  Callout,
  cx,
  EmptyState,
  StatusBadge,
} from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { matchLabel, rankLeaders } from '@/lib/logic/matching';
import { sortByPreference } from '@/lib/logic/preferredGuideOrder';
import { usePreferredGuideOrder } from '@/lib/usePreferredGuideOrder';
import { useExcludedGuides } from '@/lib/useExcludedGuides';
import { useFavoriteGuides } from '@/lib/useFavoriteGuides';
import { LEADER_STATUS } from '@/lib/labels';
import { formatDateRange } from '@/lib/format';
import { jobAirportCodes, leaderSearchText } from '@/lib/logic/leaderProfile';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';
import type { TourJob } from '@/types';

export function AssignLeaderModal({
  open,
  onClose,
  job,
}: {
  open: boolean;
  onClose: () => void;
  job: TourJob | null;
}) {
  if (!open || !job) return null;
  return <AssignLeaderForm key={job.id} onClose={onClose} job={job} />;
}

function AssignLeaderForm({ onClose, job }: { onClose: () => void; job: TourJob }) {
  const { leaders, jobs, countries, routes, today, assignLeader, saving } = useDemo();
  const { order: preferredOrder } = usePreferredGuideOrder();
  const { excluded } = useExcludedGuides();
  const { favorited } = useFavoriteGuides();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(job.leaderId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmConflict, setConfirmConflict] = useState(false);

  const ranked = useMemo(
    () => rankLeaders(leaders, job, { countries, routes, allJobs: jobs, today }),
    [leaders, job, countries, routes, jobs, today],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = ranked.filter((match) => {
      // ไม่ถูกตัดออก — ยกเว้นคนที่ถูกจัดไว้แล้วในงานนี้ ยังต้องเห็นสถานะปัจจุบันของตัวเอง
      if (excluded.has(match.leaderId) && match.leaderId !== job.leaderId) return false;
      if (!q) return true;
      const leader = leaders.find((l) => l.id === match.leaderId);
      return leader ? leaderSearchText(leader).includes(q) : false;
    });
    // ปักดาว/ลำดับไกด์ที่ผู้ใช้คนนี้ตั้งไว้เอง (Preferred Guide List) — ใช้เป็นเกณฑ์เรียงหลัก ถ้าตั้งไว้
    return sortByPreference(filtered, favorited, preferredOrder, (match) => match.leaderId);
  }, [ranked, leaders, query, preferredOrder, excluded, job.leaderId, favorited]);

  const selectedMatch = ranked.find((m) => m.leaderId === selected);
  const airports = jobAirportCodes(job);

  const doAssign = async () => {
    if (!selected) return;
    await assignLeader(job.id, selected, 'จัดหัวหน้าทัวร์จากหน้ารายละเอียดงาน');
    setConfirmConflict(false);
    onClose();
  };

  const submit = () => {
    if (!selected) return;
    if (selectedMatch?.hasConflict) {
      setConfirmConflict(true);
      return;
    }
    void doAssign();
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="xl"
        title="เลือกหัวหน้าทัวร์"
        description={`${job.id} · ${job.title} · ${formatDateRange(job.departDate, job.returnDate)}`}
        footer={
          <>
            {job.leaderId && (
              <Button
                variant="ghost"
                onClick={async () => {
                  await assignLeader(job.id, null, 'ถอดหัวหน้าทัวร์ออกจากงาน');
                  onClose();
                }}
                disabled={saving}
              >
                ถอดหัวหน้าทัวร์ออก
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submit} loading={saving} disabled={!selected}>
              ยืนยันการจัดคน
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="ค้นหาชื่อหรือรหัสหัวหน้าทัวร์"
            label="ค้นหาหัวหน้าทัวร์"
          />

          <div className="rounded-lg zego-surface-soft-bg px-3 py-2.5 text-xs zego-text-secondary">
            เกณฑ์การจับคู่งานนี้: ประเทศ{' '}
            <strong className="zego-text">{job.country}</strong>
            {airports.length > 0 && (
              <>
                {' '}
                · เส้นทาง{' '}
                <strong className="font-mono zego-text">{airports.join(', ')}</strong>
              </>
            )}
            {job.customerGroup && (
              <>
                {' '}
                · ประเภทกรุ๊ป <strong className="zego-text">{job.customerGroup}</strong>
              </>
            )}
            {' · '}เดินทาง {formatDateRange(job.departDate, job.returnDate)}
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon="search"
              title="ไม่พบหัวหน้าทัวร์ที่ตรงกับคำค้นหา"
              description="ลองค้นด้วยชื่อหรือรหัสอื่น"
            />
          ) : (
            <ul className="space-y-2">
              {visible.map((match) => {
                const leader = leaders.find((l) => l.id === match.leaderId)!;
                const label = matchLabel(match.score);
                const isSelected = selected === leader.id;
                const isExpanded = expanded === leader.id;

                return (
                  <li key={leader.id}>
                    <div
                      className={cx(
                        'rounded-xl border transition-colors',
                        isSelected
                          ? 'zego-selected-border zego-selected-tint'
                          : 'zego-border-color zego-hover-surface',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelected(leader.id)}
                        aria-pressed={isSelected}
                        className="flex w-full items-start gap-3 p-3 text-left"
                      >
                        <Avatar
                          initials={leader.avatarInitials}
                          color={leader.avatarColor}
                          src={leader.photoUrl}
                          alt={`รูปของ ${leader.firstName} ${leader.lastName}`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium zego-text">
                              {leader.firstName} {leader.lastName}
                            </span>
                            <span className="text-xs zego-text-tertiary">{leader.id}</span>
                            <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />
                          </div>

                          {/* เหตุผลที่ตรวจสอบได้ */}
                          {match.reasons.length > 0 && (
                            <ul className="mt-2 space-y-0.5">
                              {match.reasons.map((reason) => (
                                <li
                                  key={reason}
                                  className="flex items-start gap-1.5 text-xs zego-text-success"
                                >
                                  <Icon name="check" className="mt-0.5 h-3 w-3 shrink-0" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          )}

                          {/* คำเตือน */}
                          {match.warnings.length > 0 && (
                            <ul className="mt-2 space-y-0.5">
                              {match.warnings.map((warning) => (
                                <li
                                  key={warning}
                                  className="flex items-start gap-1.5 text-xs font-medium zego-text-danger"
                                >
                                  <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />
                                  {warning}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        <div className="shrink-0 text-center">
                          <span
                            className={cx(
                              'block rounded-lg border px-2.5 py-1 text-sm font-bold tabular-nums',
                              TONE_ZEGO_BADGE[label.tone],
                            )}
                          >
                            {match.score}%
                          </span>
                          <span className="mt-1 block text-[11px] zego-text-tertiary">
                            {label.label}
                          </span>
                        </div>
                      </button>

                      {/* รายละเอียดคะแนนแต่ละเกณฑ์ — ตรวจสอบที่มาของคะแนนได้ */}
                      <div className="zego-divider-top px-3 py-1.5">
                        <button
                          type="button"
                          onClick={() => setExpanded(isExpanded ? null : leader.id)}
                          aria-expanded={isExpanded}
                          className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium zego-icon-btn"
                        >
                          ดูที่มาของคะแนน
                          <Icon
                            name="chevronDown"
                            className={cx('h-3 w-3 transition-transform', isExpanded && 'rotate-180')}
                          />
                        </button>

                        {isExpanded && (
                          <ul className="mt-1.5 space-y-1 pb-2">
                            {match.factors.map((factor) => (
                              <li
                                key={factor.key}
                                className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 text-[11px]"
                              >
                                <span className="zego-text-tertiary">{factor.key}</span>
                                <span className="h-1.5 overflow-hidden rounded-full zego-surface-soft-bg">
                                  <span
                                    className="block h-full rounded-full zego-meter-fill"
                                    style={{
                                      width: `${Math.round((factor.earned / factor.max) * 100)}%`,
                                    }}
                                  />
                                </span>
                                <span className="tabular-nums font-semibold zego-text-secondary">
                                  {factor.earned}/{factor.max}
                                </span>
                                <span className="col-span-3 -mt-0.5 zego-text-tertiary">
                                  {factor.detail}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {selectedMatch && !selectedMatch.documentsValid && (
            <Callout tone="amber" title="เอกสารเดินทางมีความเสี่ยง">
              หนังสือเดินทางของคนที่เลือกเหลืออายุน้อยกว่า 6 เดือน ณ วันเดินทาง
            </Callout>
          )}

          {selectedMatch?.hasConflict && (
            <Callout tone="red" title="หัวหน้าทัวร์ที่เลือกมีตารางงานซ้อน">
              {selectedMatch.warnings.find((w) => w.startsWith('มีงานอื่น'))}
              {' — '}ระบบจะให้ยืนยันอีกครั้งก่อนบันทึก
            </Callout>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmConflict}
        onClose={() => setConfirmConflict(false)}
        onConfirm={doAssign}
        loading={saving}
        tone="danger"
        title="ยืนยันการจัดคนทั้งที่ตารางซ้อน"
        confirmLabel="ยืนยัน จัดคนนี้"
        message={`หัวหน้าทัวร์ที่เลือกมีงานอื่นในช่วงเวลาเดียวกัน (${
          selectedMatch?.warnings.find((w) => w.startsWith('มีงานอื่น')) ?? ''
        }) ต้องการดำเนินการต่อหรือไม่? งานนี้จะถูกทำเครื่องหมายว่ามีตารางซ้อนในระบบ`}
      />
    </>
  );
}
