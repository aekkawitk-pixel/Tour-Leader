'use client';

/**
 * §3/§4/§5 จัดการรายชื่อหัวหน้าทัวร์ประจำเดือน — Drawer 2 ฝั่ง
 *   ซ้าย: หัวหน้าทัวร์ทั้งหมด (ค้นหา + ตัวกรองรูปแบบการร่วมงาน + checkbox)
 *   ขวา: รายชื่อที่เลือก (ลำดับ + จำนวนงาน + นำออก + จัดลำดับ)
 * ปุ่ม: เลือกทั้งหมดจากผลค้นหา · นำออกทั้งหมด · คัดลอกจากเดือนก่อน · ใช้รายชื่อแนะนำ · ยกเลิก · บันทึกรายชื่อ
 *
 * ตัวกรองฝั่งซ้ายใช้ "รูปแบบการร่วมงาน" (leaderType) เท่านั้น — ค่าเดียวกับ LEADER_TYPE
 * ที่ใช้ในหน้ารายการ/โปรไฟล์/Schedule ทั้งระบบ
 *
 * มีผลเฉพาะการแสดงผล — ไม่แตะ Master/สถานะ/งาน/วันลา (§9/§10)
 */

import { useMemo, useState } from 'react';
import { Drawer, Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button, StatusBadge, cx, EmptyState } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { SearchBox } from '@/components/ui/FormField';
import { LEADER_STATUS, LEADER_TYPE, LEADER_TYPE_ORDER } from '@/lib/labels';
import {
  countRosterCandidatesByType,
  filterRosterCandidates,
  ROSTER_TYPE_FILTER_DEFAULT,
  type RosterLeaderInfo,
  type RosterTypeFilter,
} from '@/lib/logic/monthRoster';
import type { TourLeader } from '@/types';

/** ข้อมูลหัวหน้าทัวร์ 1 คนสำหรับหน้าจัดการ (parent เตรียมให้) */
export interface RosterCandidate {
  id: string;
  name: string;
  nickname: string;
  status: TourLeader['status'];
  leaderType: TourLeader['leaderType'];
  expertise: string; // ประเทศ/เส้นทางที่เชี่ยวชาญ (ย่อ)
  leaveText: string | null;
  info: RosterLeaderInfo;
  searchText: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** true = แก้ไขรายชื่อเดิม · false = กำหนดรายชื่อครั้งแรก (§1/§2) */
  isEdit?: boolean;
  monthLabel: string;
  previousMonthLabel: string;
  candidates: RosterCandidate[];
  /** id ที่เลือกไว้ (ตามลำดับ) เมื่อเปิด Drawer */
  initialSelected: string[];
  /** id จากเดือนก่อน (สำหรับปุ่มคัดลอก) */
  previousMonthIds: string[];
  /** id แนะนำ (§5) */
  suggestedIds: string[];
  /** ไกด์ที่ผู้ใช้คนนี้ปักดาวไว้ — ใช้กรอง "ไกด์ของฉัน" + แสดงดาวกำกับรายชื่อในลิสต์ */
  favorited: Set<string>;
  onSave: (orderedIds: string[]) => void;
}

const searchTextOf = (c: RosterCandidate) => c.searchText;
const typeOf = (c: RosterCandidate) => c.leaderType;

export function MonthRosterDrawer({
  open, onClose, isEdit = false, monthLabel, previousMonthLabel, candidates, initialSelected, previousMonthIds, suggestedIds, favorited, onSave,
}: Props) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [search, setSearch] = useState('');
  // ค่าเริ่มต้น = หัวหน้าทัวร์ประจำ ทุกครั้งที่เปิดหน้าต่าง — parent ใส่ key ให้ component
  // remount ตอนเปิด (เช่นเดียวกับ selected/search) จึงกลับมาเป็นค่านี้เสมอ
  const [filter, setFilter] = useState<RosterTypeFilter>(ROSTER_TYPE_FILTER_DEFAULT);
  // "ไกด์ของฉัน" — เลือกแล้วแสดงคนที่ปักดาวไว้ทุกรูปแบบการร่วมงาน (ไม่ AND กับ chip รูปแบบ ไม่งั้นค่าเริ่มต้น
  // "หัวหน้าทัวร์ประจำ" ที่ไม่มีคนจะทำให้ไกด์ของฉันเป็น 0 เสมอ) · กดรูปแบบใด ๆ = ออกจากโหมดนี้
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [confirmCopy, setConfirmCopy] = useState(false);
  const dirty = useMemo(() => JSON.stringify(selected) !== JSON.stringify(initialSelected), [selected, initialSelected]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const byId = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filteredLeftByType = useMemo(
    () => filterRosterCandidates(candidates, search, filter, searchTextOf, typeOf),
    [candidates, search, filter],
  );
  // ไกด์ของฉันที่ตรงคำค้นหา (ทุกรูปแบบการร่วมงาน) — ใช้ทั้งเป็นรายการและเลขบน chip ให้ตรงกับที่จะเห็นเมื่อกด
  const favoriteMatches = useMemo(
    () => filterRosterCandidates(candidates, search, 'all', searchTextOf, typeOf).filter((c) => favorited.has(c.id)),
    [candidates, search, favorited],
  );
  const filteredLeft = favoritesOnly ? favoriteMatches : filteredLeftByType;

  // จำนวนต่อตัวกรอง — นับจากข้อมูลจริงหลังใช้คำค้นหาแล้ว (§10)
  const typeCounts = useMemo(
    () => countRosterCandidatesByType(candidates, search, searchTextOf, typeOf),
    [candidates, search],
  );
  const favoritesCount = favoriteMatches.length;

  const toggle = (id: string) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const move = (idx: number, dir: -1 | 1) => setSelected((prev) => {
    const next = [...prev];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return prev;
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });

  const selectAllFromSearch = () => setSelected((prev) => {
    const next = [...prev];
    for (const c of filteredLeft) if (!next.includes(c.id)) next.push(c.id);
    return next;
  });
  const removeAll = () => setSelected([]);
  const useSuggested = () => setSelected(suggestedIds.filter((id) => byId.has(id)));
  const applyCopy = () => { setSelected((prev) => { const next = [...prev]; for (const id of previousMonthIds) if (byId.has(id) && !next.includes(id)) next.push(id); return next; }); setConfirmCopy(false); };
  const replaceCopy = () => { setSelected(previousMonthIds.filter((id) => byId.has(id))); setConfirmCopy(false); };

  const attemptClose = () => { if (dirty) setConfirmDiscard(true); else onClose(); };

  return (
    <>
      <Drawer
        open={open}
        onClose={attemptClose}
        title={`${isEdit ? 'แก้ไขรายชื่อหัวหน้าทัวร์' : 'กำหนดรายชื่อหัวหน้าทัวร์'} — ${monthLabel}`}
        description={isEdit
          ? 'รายชื่อเดิมถูกเลือกไว้ให้แล้ว — เพิ่มคนใหม่หรือนำบางคนออกได้ ระบบบันทึกเฉพาะส่วนที่เปลี่ยน (ไม่เปลี่ยนสถานะ/งาน/วันลา)'
          : 'เลือกหัวหน้าทัวร์ที่จะแสดงในหน้า Schedule ของเดือนนี้ เพิ่มจากไกด์ของฉัน (คนที่ปักดาวไว้แสดงเสมออยู่แล้ว) — มีผลเฉพาะการแสดงผล (ไม่เปลี่ยนสถานะ/งาน/วันลา)'}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={attemptClose}>ยกเลิก</Button>
            <Button variant="primary" onClick={() => onSave(selected)} disabled={!dirty}>บันทึกรายชื่อ ({selected.length})</Button>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* -------- ซ้าย: หัวหน้าทัวร์ทั้งหมด -------- */}
          <div className="flex min-h-0 flex-col">
            <p className="mb-2 text-sm font-semibold zego-text">
              {favoritesOnly ? 'ไกด์ของฉัน' : filter === 'all' ? 'หัวหน้าทัวร์ทั้งหมด' : LEADER_TYPE[filter].label} ({filteredLeft.length})
            </p>
            <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาชื่อ รหัส ชื่อเล่น ประเทศ หรือเส้นทาง" label="ค้นหาหัวหน้าทัวร์" />
            {/* ตัวกรองเดียว: รูปแบบการร่วมงาน — chip แถวเดียว ใช้พื้นที่น้อย */}
            <div className="my-2 flex flex-wrap items-center gap-1" role="group" aria-label="กรองตามรูปแบบการร่วมงาน">
              {([['all', 'ทั้งหมด'], ...LEADER_TYPE_ORDER.map((t) => [t, LEADER_TYPE[t].label] as const)] as [RosterTypeFilter, string][]).map(([v, label]) => (
                <button key={v} type="button" onClick={() => { setFilter(v); setFavoritesOnly(false); }} aria-pressed={!favoritesOnly && filter === v}
                  className={cx('rounded-full px-2 py-0.5 text-[11px] border', !favoritesOnly && filter === v ? 'zego-badge--info' : 'zego-badge--slate zego-hover-surface')}>
                  {label} ({typeCounts[v]})
                </button>
              ))}
              {/* "ไกด์ของฉัน" — ทางเลือกในกลุ่มเดียวกับ chip รูปแบบ (เลือกได้ทีละอัน) แสดงคนที่ปักดาวไว้ทุกรูปแบบ */}
              <button
                type="button"
                onClick={() => setFavoritesOnly((v) => !v)}
                aria-pressed={favoritesOnly}
                className={cx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border',
                  favoritesOnly ? 'zego-badge--warning' : 'zego-badge--slate zego-hover-surface',
                )}
              >
                <Icon name="star" filled className="h-3 w-3 zego-text-warning" />
                ไกด์ของฉัน ({favoritesCount})
              </button>
            </div>
            <div className="mb-2">
              <Button size="sm" variant="secondary" onClick={selectAllFromSearch}>เลือกทั้งหมดจากผลการค้นหา ({filteredLeft.length})</Button>
            </div>
            <ul className="max-h-[46vh] space-y-1 overflow-y-auto pr-1">
              {filteredLeft.length === 0 && <li className="py-6 text-center text-sm zego-text-tertiary">ไม่พบหัวหน้าทัวร์ตามเงื่อนไข</li>}
              {filteredLeft.map((c) => {
                const on = selectedSet.has(c.id);
                return (
                  <li key={c.id}>
                    <label className={cx('flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5', on ? 'zego-badge--info' : 'zego-border-color zego-hover-surface')}>
                      <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="mt-0.5 h-4 w-4 shrink-0 rounded border zego-border-color" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {favorited.has(c.id) && <Icon name="star" filled className="h-3.5 w-3.5 shrink-0 zego-text-warning" />}
                          <span className="truncate text-sm font-medium zego-text">{c.name}</span>
                          <span className="text-xs zego-text-tertiary">{c.id}</span>
                          <StatusBadge meta={LEADER_TYPE[c.leaderType]} size="sm" dot={false} />
                          <StatusBadge meta={LEADER_STATUS[c.status]} size="sm" dot />
                        </span>
                        <span className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] zego-text-tertiary">
                          {c.expertise && <span className="truncate">{c.expertise}</span>}
                          <span>งานเดือนนี้ {c.info.jobCount}</span>
                          {c.info.available ? <span className="zego-text-success">พร้อมรับงาน</span> : null}
                          {c.leaveText && <span className="zego-text-warning">{c.leaveText}</span>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* -------- ขวา: รายชื่อที่เลือก -------- */}
          <div className="flex min-h-0 flex-col border-t zego-border-color pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold zego-text">เลือกแล้ว {selected.length} คน</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => setConfirmCopy(true)} disabled={previousMonthIds.length === 0} title={previousMonthIds.length === 0 ? `ไม่มีรายชื่อใน ${previousMonthLabel}` : undefined}>คัดลอกจากเดือนก่อน</Button>
                <Button size="sm" variant="secondary" onClick={useSuggested} disabled={suggestedIds.length === 0}>ใช้รายชื่อแนะนำ</Button>
                <Button size="sm" variant="ghost" onClick={removeAll} disabled={selected.length === 0}>นำออกทั้งหมด</Button>
              </div>
            </div>

            {selected.length === 0 ? (
              <EmptyState icon="users" title="ยังไม่ได้เลือกหัวหน้าทัวร์" description="เลือกจากฝั่งซ้าย หรือคัดลอกจากเดือนก่อน / ใช้รายชื่อแนะนำ" />
            ) : (
              <ol className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
                {selected.map((id, idx) => {
                  const c = byId.get(id);
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-lg border zego-border-color px-2.5 py-1.5">
                      <span className="w-5 shrink-0 text-center text-xs tabular-nums zego-text-tertiary">{idx + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          {c && favorited.has(c.id) && <Icon name="star" filled className="h-3.5 w-3.5 shrink-0 zego-text-warning" />}
                          <span className="block truncate text-sm font-medium zego-text">{c?.name ?? id}</span>
                        </span>
                        <span className="text-[11px] zego-text-tertiary">
                          {c ? `${LEADER_TYPE[c.leaderType].label} · ` : ''}งานเดือนนี้ {c?.info.jobCount ?? 0}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button type="button" aria-label="เลื่อนขึ้น" onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded p-1 zego-text-tertiary zego-hover-surface disabled:opacity-30"><Icon name="chevronDown" className="h-3.5 w-3.5 rotate-180" /></button>
                        <button type="button" aria-label="เลื่อนลง" onClick={() => move(idx, 1)} disabled={idx === selected.length - 1} className="rounded p-1 zego-text-tertiary zego-hover-surface disabled:opacity-30"><Icon name="chevronDown" className="h-3.5 w-3.5" /></button>
                        <button type="button" aria-label="นำออก" onClick={() => toggle(id)} className="rounded p-1 zego-text-danger hover:bg-rose-50"><Icon name="x" className="h-3.5 w-3.5" /></button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </Drawer>

      {/* §4 คัดลอกจากเดือนก่อน — เลือกโหมด · ยังไม่บันทึกจนกว่าจะกด "บันทึกรายชื่อ" */}
      <Modal
        open={confirmCopy}
        onClose={() => setConfirmCopy(false)}
        title={`คัดลอกรายชื่อจาก ${previousMonthLabel}`}
        description={`พบ ${previousMonthIds.length} คนใน ${previousMonthLabel} — เลือกวิธีนำเข้า (ตรวจสอบและกด “บันทึกรายชื่อ” เพื่อยืนยัน)`}
        footer={<Button variant="ghost" onClick={() => setConfirmCopy(false)}>ยกเลิก</Button>}
      >
        <div className="space-y-2">
          <button type="button" onClick={replaceCopy} className="w-full rounded-lg border-2 zego-badge--info p-3 text-left">
            <span className="block text-sm font-semibold zego-text">แทนที่รายชื่อเดือนนี้ทั้งหมด</span>
            <span className="block text-xs zego-text-tertiary">ล้างรายชื่อที่เลือกไว้ แล้วใช้รายชื่อจาก {previousMonthLabel} แทน</span>
          </button>
          <button type="button" onClick={applyCopy} className="w-full rounded-lg border zego-border-color zego-hover-surface p-3 text-left">
            <span className="block text-sm font-semibold zego-text">เพิ่มเฉพาะรายชื่อที่ยังไม่มี</span>
            <span className="block text-xs zego-text-tertiary">คงรายชื่อที่เลือกไว้ แล้วเพิ่มคนจาก {previousMonthLabel} ที่ยังไม่อยู่ในรายชื่อ</span>
          </button>
        </div>
      </Modal>

      {/* §การป้องกันข้อมูลไม่บันทึก */}
      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => { setConfirmDiscard(false); onClose(); }}
        title="มีการแก้ไขที่ยังไม่ได้บันทึก"
        message="ต้องการปิดหน้าจัดการรายชื่อโดยไม่บันทึกหรือไม่"
        confirmLabel="ปิดโดยไม่บันทึก"
      />
    </>
  );
}
