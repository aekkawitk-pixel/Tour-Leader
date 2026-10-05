/**
 * รายการเคลียร์แบบเดิม (Settlement ผูกกับงานทัวร์ JOB-…) — ว่างไว้ ไม่มีข้อมูลจำลองแล้ว
 *
 * เมนู "เคลียร์เงินกรุ๊ป" (/settlements) คำนวณจากข้อมูลจริง (ซองเงิน · ใบเสร็จ · เบี้ยเลี้ยง) ดู src/lib/logic/groupClear.ts
 * ข้อมูลชุดเก่า STL-2026-001…005 ถูกเอาออกตามที่ตกลง (ไม่ตรงกับกรุ๊ปจริง ทำให้ตัวเลขชวนเข้าใจผิด)
 */

import type { Settlement } from '@/types';

export const settlements: Settlement[] = [];
