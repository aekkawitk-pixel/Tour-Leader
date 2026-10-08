'use client';

/** ตารางข้อมูลใช้ซ้ำ — เลื่อนแนวนอนบนจอเล็ก มี Empty state และแถวกดได้ด้วยคีย์บอร์ด */

import { useMemo, useState, type ReactNode } from 'react';
import { cx, EmptyState } from './Primitives';
import { Icon, type IconName } from './Icon';

export interface Column<T> {
  key: string;
  header: string;
  /** ซ่อนคอลัมน์นี้บนจอมือถือ */
  hideOnMobile?: boolean;
  /** ซ่อนคอลัมน์นี้จนกว่าจอจะกว้างถึงระดับที่กำหนด (ใช้กับคอลัมน์รอง เช่น คะแนนรายหัวข้อ) */
  hideUntil?: 'lg' | 'xl' | '2xl';
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
  className?: string;
  /** คลาสเพิ่มเฉพาะหัวคอลัมน์ (เช่นบีบ padding ให้คอลัมน์แคบ) */
  headerClassName?: string;
  /** true = ให้ชื่อคอลัมน์ตัดบรรทัดได้ — ใช้กับตารางที่ต้องพอดีกรอบ ไม่ให้หัวตารางดันจนล้น */
  headerWrap?: boolean;
  /** ใส่เพื่อให้หัวคอลัมน์กดเรียงได้ — คืนค่าที่ใช้เทียบ (null = ไม่มีข้อมูล ให้ไปท้ายเสมอ) */
  sortValue?: (row: T) => string | number | null;
  /** ความกว้างคอลัมน์ (เช่น '56px') — ช่วยให้คอลัมน์คะแนนกว้างเท่ากันทุกตาราง */
  width?: string;
}

export type SortDir = 'asc' | 'desc';

/** คลาสต้องเขียนเต็มเป็นค่าคงที่ เพื่อให้ Tailwind เก็บคลาสตอน build ได้ */
const HIDE_UNTIL_CLASS: Record<NonNullable<Column<unknown>['hideUntil']>, string> = {
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyTitle = 'ไม่มีข้อมูล',
  emptyDescription,
  emptyIcon = 'info',
  emptyAction,
  keepHeaderWhenEmpty = false,
  rowClassName,
  defaultSortKey,
  defaultSortDir = 'desc',
  minWidthClass = 'min-w-[640px]',
  layout = 'auto',
  mobileCards = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: IconName;
  emptyAction?: ReactNode;
  /**
   * true = ไม่มีข้อมูลก็ยังแสดงหัวตาราง แล้ววางข้อความว่างไว้ในตัวตาราง
   * ใช้กับตารางที่ "รอข้อมูลจากต้นทาง" — ผู้ใช้จะได้เห็นว่าตารางเก็บอะไรบ้างระหว่างรอ
   */
  keepHeaderWhenEmpty?: boolean;
  rowClassName?: (row: T) => string | undefined;
  /** คอลัมน์ที่เรียงเป็นค่าเริ่มต้น (ต้องมี sortValue) */
  defaultSortKey?: string;
  defaultSortDir?: SortDir;
  /** ความกว้างขั้นต่ำของตาราง — ตั้งให้แคบลงได้เมื่อคอลัมน์กระชับ เพื่อไม่ให้เลื่อนแนวนอนบนเดสก์ท็อป */
  minWidthClass?: string;
  /**
   * fixed = ยึดความกว้างคอลัมน์ตามที่ประกาศ เนื้อหายาวเกินให้ตัด ไม่ดันตารางให้กว้างจนต้องเลื่อน
   * ใช้กับตารางที่ต้องพอดีกรอบเสมอ (เช่นตารางคะแนนที่มี 11 คอลัมน์)
   */
  layout?: 'auto' | 'fixed';
  /**
   * true = จอเล็ก (< md) แสดงเป็นการ์ดแทนตาราง: คอลัมน์แรกเป็นหัวการ์ด คอลัมน์ที่เหลือเป็นบรรทัด "หัวคอลัมน์: ค่า"
   * (ข้ามคอลัมน์ hideOnMobile · คอลัมน์ไม่มีหัว เช่นปุ่มจัดการ วางเต็มบรรทัดท้ายการ์ด) — จอ md ขึ้นไปเป็นตารางเหมือนเดิม
   */
  mobileCards?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(
    defaultSortKey ? { key: defaultSortKey, dir: defaultSortDir } : null,
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      // ค่าว่าง (ยังไม่มีข้อมูล) ไปท้ายเสมอ ไม่ว่าจะเรียงขึ้นหรือลง
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'th') * factor;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'desc' };
      return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
    });
  };

  if (rows.length === 0 && !keepHeaderWhenEmpty) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  const [first, ...rest] = columns.filter((c) => !c.hideOnMobile);
  const cards = mobileCards && first && (
    <ul className="divide-y divide-[var(--zego-border-soft)] md:hidden">
      {sortedRows.length === 0 && (
        <li className="py-6">
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />
        </li>
      )}
      {sortedRows.map((row) => (
        <li
          key={rowKey(row)}
          tabIndex={onRowClick ? 0 : undefined}
          role={onRowClick ? 'button' : undefined}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          onKeyDown={onRowClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRowClick(row); } } : undefined}
          className={cx('space-y-1.5 px-1 py-3', onRowClick && 'cursor-pointer', rowClassName?.(row))}
        >
          <div className="text-sm font-medium zego-text">{first.render(row)}</div>
          {rest.some((c) => c.header) && (
            <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              {rest.filter((c) => c.header).map((col) => (
                <div key={col.key} className="contents">
                  <dt className="text-xs leading-5 zego-text-tertiary">{col.header}</dt>
                  <dd className="min-w-0 zego-text-secondary">{col.render(row)}</dd>
                </div>
              ))}
            </dl>
          )}
          {rest.filter((c) => !c.header).map((col) => (
            <div key={col.key} className="flex flex-wrap justify-end gap-2">{col.render(row)}</div>
          ))}
        </li>
      ))}
    </ul>
  );

  return (
    <>
    {cards}
    {/* ตารางกว้างกว่าจอเล็ก → เลื่อนแนวนอนภายในกล่องนี้เท่านั้น หน้าเว็บต้องไม่เลื่อนตาม */}
    <div className={cx('w-full max-w-full overflow-x-auto', cards && 'max-md:hidden')}>
      <table className={cx('zego-table text-sm', layout === 'fixed' && 'table-fixed', minWidthClass)}>
        <thead>
          <tr className="text-left">
            {columns.map((col) => {
              const sortable = !!col.sortValue;
              const active = sort?.key === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cx(
                    'px-3',
                    !col.headerWrap && 'whitespace-nowrap',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.hideOnMobile && 'hidden md:table-cell',
                    col.hideUntil && HIDE_UNTIL_CLASS[col.hideUntil],
                    col.headerClassName,
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cx(
                        'zego-sort-btn zego-text-tertiary inline-flex items-center gap-0.5 rounded',
                        active && 'zego-text-info',
                        col.align === 'center' && 'justify-center',
                      )}
                      title={`เรียงตาม${col.header}`}
                    >
                      {col.header}
                      <Icon
                        name="chevronDown"
                        className={cx(
                          'h-3 w-3 transition-transform',
                          active ? (sort.dir === 'asc' ? 'rotate-180' : '') : 'opacity-30',
                        )}
                      />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {/* รอข้อมูล — คงหัวตารางไว้ให้เห็นโครงสร้าง แล้ววางข้อความว่างเต็มความกว้าง */}
          {sortedRows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6">
                <EmptyState
                  icon={emptyIcon}
                  title={emptyTitle}
                  description={emptyDescription}
                  action={emptyAction}
                />
              </td>
            </tr>
          )}
          {sortedRows.map((row) => (
            <tr
              key={rowKey(row)}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? 'button' : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={cx(onRowClick && 'zego-is-clickable cursor-pointer', rowClassName?.(row))}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cx(
                    'px-3 align-middle',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.hideOnMobile && 'hidden md:table-cell',
                    col.hideUntil && HIDE_UNTIL_CLASS[col.hideUntil],
                    col.className,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
