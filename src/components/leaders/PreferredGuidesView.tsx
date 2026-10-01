'use client';

/**
 * ลำดับไกด์ที่ต้องการ (Preferred Guide List) — ส่วนตัวของแต่ละ User
 *
 * พนักงานแต่ละคนมีประสบการณ์ทำงานกับไกด์ต่างกัน จึงจัดลำดับไกด์ที่อยากใช้ก่อน-หลังของตัวเองได้
 * (หรือตัดออกทั้งคน) ไม่กระทบของ User อื่น — หน้าจอเลือกไกด์ทุกจุด (การ์ดหน้างาน/แผงเลือก/หน้าต่างเลือก/
 * ตารางจัดสเก็ต) นำข้อมูลนี้ไปใช้อัตโนมัติ (ดู lib/logic/preferredGuideOrder, lib/useExcludedGuides)
 *
 * จัดลำดับได้ด้วยการลาก หรือกรอกเลขอันดับตรง ๆ (เร็วกว่าตอนมีไกด์หลักร้อยคน) — กรอกเลขอันดับใช้ได้
 * เฉพาะตอนไม่ได้ค้นหา เพราะเลขอันดับอ้างอิงลำดับเต็ม ไม่ใช่ลำดับเฉพาะรายการที่กรองไว้
 *
 * เป็นหนึ่งใน "มุมมอง" ของหน้า /leaders (ดู app/leaders/page.tsx) — ไม่มี PageHeader ของตัวเอง
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Avatar, Button, Card, cx, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { DragHandle, RowMenu, useDragReorder } from '@/components/leaders/reorderControls';
import { FavoriteStarButton } from '@/components/leaders/FavoriteStarButton';
import { usePreferredGuideOrder } from '@/lib/usePreferredGuideOrder';
import { useExcludedGuides } from '@/lib/useExcludedGuides';
import { useFavoriteGuides } from '@/lib/useFavoriteGuides';
import { fullPreferredOrder, moveIdToRank, reorderWithinSubset } from '@/lib/logic/preferredGuideOrder';
import { LEADER_STATUS } from '@/lib/labels';
import type { TourLeader } from '@/types';

export function PreferredGuidesView() {
  const { leaders, currentUser } = useDemo();
  const { order, setOrder } = usePreferredGuideOrder();
  const { excluded, exclude, include } = useExcludedGuides();
  const { favorited, toggleFavorite } = useFavoriteGuides();
  const [query, setQuery] = useState('');

  // "ตัดออก" แล้วจะไม่โผล่ในรายการที่จัดลำดับ/แนะนำเลย — จนกว่าจะกด "เพิ่มกลับเข้ามา" ด้านล่าง
  const pool = useMemo(() => leaders.filter((l) => l.active && !excluded.has(l.id)), [leaders, excluded]);
  const excludedLeaders = useMemo(
    () => leaders.filter((l) => excluded.has(l.id)).sort((a, b) => `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`, 'th')),
    [leaders, excluded],
  );
  const byId = useMemo(() => new Map(pool.map((l) => [l.id, l])), [pool]);

  const nameOf = (id: string) => {
    const l = byId.get(id);
    return l ? `${l.firstName}${l.lastName}` : id;
  };

  const fullOrder = useMemo(
    () => fullPreferredOrder(order, pool.map((l) => l.id), (a, b) => nameOf(a).localeCompare(nameOf(b), 'th')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, pool],
  );

  const q = query.trim().toLowerCase();
  const visibleLeaders: TourLeader[] = useMemo(() => {
    const ordered = fullOrder.map((id) => byId.get(id)).filter((l): l is TourLeader => !!l);
    if (!q) return ordered;
    return ordered.filter((l) =>
      `${l.firstName}${l.lastName}${l.nickname ?? ''}${l.id}`.toLowerCase().includes(q),
    );
  }, [fullOrder, byId, q]);

  const applySubsetChange = (nextSubset: TourLeader[]) => {
    setOrder(reorderWithinSubset(fullOrder, nextSubset.map((l) => l.id)));
  };

  const reorder = useDragReorder<TourLeader>(visibleLeaders, applySubsetChange);

  const jumpToRank = (id: string, rank1: number) => {
    if (!Number.isFinite(rank1) || rank1 < 1) return;
    setOrder(moveIdToRank(fullOrder, id, rank1));
  };

  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center gap-2 text-sm zego-text-secondary">
        <Icon name="star" className="h-4 w-4 shrink-0 text-amber-500" />
        กำลังจัดลำดับสำหรับ <strong className="zego-text">{currentUser.name}</strong>
        <span className="zego-text-tertiary">— สลับผู้ใช้ที่แถบด้านบนเพื่อจัดลำดับของบัญชีอื่น</span>
      </Card>

      <Card padded={false} className="overflow-hidden">
        <div className="shrink-0 space-y-1.5 zego-divider-bottom zego-surface-bg px-4 py-3">
          <SearchBox value={query} onChange={setQuery} placeholder="ค้นหาชื่อ ชื่อเล่น หรือรหัสหัวหน้าทัวร์" label="ค้นหาหัวหน้าทัวร์" />
          <p className="text-xs zego-text-tertiary">
            {visibleLeaders.length} คน{q ? ` (กรองจากทั้งหมด ${fullOrder.length} คน)` : ''} · ลากไอคอน ⠿ เพื่อสลับลำดับ
            {q && ' · ล้างคำค้นหาก่อนจึงจะกรอกเลขอันดับตรง ๆ ได้'}
          </p>
        </div>

        {visibleLeaders.length === 0 ? (
          <div className="p-4">
            <EmptyState icon="search" title="ไม่พบหัวหน้าทัวร์ตามคำค้นหา" description="ลองค้นด้วยชื่อ ชื่อเล่น หรือรหัสอื่น" />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {visibleLeaders.map((leader, index) => {
              const rank = fullOrder.indexOf(leader.id) + 1;
              const dragging = reorder.dragId === leader.id;
              return (
                <li
                  key={leader.id}
                  ref={reorder.setRowRef(leader.id)}
                  style={reorder.indicatorStyle(index)}
                  className={cx('flex items-center gap-2.5 px-3 py-2.5 transition-colors', dragging && 'zego-selected-tint')}
                >
                  <DragHandle dragging={dragging} onPointerDown={reorder.dragStart(leader.id)} />

                  {q ? (
                    <span className="w-12 shrink-0 text-center text-sm font-semibold tabular-nums zego-text-tertiary">
                      #{rank}
                    </span>
                  ) : (
                    <RankInput
                      key={rank}
                      rank={rank}
                      max={fullOrder.length}
                      label={`ย้าย ${nameOf(leader.id)} ไปอันดับที่`}
                      onCommit={(next) => jumpToRank(leader.id, next)}
                    />
                  )}

                  <FavoriteStarButton
                    favorited={favorited.has(leader.id)}
                    onToggle={() => toggleFavorite(leader.id)}
                    name={nameOf(leader.id)}
                    size="sm"
                  />

                  <Avatar initials={leader.avatarInitials} color={leader.avatarColor} src={leader.photoUrl} alt={`รูปของ ${leader.firstName}`} size="sm" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-medium zego-text">
                        {leader.firstName} {leader.lastName}
                      </span>
                      <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />
                    </div>
                    <p className="text-xs zego-text-tertiary">
                      {leader.nickname ? `${leader.nickname} · ` : ''}
                      {leader.id}
                    </p>
                  </div>

                  <RowMenu
                    label={`เมนูจัดลำดับ ${nameOf(leader.id)}`}
                    items={[
                      { label: 'เลื่อนขึ้น', onClick: () => reorder.move(leader.id, -1), disabled: index === 0 },
                      { label: 'เลื่อนลง', onClick: () => reorder.move(leader.id, 1), disabled: index === visibleLeaders.length - 1 },
                      { label: 'ไม่ต้องการ — ตัดออกจากรายการ', onClick: () => exclude(leader.id), danger: true },
                    ]}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {excludedLeaders.length > 0 && (
        <Card className="mt-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold zego-text-secondary">
            <Icon name="x" className="h-4 w-4 zego-text-tertiary" />
            ไกด์ที่ไม่ต้องการ ({excludedLeaders.length})
          </h3>
          <p className="mb-2 text-xs zego-text-tertiary">คนกลุ่มนี้จะไม่ถูกแนะนำหรือให้เลือกในหน้าจัดหัวหน้าทัวร์ทุกจุด — กด &quot;เพิ่มกลับเข้ามา&quot; เพื่อให้กลับมาเลือกได้อีกครั้ง</p>
          <div className="flex flex-wrap gap-2">
            {excludedLeaders.map((l) => (
              <span key={l.id} className="flex items-center gap-1.5 rounded-lg border zego-border-color px-2 py-1 text-xs zego-text-secondary">
                {l.firstName} {l.lastName}
                <button type="button" onClick={() => include(l.id)} className="font-medium zego-text-info hover:underline">
                  เพิ่มกลับเข้ามา
                </button>
              </span>
            ))}
          </div>
        </Card>
      )}

      {order.length > 0 && (
        <div className="mt-3 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            onClick={() => setOrder([])}
          >
            ล้างลำดับที่ตั้งไว้ทั้งหมด
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * ช่องกรอกเลขอันดับ — ใช้ค่าเริ่มต้น (uncontrolled) แล้วยืนยันตอนออกจากช่อง/กด Enter เท่านั้น
 * กันไม่ให้กรอกเลขสองหลัก (เช่น "15") แล้วกระโดดไปอันดับ 1 ก่อนตั้งแต่ยังพิมพ์ไม่จบ
 */
function RankInput({
  rank,
  max,
  label,
  onCommit,
}: {
  rank: number;
  max: number;
  label: string;
  onCommit: (next: number) => void;
}) {
  const commit = (raw: string) => {
    const next = Number(raw);
    if (Number.isFinite(next) && next >= 1 && next <= max && next !== rank) onCommit(next);
  };

  return (
    <input
      type="number"
      min={1}
      max={max}
      defaultValue={rank}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        }
      }}
      aria-label={label}
      className="w-12 shrink-0 rounded border zego-border-color py-1 text-center text-sm font-semibold tabular-nums zego-text-secondary"
    />
  );
}
