/**
 * ลำดับชั้นการวาด (z-index) ของทั้งระบบ — ตัวที่ต้องอยู่บนต้องมีค่าสูงกว่าจริง
 *
 * z เท่ากันเมื่อไร ตัวที่อยู่หลังใน DOM จะทับ ซึ่งเป็นที่มาของบั๊ก "layout ทับซ้อน" หลายรอบ
 * ชุดนี้ล็อกลำดับไว้ อ่านจากไฟล์ต้นทางโดยตรง
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Z_MODAL, ZEGO_TOPBAR } from '@/lib/z-index';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const TIMELINE = read('../src/components/jobs/GuideScheduleTimeline.tsx');

/** ค่า z จากคลาสที่ระบุ — ไม่เจอถือว่า 0 (auto) */
const zOf = (src: string, pattern: RegExp) => Number(src.match(pattern)?.[0].match(/z-(\d+)/)?.[1] ?? 0);

describe('ลำดับชั้นการวาด', () => {
  // Header.tsx ใช้ .zego-topbar (z:70 กำหนดใน zego-design-system.css) ตั้งแต่ปรับ AppShell —
  // ไม่มีคลาส Tailwind z-เลข ให้ regex scrape จากไฟล์ source แล้ว จึงอ่านจาก constant แทน
  const appHeader = ZEGO_TOPBAR;
  const boardHead = zOf(TIMELINE, /className="zego-border-color zego-surface-soft-bg sticky top-0 z-\d+ border-b"/);
  // Modal/Drawer ใช้ z-[160] (= Z_MODAL ใน @/lib/z-index) ตั้งแต่ปรับไปใช้ zego-design-system —
  // ไม่ใช่ Tailwind scale ธรรมดาแล้ว จึงอ่านค่าจาก constant โดยตรงแทนการ regex scrape ไฟล์ source
  const modal = Z_MODAL;

  test('แถบด้านบนของแอปสูงกว่าหัวตารางวันที่ — เมนูผู้ใช้จึงไม่ถูกพาดทับ', () => {
    assert.ok(appHeader > 0 && boardHead > 0, 'ต้องอ่านค่า z ได้ทั้งคู่');
    assert.ok(appHeader > boardHead, `แถบด้านบน (z-${appHeader}) ต้องสูงกว่าหัวตาราง (z-${boardHead})`);
  });

  test('Modal/Drawer สูงกว่าแถบด้านบน — ต้องคลุมทั้งหน้าจอได้', () => {
    assert.ok(modal > appHeader, `Modal (z-${modal}) ต้องสูงกว่าแถบด้านบน (z-${appHeader})`);
  });

  test('กล่องตัวเลือกของตัวกรองสูงกว่าหัวตาราง แต่ยังต่ำกว่า Modal', () => {
    const TAGS = read('../src/components/jobs/TagMultiSelect.tsx');
    const dropdown = zOf(TAGS, /className="absolute z-\d+ mt-1 w-full min-w-\[13rem\]/);
    assert.ok(dropdown > boardHead, `กล่องตัวเลือก (z-${dropdown}) ต้องสูงกว่าหัวตาราง (z-${boardHead})`);
    assert.ok(dropdown < modal, `กล่องตัวเลือก (z-${dropdown}) ต้องต่ำกว่า Modal (z-${modal})`);
  });

  test('แถบสรุปกรุ๊ปที่เลือกสูงกว่าหัวข้อเส้นทางในหน้าต่างเดียวกัน', () => {
    const footer = zOf(TIMELINE, /className="sticky bottom-0 z-\d+ -mx-1/);
    const groupHead = zOf(TIMELINE, /className="sticky top-0 z-\d+ -mx-1 mb-1\.5/);
    assert.ok(footer > groupHead, `แถบสรุป (z-${footer}) ต้องสูงกว่าหัวข้อเส้นทาง (z-${groupHead})`);
  });
});
