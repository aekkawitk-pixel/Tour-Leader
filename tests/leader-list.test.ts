/**
 * เทสต์ตรรกะหน้ารายการหัวหน้าทัวร์ — ประสบการณ์รวม, ประเทศที่เชี่ยวชาญ (เรียงระดับ),
 * ตัวกรองระดับประสบการณ์ และการเรียงตามประสบการณ์
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { expertCountries, leaderExperienceMonths } from '@/lib/logic/leaderProfile';
import { EMPTY_LEADER_FILTER, filterLeaders, sortLeaders } from '@/lib/logic/leaderSearch';
import type {
  Country,
  EmploymentHistory,
  LanguageSkill,
  LeaderFilter,
  TourLeader,
  TourLeaderRouteSkill,
} from '@/types';

const TODAY = '2026-07-14';

const job = (over: Partial<EmploymentHistory>): EmploymentHistory => ({
  id: 'EH',
  tourLeaderId: 'TL',
  employerName: 'บริษัท',
  currency: 'THB',
  startMonth: 1,
  startYear: 2024,
  isCurrentJob: false,
  position: 'พนักงาน',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ...over,
});

const routeSkill = (over: Partial<TourLeaderRouteSkill>): TourLeaderRouteSkill => ({
  id: 'RS',
  countryId: 'C1',
  coverage: 'all_routes',
  routeIds: [],
  skillLevel: 'traveled',
  ...over,
});

const leader = (over: Partial<TourLeader>): TourLeader =>
  ({
    id: 'TL-001',
    firstName: 'สมชาย',
    lastName: 'ใจดี',
    nickname: 'เอก',
    active: true,
    usageStatus: 'active',
    status: 'available',
    leaderType: 'general',
    contacts: [],
    languages: [],
    assignedCountries: [],
    routeSkills: [],
    tourSkills: [],
    employmentHistory: [],
    documents: [],
    rating: 0,
    totalJobs: 0,
    updatedAt: '2026-01-01',
    address: { houseNo: '', countryId: 'C-TH' },
    availableStartDate: '2026-01-01',
    ...over,
  }) as unknown as TourLeader;

const COUNTRIES = [
  { id: 'C1', code: 'JP', nameEn: 'Japan', nameTh: 'ญี่ปุ่น' },
  { id: 'C2', code: 'KR', nameEn: 'Korea', nameTh: 'เกาหลี' },
] as unknown as Country[];

const CTX = { countries: COUNTRIES, routes: [], jobs: [], today: TODAY };

/* --------------------------- ประสบการณ์รวม --------------------------- */

describe('leaderExperienceMonths', () => {
  test('งานปัจจุบันคำนวณถึงเดือนปัจจุบัน', () => {
    const l = leader({
      employmentHistory: [job({ startMonth: 1, startYear: 2024, isCurrentJob: true })],
    });
    // ม.ค. 2024 → ก.ค. 2026 = 31 เดือน
    assert.equal(leaderExperienceMonths(l, TODAY), 31);
  });

  test('ไม่มีประสบการณ์ → 0 เดือน', () => {
    assert.equal(leaderExperienceMonths(leader({}), TODAY), 0);
  });

  test('ช่วงเวลาที่ซ้อนกันไม่นับซ้ำ', () => {
    const l = leader({
      employmentHistory: [
        job({ id: 'a', startMonth: 1, startYear: 2020, endMonth: 12, endYear: 2021 }),
        job({ id: 'b', startMonth: 6, startYear: 2020, endMonth: 6, endYear: 2022 }),
      ],
    });
    // รวมช่วง ม.ค.2020–มิ.ย.2022 = 30 เดือน (ไม่ใช่ 24+25)
    assert.equal(leaderExperienceMonths(l, TODAY), 30);
  });
});

/* ------------------------- ประเทศที่เชี่ยวชาญ ------------------------- */

describe('expertCountries — เรียงระดับสูงสุดก่อน', () => {
  test('ประเทศที่เชี่ยวชาญมากกว่าแสดงก่อน', () => {
    const l = leader({
      routeSkills: [
        routeSkill({ id: 'r1', countryId: 'C1', skillLevel: 'traveled' }),
        routeSkill({ id: 'r2', countryId: 'C2', skillLevel: 'expert' }),
      ],
    });
    const result = expertCountries(l, COUNTRIES);
    assert.deepEqual(
      result.map((c) => c.label),
      ['Korea', 'Japan'],
    );
    assert.equal(result[0].code, 'KR');
  });
});

/* --------------------- ตัวกรอง + เรียงตามประสบการณ์ --------------------- */

describe('ตัวกรองระดับประสบการณ์ + เรียงตามประสบการณ์', () => {
  const junior = leader({
    id: 'J',
    employmentHistory: [job({ startMonth: 1, startYear: 2026, endMonth: 6, endYear: 2026 })], // 6 เดือน
  });
  const senior = leader({
    id: 'S',
    employmentHistory: [job({ startMonth: 1, startYear: 2010, isCurrentJob: true })], // 16+ ปี
  });
  const pool = [junior, senior];

  test('กรองช่วง "มากกว่า 10 ปี" เหลือเฉพาะ senior', () => {
    const f: LeaderFilter = { ...EMPTY_LEADER_FILTER, experienceLevel: 'gt10' };
    const result = filterLeaders(pool, f, CTX);
    assert.deepEqual(
      result.map((l) => l.id),
      ['S'],
    );
  });

  test('กรองช่วง "น้อยกว่า 1 ปี" เหลือเฉพาะ junior', () => {
    const f: LeaderFilter = { ...EMPTY_LEADER_FILTER, experienceLevel: 'lt1' };
    const result = filterLeaders(pool, f, CTX);
    assert.deepEqual(
      result.map((l) => l.id),
      ['J'],
    );
  });

  test('เรียงประสบการณ์มากที่สุด → senior ก่อน', () => {
    const f: LeaderFilter = { ...EMPTY_LEADER_FILTER, sortBy: 'experience', sortDir: 'desc' };
    const result = sortLeaders(pool, f, TODAY);
    assert.deepEqual(
      result.map((l) => l.id),
      ['S', 'J'],
    );
  });

  test('เรียงประสบการณ์น้อยที่สุด → junior ก่อน', () => {
    const f: LeaderFilter = { ...EMPTY_LEADER_FILTER, sortBy: 'experience', sortDir: 'asc' };
    const result = sortLeaders(pool, f, TODAY);
    assert.deepEqual(
      result.map((l) => l.id),
      ['J', 'S'],
    );
  });
});

/* ------------- ซ่อนคนที่ไม่พร้อมรับงาน (เปลี่ยนสถานะแล้วหายจากตาราง) ------------- */

describe('ซ่อนสถานะไม่พร้อมรับงานจากรายการปกติ', () => {
  const ready = leader({ id: 'ready', status: 'available' });
  const suspended = leader({ id: 'susp', usageStatus: 'suspended', status: 'unavailable' });
  const unavailable = leader({ id: 'unavail', status: 'unavailable' });
  const pool = [ready, suspended, unavailable];

  test('ค่าเริ่มต้น → ซ่อน ระงับ/ไม่พร้อม (คงเฉพาะพร้อมรับงาน)', () => {
    const result = filterLeaders(pool, EMPTY_LEADER_FILTER, CTX);
    assert.deepEqual(new Set(result.map((l) => l.id)), new Set(['ready']));
  });

  test('ติ๊ก "แสดงคนที่ไม่พร้อมด้วย" → เห็นครบทุกคน', () => {
    const f: LeaderFilter = { ...EMPTY_LEADER_FILTER, showUnavailable: true };
    const result = filterLeaders(pool, f, CTX);
    assert.equal(result.length, 3);
  });

  test('กรองความพร้อมรับงาน = ไม่พร้อมรับงาน → เห็นทุกคนที่ไม่พร้อม แม้ไม่ติ๊กแสดง', () => {
    const f: LeaderFilter = { ...EMPTY_LEADER_FILTER, status: 'unavailable' };
    const result = filterLeaders(pool, f, CTX);
    // คนที่ถูกระงับการใช้งานถูกตั้งเป็นไม่พร้อมรับงานตามกฎ จึงติดตัวกรองนี้ด้วย
    assert.deepEqual(new Set(result.map((l) => l.id)), new Set(['susp', 'unavail']));
  });
});

/* ------------------ ตัวกรองภาษา / ประเทศ เลือกได้หลายค่า ------------------ */

describe('ตัวกรองภาษาและประเทศ — เลือกได้มากกว่า 1', () => {
  const CEFR_RANK: Record<string, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  const skill = (language: string, levelCode = 'B2'): LanguageSkill => ({
    id: `L-${language}`,
    languageCode: language,
    languageName: language,
    isNativeLanguage: false,
    standard: 'CEFR',
    levelCode,
    levelName: levelCode,
    levelRank: CEFR_RANK[levelCode] ?? 4,
  });

  const jp = leader({ id: 'TL-JP', languages: [skill('ญี่ปุ่น')], routeSkills: [routeSkill({ countryId: 'C1' })] });
  const kr = leader({ id: 'TL-KR', languages: [skill('เกาหลี')], routeSkills: [routeSkill({ countryId: 'C2' })] });
  const cn = leader({ id: 'TL-CN', languages: [skill('จีน')], routeSkills: [routeSkill({ countryId: 'C3' })] });
  const pool = [jp, kr, cn];

  const ids = (f: Partial<LeaderFilter>) =>
    filterLeaders(pool, { ...EMPTY_LEADER_FILTER, showUnavailable: true, ...f }, CTX)
      .map((l) => l.id)
      .sort();

  test('ภาษา: ว่าง = ทุกภาษา · หลายภาษา = ได้ทุกคนที่ตรงอย่างน้อย 1 ภาษา', () => {
    assert.deepEqual(ids({ languages: [] }), ['TL-CN', 'TL-JP', 'TL-KR']);
    assert.deepEqual(ids({ languages: ['ญี่ปุ่น'] }), ['TL-JP']);
    assert.deepEqual(ids({ languages: ['ญี่ปุ่น', 'เกาหลี'] }), ['TL-JP', 'TL-KR']);
  });

  test('ประเทศ: ว่าง = ทุกประเทศ · หลายประเทศ = เชี่ยวชาญประเทศใดประเทศหนึ่งก็ผ่าน', () => {
    assert.deepEqual(ids({ countryIds: [] }), ['TL-CN', 'TL-JP', 'TL-KR']);
    assert.deepEqual(ids({ countryIds: ['C1'] }), ['TL-JP']);
    assert.deepEqual(ids({ countryIds: ['C1', 'C3'] }), ['TL-CN', 'TL-JP']);
  });

  test('ภาษาที่ไม่มีใครใช้ ไม่ดึงคนอื่นติดมา', () => {
    assert.deepEqual(ids({ languages: ['สเปน'] }), []);
    assert.deepEqual(ids({ languages: ['สเปน', 'จีน'] }), ['TL-CN']);
  });

  test('ระดับขั้นต่ำตีความตามมาตรฐานของภาษาที่เลือก — ใช้ได้เมื่อเลือกภาษาเดียว', () => {
    const strong = leader({ id: 'TL-JP2', languages: [skill('ญี่ปุ่น', 'C2')] });
    const weak = leader({ id: 'TL-JP3', languages: [skill('ญี่ปุ่น', 'A1')] });
    const f: LeaderFilter = {
      ...EMPTY_LEADER_FILTER,
      showUnavailable: true,
      languages: ['ญี่ปุ่น'],
      minLevelCode: 'C2',
    };
    assert.deepEqual(
      filterLeaders([strong, weak], f, CTX).map((l) => l.id),
      ['TL-JP2'],
    );
  });

  test('ภาษา + ประเทศ ใช้ร่วมกันแบบ "และ"', () => {
    assert.deepEqual(ids({ languages: ['ญี่ปุ่น', 'เกาหลี'], countryIds: ['C2'] }), ['TL-KR']);
  });
});
