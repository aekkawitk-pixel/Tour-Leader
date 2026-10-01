/**
 * เทสต์การรวมข้อมูลวิเคราะห์หัวหน้าทัวร์ (หน้าภาพรวม)
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  countryCounts,
  experienceBandCounts,
  languageCounts,
  leaderKpis,
  onJobLeaderCount,
  statusGroupCounts,
  usageBlockedCount,
} from '@/lib/logic/leaderAnalytics';
import { experienceBandOf } from '@/lib/logic/leaderProfile';
import type {
  Country,
  EmploymentHistory,
  LanguageSkill,
  LeaderStatus,
  TourJob,
  TourLeader,
  TourLeaderRouteSkill,
} from '@/types';

const TODAY = '2026-07-14';

const lang = (language: string, isNative = false): LanguageSkill => ({
  id: `L-${language}-${isNative}`,
  languageCode: language,
  languageName: language,
  isNativeLanguage: isNative,
  standard: 'GENERAL',
  levelCode: isNative ? null : 'G3',
  levelName: isNative ? null : 'ปานกลาง',
  levelRank: isNative ? null : 3,
});

const route = (countryId: string): TourLeaderRouteSkill => ({
  id: `R-${countryId}`,
  countryId,
  coverage: 'all_routes',
  routeIds: [],
  skillLevel: 'can_lead',
});

const job = (over: Partial<EmploymentHistory>): EmploymentHistory => ({
  id: 'EH',
  tourLeaderId: 'TL',
  employerName: 'x',
  currency: 'THB',
  startMonth: 1,
  startYear: 2024,
  isCurrentJob: false,
  position: 'พนักงาน',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  ...over,
});

const leader = (id: string, over: Partial<TourLeader> = {}): TourLeader =>
  ({
    id,
    firstName: id,
    lastName: '',
    nickname: '',
    active: true,
    usageStatus: 'active',
    status: 'available' as LeaderStatus,
    languages: [],
    routeSkills: [],
    employmentHistory: [],
    ...over,
  }) as unknown as TourLeader;

const COUNTRIES = [
  { id: 'JP', code: 'JP', nameEn: 'Japan', nameTh: 'ญี่ปุ่น' },
  { id: 'KR', code: 'KR', nameEn: 'Korea', nameTh: 'เกาหลี' },
] as unknown as Country[];

/* ------------------------------- สถานะ + KPI ------------------------------ */

describe('statusGroupCounts / leaderKpis', () => {
  const pool = [
    leader('a', { status: 'available' }),
    leader('b', { status: 'available' }),
    leader('c', { status: 'available' }),
    leader('d', { status: 'unavailable' }),
    leader('e', { status: 'unavailable' }),
    leader('f', { usageStatus: 'suspended', status: 'unavailable' }),
  ];

  /** งานที่มอบหมายให้ 'c' และครอบวันนี้ → ติดงาน (สถานะประกอบ ไม่ใช่สถานะหลัก) */
  const jobs = [
    { id: 'J1', leaderId: 'c', status: 'traveling', departDate: '2026-07-10', returnDate: '2026-07-20' },
    { id: 'J2', leaderId: 'a', status: 'accepted', departDate: '2026-08-01', returnDate: '2026-08-05' }, // อนาคต → ยังไม่ติดงาน
    { id: 'J3', leaderId: 'b', status: 'draft', departDate: '2026-07-10', returnDate: '2026-07-20' }, // ร่าง → ไม่จองตัว
  ] as unknown as TourJob[];

  test('donut = มิติความพร้อมรับงาน 2 กลุ่ม (ไม่ปนสถานะการใช้งาน)', () => {
    const g = statusGroupCounts(pool);
    assert.deepEqual(g.map((x) => x.key), ['available', 'unavailable']);
    const by = Object.fromEntries(g.map((x) => [x.key, x.count]));
    assert.equal(by.available, 3);
    assert.equal(by.unavailable, 3); // d, e และ f (ถูกระงับ → ไม่พร้อมรับงานตามกฎ)
    assert.equal(g.reduce((s, x) => s + x.count, 0), 6); // หนึ่งคนนับครั้งเดียว
  });

  test('KPI: onJob คำนวณจากงานที่มอบหมาย · usageBlocked นับจากสถานะการใช้งาน', () => {
    const k = leaderKpis(pool, jobs, TODAY);
    assert.equal(k.total, 6);
    assert.equal(k.available, 3);
    assert.equal(k.onJob, 1); // เฉพาะ 'c' — งานอนาคต/งานร่างไม่นับ
    assert.equal(k.usageBlocked, 1); // เฉพาะ 'f' ที่ระงับการใช้งาน
  });

  test('usageBlockedCount นับเฉพาะมิติสถานะการใช้งาน — ไม่นับคนที่แค่ไม่พร้อมรับงาน', () => {
    assert.equal(usageBlockedCount(pool), 1);
    assert.equal(usageBlockedCount([leader('x', { status: 'unavailable' })]), 0);
    assert.equal(usageBlockedCount([leader('y', { usageStatus: 'ended' })]), 1);
  });

  test('onJobLeaderCount: ไม่มีงานครอบวันนี้ → 0 (ค่าหลักไม่เปลี่ยนตามงาน)', () => {
    assert.equal(onJobLeaderCount(pool, [], TODAY), 0);
    assert.equal(leaderKpis(pool, [], TODAY).available, 3); // ค่าหลักคงเดิม
  });
});

/* --------------------------------- ภาษา ---------------------------------- */

describe('languageCounts', () => {
  test('นับหลายภาษาต่อคน + เรียงมาก→น้อย + ภาษาแม่ก่อนเมื่อเท่ากัน', () => {
    const pool = [
      leader('a', { languages: [lang('อังกฤษ', true), lang('จีน')] }),
      leader('b', { languages: [lang('อังกฤษ'), lang('ญี่ปุ่น', true)] }),
      leader('c', { languages: [lang('ญี่ปุ่น')] }),
    ];
    const res = languageCounts(pool);
    // อังกฤษ=2, ญี่ปุ่น=2, จีน=1 ; อังกฤษ/ญี่ปุ่น เท่ากัน → ญี่ปุ่นมี native 1, อังกฤษ native 1 → เท่ากัน → เรียงชื่อไทย
    assert.equal(res[0].count, 2);
    assert.equal(res[1].count, 2);
    assert.equal(res.find((r) => r.language === 'จีน')?.count, 1);
    assert.equal(res.reduce((s, r) => s + r.count, 0), 5); // ไม่ใช่ 100% รวม
  });

  test('native มากกว่า → มาก่อนเมื่อจำนวนเท่ากัน', () => {
    const pool = [
      leader('a', { languages: [lang('X', true)] }),
      leader('b', { languages: [lang('Y')] }),
    ];
    const res = languageCounts(pool);
    assert.equal(res[0].language, 'X'); // count เท่ากัน (1) แต่ X เป็นภาษาแม่
  });
});

/* -------------------------------- ประเทศ --------------------------------- */

describe('countryCounts', () => {
  test('นับหลายประเทศต่อคน + ชื่อจาก Master + เรียงมาก→น้อย', () => {
    const pool = [
      leader('a', { routeSkills: [route('JP'), route('KR')] }),
      leader('b', { routeSkills: [route('JP')] }),
    ];
    const res = countryCounts(pool, COUNTRIES);
    assert.deepEqual(
      res.map((r) => [r.name, r.count]),
      [
        ['Japan', 2],
        ['Korea', 1],
      ],
    );
  });
});

/* ------------------------------ ประสบการณ์ ------------------------------- */

describe('experienceBandOf / experienceBandCounts', () => {
  test('map เดือน → ช่วง (ปีเต็ม)', () => {
    assert.equal(experienceBandOf(0), 'none');
    assert.equal(experienceBandOf(6), 'lt1');
    assert.equal(experienceBandOf(12), '1to3');
    assert.equal(experienceBandOf(47), '1to3');
    assert.equal(experienceBandOf(48), '4to6');
    assert.equal(experienceBandOf(84), '7to10');
    assert.equal(experienceBandOf(120), '7to10'); // 10 ปีพอดี
    assert.equal(experienceBandOf(131), '7to10'); // 10 ปี 11 เดือน — ยังไม่เกิน 10 ปี
    assert.equal(experienceBandOf(132), 'gt10'); // 11 ปี → มากกว่า 10 ปี
  });

  test('นับตามช่วง + งานปัจจุบันถึงวันนี้ + ช่วงซ้อนไม่นับซ้ำ + ไม่มีข้อมูล→none', () => {
    const pool = [
      leader('none', {}), // ไม่มีประสบการณ์
      leader('cur', { employmentHistory: [job({ startMonth: 1, startYear: 2026, isCurrentJob: true })] }), // 7 เดือน → lt1
      leader('overlap', {
        employmentHistory: [
          job({ id: 'a', startMonth: 1, startYear: 2020, endMonth: 12, endYear: 2021 }),
          job({ id: 'b', startMonth: 6, startYear: 2020, endMonth: 6, endYear: 2022 }),
        ],
      }), // รวม ม.ค.2020–มิ.ย.2022 = 30 เดือน → 1to3
    ];
    const bands = experienceBandCounts(pool, TODAY);
    const by = Object.fromEntries(bands.map((b) => [b.key, b.count]));
    assert.equal(by.none, 1);
    assert.equal(by.lt1, 1);
    assert.equal(by['1to3'], 1);
    assert.equal(bands.length, 6); // ครบทุกช่วงแม้เป็น 0
  });
});
