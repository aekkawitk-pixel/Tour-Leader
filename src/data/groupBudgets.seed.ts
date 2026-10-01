/**
 * ตัวอย่างงบประมาณต่อกรุ๊ป (§ ตั้งงบล่วงหน้า) — ในระบบจริงมาจากการทำเบิกของโอพี แต่ในระบบนี้ยังไม่มีหน้าให้โอพีสร้างเอง
 * จึงใช้ข้อมูลตัวอย่างชุดนี้แทน (ตั้งไว้ล่วงหน้า/รอไว้ให้ฟอร์มหัวหน้าทัวร์ดึงไปกรอกยอดใช้จริง)
 *
 * ผูกกับพีเรียดญี่ปุ่นจริงใน periods.seed.ts (tourCode "KIX-260821W-VZ" · โอซาก้า เกียวโต ชินไซบาชิ)
 * ตัวเลขในตัวอย่าง (รายการ/จำนวน/ราคาต่อหน่วย/อัตราแลกเปลี่ยน) อ้างอิงจากใบทำเบิกตัวอย่างจริงที่ผู้ใช้แนบมา
 */

import type { BudgetLine, GroupBudget } from '@/types';

const FX_RATE_JPY = 0.2084;

function line(
  id: string,
  category: string,
  name: string,
  description: string,
  quantity: number,
  unitPrice: number,
  discount = 0,
): BudgetLine {
  const budgetedAmount = quantity * unitPrice - discount;
  return {
    id,
    category,
    name,
    description,
    quantity,
    unitPrice,
    discount,
    currency: 'JPY',
    fxRate: FX_RATE_JPY,
    budgetedAmount,
    budgetedAmountTHB: Math.round(budgetedAmount * FX_RATE_JPY),
  };
}

export const groupBudgetsSeed: GroupBudget[] = [
  {
    id: 'BUD-2026-001',
    periodId: 'KIX-260821W-VZ-ZGKIX-2621VZ-2026-08-21-476',
    lines: [
      line('BL-001', 'ค่าเข้าชมสถานที่', 'Moai Atama Daibutsu', 'ค่าเข้าสถานที่', 34, 500),
      line('BL-002', 'ค่าเข้าชมสถานที่', 'Asahiyama Zoo', 'สวนสัตว์อะซาฮิยาม่า', 34, 1000),
      line('BL-003', 'ค่าเบ็ดเตล็ด', 'ค่าทางด่วน', '', 1, 100000),
      line('BL-004', 'ค่าเบ็ดเตล็ด', 'ค่าอาหารไกด์ (เส้นทางญี่ปุ่น)', 'ค่าอาหารไกด์ระหว่างเดินทาง', 3, 1500),
      line('BL-005', 'ค่าเบ็ดเตล็ด', 'ค่าโทรศัพท์ (เส้นทางญี่ปุ่น)', 'ค่าโทรศัพท์ระหว่างเดินทาง', 3, 1000),
      line('BL-006', 'ค่าเบ็ดเตล็ด', 'ค่าอาหารคนขับ', '', 1, 7500),
      line('BL-007', 'ค่าเบ็ดเตล็ด', 'ค่าน้ำ (เส้นทางญี่ปุ่น)', 'ค่าน้ำระหว่างเดินทาง', 34, 300),
      line('BL-008', 'ค่ายานพาหนะ', 'ค่ารถบัส', '85,000 x 4 Days', 4, 85000),
      line('BL-009', 'ค่าอาหาร', 'Herb Garden', 'ลูกค้า', 34, 2200),
      line('BL-010', 'ค่าอาหาร', 'Herb Garden', 'ไกด์ + คนขับ', 2, 500),
      line('BL-011', 'ค่าอาหาร', 'Musubi', 'ลูกค้า', 34, 2500),
      line('BL-012', 'ค่าอาหาร', 'Musubi', 'ไกด์', 1, 1250),
      line('BL-013', 'ค่าอาหาร', 'Otaru Unga Ushio-Tei', 'ลูกค้า + ไกด์', 35, 2200),
    ],
  },
];
