import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  groupLeadersByRoster, sortRosterLeaders, defaultRosterRank, sortByDefaultRank,
  suggestRoster, filterRosterCandidates, countRosterCandidatesByType,
  ROSTER_TYPE_FILTER_DEFAULT, type RosterLeaderInfo,
} from '../src/lib/logic/monthRoster';
import { LEADER_TYPE, LEADER_TYPE_ORDER } from '../src/lib/labels';
import type { LeaderType } from '../src/types';
import { monthKeyOf, yearMonthOf, previousMonthKey } from '../src/services/monthRosterStore';

describe('monthKey helpers', () => {
  test('คีย์เดือนจากวันที่', () => {
    assert.equal(monthKeyOf('2026-08-01'), '2026-08');
    assert.deepEqual(yearMonthOf('2026-08'), { year: 2026, month: 8 });
  });
  test('เดือนก่อนหน้า (ข้ามปี)', () => {
    assert.equal(previousMonthKey('2026-08'), '2026-07');
    assert.equal(previousMonthKey('2026-01'), '2025-12');
  });
});

describe('§2 จัดกลุ่ม 3 กลุ่มตามลำดับ', () => {
  type L = { id: string; hasJob: boolean };
  const mk = (id: string, hasJob: boolean): L => ({ id, hasJob });
  const leaders = [mk('A', true), mk('B', false), mk('C', true), mk('D', false), mk('E', false)];

  test('กลุ่ม 1 เรียงตามลำดับ roster · กลุ่ม 2 = มีงานแต่ไม่อยู่ในชุด · กลุ่ม 3 = ชั่วคราว', () => {
    const g = groupLeadersByRoster(
      leaders, (l) => l.id, (l) => l.hasJob,
      ['B', 'A'], // roster (B ก่อน A)
      new Set(['D']), // ชั่วคราว
    );
    assert.deepEqual(g.roster.map((l) => l.id), ['B', 'A']);
    assert.deepEqual(g.outsideWithJob.map((l) => l.id), ['C']); // มีงาน ไม่อยู่ roster
    assert.deepEqual(g.temporary.map((l) => l.id), ['D']); // ชั่วคราว ไม่มีงาน
    // E: ไม่อยู่ roster ไม่มีงาน ไม่ชั่วคราว → ไม่แสดง
  });

  test('§8/§9 คนมีงานแต่ไม่อยู่ roster ต้องอยู่กลุ่ม 2 เสมอ (ไม่ถูกซ่อน)', () => {
    const g = groupLeadersByRoster(leaders, (l) => l.id, (l) => l.hasJob, [], new Set());
    assert.deepEqual(g.outsideWithJob.map((l) => l.id).sort(), ['A', 'C']);
  });

  test('roster ที่ถูกกรองออก (ไม่อยู่ใน leaders) → ข้ามไป ไม่ error', () => {
    const g = groupLeadersByRoster(leaders, (l) => l.id, (l) => l.hasJob, ['A', 'ZZZ', 'B'], new Set());
    assert.deepEqual(g.roster.map((l) => l.id), ['A', 'B']);
  });

  test('คนใน roster ที่มีงาน → อยู่กลุ่ม 1 (ไม่ซ้ำในกลุ่ม 2)', () => {
    const g = groupLeadersByRoster(leaders, (l) => l.id, (l) => l.hasJob, ['A'], new Set());
    assert.deepEqual(g.roster.map((l) => l.id), ['A']);
    assert.deepEqual(g.outsideWithJob.map((l) => l.id), ['C']); // A ไม่ซ้ำ
  });
});

/* ------------------------------ การเรียง (§12) ------------------------------ */

function info(over: Partial<RosterLeaderInfo> & { id: string }): RosterLeaderInfo {
  return { hasJob: false, firstJobDate: null, jobCount: 0, available: true, hasLeave: false, unavailableStatus: false, ...over };
}

describe('§12 defaultRosterRank + sortByDefaultRank', () => {
  test('ลำดับ: มีงาน < พร้อมรับงาน < ยังไม่มีงาน < ลา < ไม่พร้อม', () => {
    assert.equal(defaultRosterRank(info({ id: 'x', hasJob: true })), 0);
    assert.equal(defaultRosterRank(info({ id: 'x', available: true })), 2);
    assert.equal(defaultRosterRank(info({ id: 'x', available: false })), 3);
    assert.equal(defaultRosterRank(info({ id: 'x', hasLeave: true })), 5);
    assert.equal(defaultRosterRank(info({ id: 'x', unavailableStatus: true })), 6);
  });

  test('มีงาน → เรียงตามวันเริ่มงานเร็วสุด (ต้นเดือนก่อน)', () => {
    const sorted = sortByDefaultRank(
      [info({ id: 'late', hasJob: true, firstJobDate: '2026-08-20' }), info({ id: 'early', hasJob: true, firstJobDate: '2026-08-03' })],
      (l) => l,
    );
    assert.deepEqual(sorted.map((l) => l.id), ['early', 'late']);
  });
});

describe('§12 sortRosterLeaders — ตัวเลือกการเรียง', () => {
  const leaders = [
    info({ id: 'A', jobCount: 1, firstJobDate: '2026-08-10', hasJob: true }),
    info({ id: 'B', jobCount: 3, firstJobDate: '2026-08-05', hasJob: true }),
    info({ id: 'C', jobCount: 0, hasJob: false }),
  ];
  const name = (l: RosterLeaderInfo) => ({ A: 'สมชาย', B: 'สมหญิง', C: 'อนันต์' }[l.id] ?? l.id);

  test('custom → คงลำดับเดิม', () => {
    assert.deepEqual(sortRosterLeaders(leaders, (l) => l, name, 'custom').map((l) => l.id), ['A', 'B', 'C']);
  });
  test('jobCount → งานมากก่อน', () => {
    assert.deepEqual(sortRosterLeaders(leaders, (l) => l, name, 'jobCount').map((l) => l.id), ['B', 'A', 'C']);
  });
  test('startSoon → วันเริ่มงานเร็วสุดก่อน · ไม่มีงานไปท้าย', () => {
    assert.deepEqual(sortRosterLeaders(leaders, (l) => l, name, 'startSoon').map((l) => l.id), ['B', 'A', 'C']);
  });
  test('freeFirst → คนว่างก่อน', () => {
    assert.deepEqual(sortRosterLeaders(leaders, (l) => l, name, 'freeFirst').map((l) => l.id), ['C', 'A', 'B']);
  });
  test('name → เรียงชื่อไทย', () => {
    assert.deepEqual(sortRosterLeaders(leaders, (l) => l, name, 'name').map((l) => l.id), ['A', 'B', 'C']);
  });
});

/* -------------- ตัวกรองหน้ากำหนดรายชื่อ — รูปแบบการร่วมงานเท่านั้น -------------- */

describe('ตัวกรองรูปแบบการร่วมงาน (หน้ากำหนดรายชื่อ)', () => {
  type C = { id: string; leaderType: LeaderType; searchText: string };
  const mk = (id: string, leaderType: LeaderType, searchText = ''): C => ({ id, leaderType, searchText });
  const searchTextOf = (c: C) => c.searchText;
  const typeOf = (c: C) => c.leaderType;

  const candidates: C[] = [
    mk('g1', 'general', 'สมชาย ใจดี TL-000001 ญี่ปุ่น'),
    mk('r1', 'regular', 'สมหญิง รักทัวร์ TL-000002 เกาหลี'),
    mk('r2', 'regular', 'somsak TL-000003 ญี่ปุ่น โอซาก้า'),
    mk('f1', 'freelance', 'ฟ้าใส TL-000004 เวียดนาม'),
    mk('a1', 'agent', 'อาทิตย์ TL-000005 ญี่ปุ่น'),
  ];

  test('ค่าเริ่มต้นคือหัวหน้าทัวร์ประจำ', () => {
    assert.equal(ROSTER_TYPE_FILTER_DEFAULT, 'regular');
    assert.equal(LEADER_TYPE[ROSTER_TYPE_FILTER_DEFAULT as LeaderType].label, 'หัวหน้าทัวร์ประจำ');
  });

  test('เปิดครั้งแรก (ค่าเริ่มต้น) → แสดงเฉพาะหัวหน้าทัวร์ประจำ', () => {
    const r = filterRosterCandidates(candidates, '', ROSTER_TYPE_FILTER_DEFAULT, searchTextOf, typeOf);
    assert.deepEqual(r.map((c) => c.id), ['r1', 'r2']);
  });

  test('กรองได้ทุกรูปแบบ · ทั้งหมด = ไม่กรอง', () => {
    assert.deepEqual(filterRosterCandidates(candidates, '', 'all', searchTextOf, typeOf).map((c) => c.id),
      ['g1', 'r1', 'r2', 'f1', 'a1']);
    assert.deepEqual(filterRosterCandidates(candidates, '', 'general', searchTextOf, typeOf).map((c) => c.id), ['g1']);
    assert.deepEqual(filterRosterCandidates(candidates, '', 'freelance', searchTextOf, typeOf).map((c) => c.id), ['f1']);
    assert.deepEqual(filterRosterCandidates(candidates, '', 'agent', searchTextOf, typeOf).map((c) => c.id), ['a1']);
  });

  test('ค้นหาทำงานร่วมกับตัวกรอง (AND) — ชื่อ/รหัส/ประเทศ/เส้นทาง', () => {
    // ญี่ปุ่น มี g1, r2, a1 — เมื่อกรองเฉพาะประจำ เหลือ r2
    assert.deepEqual(filterRosterCandidates(candidates, 'ญี่ปุ่น', 'regular', searchTextOf, typeOf).map((c) => c.id), ['r2']);
    assert.deepEqual(filterRosterCandidates(candidates, 'TL-000004', 'all', searchTextOf, typeOf).map((c) => c.id), ['f1']);
    assert.deepEqual(filterRosterCandidates(candidates, 'โอซาก้า', 'all', searchTextOf, typeOf).map((c) => c.id), ['r2']);
  });

  test('ค้นหาไม่สนตัวพิมพ์เล็กใหญ่ · ตัดช่องว่างหัวท้าย', () => {
    assert.deepEqual(filterRosterCandidates(candidates, '  SOMSAK ', 'all', searchTextOf, typeOf).map((c) => c.id), ['r2']);
  });

  test('§10 จำนวนต่อตัวกรองตรงกับจำนวนที่จะแสดงจริง', () => {
    const counts = countRosterCandidatesByType(candidates, '', searchTextOf, typeOf);
    assert.deepEqual(counts, { all: 5, general: 1, regular: 2, freelance: 1, agent: 1 });
    for (const t of LEADER_TYPE_ORDER) {
      assert.equal(counts[t], filterRosterCandidates(candidates, '', t, searchTextOf, typeOf).length);
    }
  });

  test('§10 จำนวนอัปเดตตามคำค้นหา', () => {
    const counts = countRosterCandidatesByType(candidates, 'ญี่ปุ่น', searchTextOf, typeOf);
    assert.deepEqual(counts, { all: 3, general: 1, regular: 1, freelance: 0, agent: 1 });
    // chip ที่นับได้ 0 ต้องกรองได้ 0 จริง (ไม่หลุดไปแสดงทั้งหมด)
    assert.equal(filterRosterCandidates(candidates, 'ญี่ปุ่น', 'freelance', searchTextOf, typeOf).length, 0);
  });

  test('§9 เลือกทั้งหมดจากผลการค้นหา = เฉพาะรายการที่แสดงอยู่', () => {
    const shown = filterRosterCandidates(candidates, 'ญี่ปุ่น', 'regular', searchTextOf, typeOf);
    // จำลองปุ่ม "เลือกทั้งหมดจากผลการค้นหา" ที่ต่อท้ายของเดิม
    const selected = ['f1'];
    const next = [...selected];
    for (const c of shown) if (!next.includes(c.id)) next.push(c.id);
    assert.deepEqual(next, ['f1', 'r2']); // ไม่ดึง g1/a1 ที่ถูกกรองออก · คงรายการที่เลือกไว้เดิม
  });

  test('§8 ตัวกรองใช้ leaderType เท่านั้น — ไม่พึ่งสถานะ/วันลา/การมีงาน', () => {
    // คนละสถานะงาน/วันลากันหมด แต่ leaderType เดียวกัน → ต้องได้ทั้งคู่
    const both = filterRosterCandidates(
      [mk('busy', 'regular'), mk('onLeave', 'regular')], '', 'regular', searchTextOf, typeOf,
    );
    assert.deepEqual(both.map((c) => c.id), ['busy', 'onLeave']);
  });

  test('§12 ตัวเลือกตรงกับ LEADER_TYPE ที่ใช้ทั้งระบบ (ไม่สร้างชุดประเภทซ้ำ)', () => {
    assert.deepEqual(LEADER_TYPE_ORDER, ['general', 'regular', 'freelance', 'agent']);
    assert.deepEqual(LEADER_TYPE_ORDER.map((t) => LEADER_TYPE[t].label), [
      'หัวหน้าทัวร์ทั่วไป', 'หัวหน้าทัวร์ประจำ', 'หัวหน้าทัวร์ฟรีแลนซ์', 'หัวหน้าทัวร์เอเจนท์',
    ]);
  });
});

describe('§5 suggestRoster', () => {
  test('แนะนำคนมีงาน + เคยอยู่เดือนก่อน + พร้อมรับงาน · ตัดพักงาน/ลาทั้งเดือน', () => {
    const leaders = [
      info({ id: 'job', hasJob: true }),
      info({ id: 'prev', available: true }),
      info({ id: 'free', available: true }),
      info({ id: 'suspended', unavailableStatus: true, hasJob: true }), // ตัดออกแม้มีงาน
      info({ id: 'leaveAll', available: true }), // ลาทั้งเดือน → ตัด
      info({ id: 'busyOnly', available: false, hasJob: false }), // ไม่เข้าเกณฑ์ใด
    ];
    const suggested = suggestRoster(leaders, new Set(['prev']), new Set(['leaveAll']));
    assert.ok(suggested.includes('job'));
    assert.ok(suggested.includes('prev'));
    assert.ok(suggested.includes('free'));
    assert.ok(!suggested.includes('suspended'));
    assert.ok(!suggested.includes('leaveAll'));
    assert.ok(!suggested.includes('busyOnly'));
  });

  test('เรียงตามลำดับความสำคัญ (มีงานก่อน)', () => {
    const leaders = [info({ id: 'free', available: true }), info({ id: 'job', hasJob: true })];
    assert.deepEqual(suggestRoster(leaders, new Set(), new Set()), ['job', 'free']);
  });
});
