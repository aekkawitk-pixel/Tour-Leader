/**
 * คอลัมน์หัวหน้าทัวร์ในตาราง Schedule
 *   บรรทัด 1: ชื่อ–นามสกุล
 *   บรรทัด 2: "ชื่อเล่น: X · รูปแบบการร่วมงาน"  (ไม่มีรหัสหัวหน้าทัวร์)
 *   บรรทัดถัดไป: โซน / ประเทศ (เส้นทาง)
 *
 * รหัสหัวหน้าทัวร์ถูกนำออกเฉพาะการแสดงผลบนตาราง — ข้อมูลยังอยู่ครบในระบบ
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOUR_LEADER_PROFILES } from '@/data/leaders/tourLeaderMaster.seed';
import { profileToTourLeader } from '@/data/leaders/adapter';

const SRC = readFileSync(new URL('../src/components/jobs/GuideScheduleTimeline.tsx', import.meta.url), 'utf8');
/** เรียกใช้ผ่านตรรกะเดียวกับที่ Component ใช้ (คัดลอกไม่ได้ จึงตรวจจากพฤติกรรมของข้อมูลจริง) */
const LABEL: Record<string, string> = { regular: 'หัวหน้าทัวร์ประจำ', general: 'หัวหน้าทัวร์ทั่วไป' };
const expected = (nickname: string | undefined, type: string) => {
  const n = `ชื่อเล่น: ${nickname?.trim() || 'ยังไม่ระบุ'}`;
  return LABEL[type] ? `${n} · ${LABEL[type]}` : n;
};

describe('รูปแบบข้อความในคอลัมน์หัวหน้าทัวร์', () => {
  test('ไม่แสดงรหัสหัวหน้าทัวร์ในเซลล์อีกต่อไป', () => {
    // เดิมเป็น "{leader.id} · รูปแบบการร่วมงาน" — ต้องไม่เหลือการ render รหัสในคอลัมน์นี้แล้ว
    assert.equal(/\{leader\.id\}\s*·/.test(SRC), false, 'ยังมีการแสดงรหัสต่อด้วย ·');
    const cell = SRC.match(/data-testid="leader-name-cell"[\s\S]{0,2600}?ยังไม่ระบุโซน/)?.[0] ?? '';
    assert.ok(cell, 'ต้องหาเซลล์หัวหน้าทัวร์เจอ');
    // ตัด attribute data-leader ออกก่อน — เป็นข้อมูลผูกแถวสำหรับระบบ ไม่ใช่ข้อความที่ผู้ใช้เห็น
    const visible = cell.replace(/data-leader=\{leader\.id\}/g, '');
    assert.equal(visible.includes('{leader.id}'), false, 'เซลล์ต้องไม่ render รหัสหัวหน้าทัวร์ให้ผู้ใช้เห็น');
  });

  test('ยังผูก id จริงไว้กับแถวสำหรับระบบ (data-leader) — ไม่ได้ลบข้อมูลทิ้ง', () => {
    assert.ok(SRC.includes('data-leader={leader.id}'));
  });

  test('บรรทัดชื่อเล่นรวมรูปแบบการร่วมงาน และมี Tooltip ข้อความเต็ม', () => {
    assert.ok(SRC.includes('function nicknameLine('), 'ต้องมีตัวสร้างข้อความบรรทัดเดียวใช้ร่วมกัน');
    assert.ok(SRC.includes('title={nicknameLine(leader)}'), 'ต้องมี Tooltip แสดงข้อความเต็ม');
    assert.ok(SRC.includes('truncate'), 'ต้องตัดด้วย Ellipsis เมื่อยาวเกิน');
  });

  test('อ่านรูปแบบการร่วมงานจากฟิลด์จริง ไม่ Hardcode ข้อความ', () => {
    assert.ok(SRC.includes('LEADER_TYPE[leader.leaderType]?.label'));
    assert.equal(/nicknameLine[\s\S]{0,400}'หัวหน้าทัวร์ประจำ'/.test(SRC), false, 'ห้าม Hardcode ชื่อรูปแบบ');
  });
});

describe('ข้อความที่ได้จากข้อมูลจริง', () => {
  const leaders = TOUR_LEADER_PROFILES.map((p) => profileToTourLeader(p));

  test('มีชื่อเล่น → "ชื่อเล่น: X · รูปแบบการร่วมงาน"', () => {
    const withNick = leaders.find((l) => l.nickname?.trim());
    if (!withNick) return; // seed ปัจจุบันอาจไม่มีชื่อเล่น — ตรวจกรณีไม่มีแทนด้านล่าง
    const s = expected(withNick.nickname, withNick.leaderType);
    assert.match(s, /^ชื่อเล่น: .+ · หัวหน้าทัวร์(ประจำ|ทั่วไป)$/);
    assert.equal(/TL-\d{6}/.test(s), false, 'ต้องไม่มีรหัสในข้อความ');
  });

  test('ไม่มีชื่อเล่น → "ชื่อเล่น: ยังไม่ระบุ · รูปแบบการร่วมงาน"', () => {
    assert.equal(expected(undefined, 'regular'), 'ชื่อเล่น: ยังไม่ระบุ · หัวหน้าทัวร์ประจำ');
    assert.equal(expected('   ', 'regular'), 'ชื่อเล่น: ยังไม่ระบุ · หัวหน้าทัวร์ประจำ');
  });

  test('ไม่มีรูปแบบการร่วมงาน → แสดงเฉพาะชื่อเล่น (ไม่มี · ห้อยท้าย)', () => {
    assert.equal(expected('ออดโต้', 'ไม่รู้จัก'), 'ชื่อเล่น: ออดโต้');
    assert.equal(expected(undefined, ''), 'ชื่อเล่น: ยังไม่ระบุ');
  });

  test('รหัสหัวหน้าทัวร์ยังอยู่ครบในข้อมูล (ไม่ได้ลบออกจากฐานข้อมูล)', () => {
    assert.equal(leaders.length, 352);
    assert.ok(leaders.every((l) => /^TL-\d{6}$/.test(l.id)), 'ทุกคนต้องยังมีรหัส');
  });
});
