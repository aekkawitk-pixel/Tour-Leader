/**
 * พิมพ์ใบเบิกค่าส่งกรุ๊ป (A4) — เปิดหน้าต่างใหม่แล้วสั่งพิมพ์ (บันทึกเป็น PDF ได้จากหน้าต่างพิมพ์ของเบราว์เซอร์)
 * รูปแบบเดียวกับใบปะหน้าซอง (CashEnvelopeDrawer.printLabel): เขียน HTML ทั้งหน้าเอง ฟอนต์ Sarabun
 * มีช่องลงชื่อ ผู้เบิก / ผู้ตรวจสอบ / ผู้อนุมัติ ไว้ยื่นบัญชีเป็นเอกสาร
 */

import { EXPENSE_STATUS } from '@/lib/labels';
import { formatCurrency, formatDate, formatDateTime, formatThaiMonthYear } from '@/lib/format';
import { isHolidayFeeLine, SEND_OFF_FEE_TYPE } from '@/lib/logic/staffPortal';
import { holidayOf } from '@/services/holidayService';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import type { ExpenseRequest } from '@/types';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number) => esc(formatCurrency(n, 'THB'));

export function printSendOffClaim(expense: ExpenseRequest, staffName: string): void {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return;

  const title = expense.claimMonth ? `ใบเบิกค่าส่งกรุ๊ป เดือน${formatThaiMonthYear(`${expense.claimMonth}-01`)}` : 'ใบเบิกค่าส่งกรุ๊ป';
  const active = expense.lines.filter((l) => !l.rejected);
  const total = active.reduce((s, l) => s + l.amount, 0);

  const rows = expense.lines.map((l, i) => {
    const isFee = l.expenseType === SEND_OFF_FEE_TYPE;
    const period = getTourPeriodById(l.periodId ?? (isFee ? expense.jobId : '')) ?? null;
    const item = isFee
      ? `<b>${esc(period?.groupCode ?? l.periodId ?? '')}</b><div class="sub">${esc(period?.displayName ?? '')}</div>`
      : `<b>${esc(l.expenseType)}</b>${l.evidenceFileName ? '<div class="sub">แนบใบเสร็จ</div>' : ''}`;
    const holiday = isFee && l.receiptDate ? holidayOf(l.receiptDate)?.name : undefined;
    const rate = !isFee ? '' : l.note ? l.note : isHolidayFeeLine(l) ? `อัตราวันหยุด${holiday ? ` (${holiday})` : ''}` : 'อัตราปกติ';
    return `<tr class="${l.rejected ? 'rej' : ''}">
      <td class="c">${i + 1}</td>
      <td>${esc(isFee ? 'ค่าส่งกรุ๊ป' : 'ค่าใช้จ่ายอื่น')}</td>
      <td>${item}</td>
      <td class="c">${esc(formatDate(l.receiptDate))}</td>
      <td>${esc(rate)}${l.rejected ? '<div class="sub">ไม่อนุมัติ</div>' : ''}</td>
      <td class="r">${money(l.amount)}</td>
    </tr>`;
  }).join('');

  const bank = expense.bankAccount;
  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)} ${esc(expense.id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{font-family:'Sarabun',system-ui,sans-serif;color:#0f172a;font-size:11pt;margin:0;background:#e2e8f0}
.page{width:210mm;min-height:297mm;margin:0 auto;background:#fff;padding:14mm}
h1{font-size:17pt;margin:0}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;border-bottom:.5mm solid #0f172a;padding-bottom:3mm}
.meta{text-align:right;font-size:10pt;line-height:1.5}
.muted{color:#64748b}
.info{display:grid;grid-template-columns:auto 1fr auto 1fr;gap:1mm 4mm;margin:4mm 0;font-size:10.5pt}
.info dt{color:#64748b}
table{width:100%;border-collapse:collapse;font-size:10pt}
th,td{border:.3mm solid #94a3b8;padding:1.6mm 2mm;vertical-align:top}
th{background:#f1f5f9;font-weight:600}
.c{text-align:center}.r{text-align:right;white-space:nowrap}
.sub{font-size:9pt;color:#64748b}
tr.rej td{color:#94a3b8;text-decoration:line-through}
tfoot td{font-weight:700;font-size:11pt}
.note{margin-top:3mm;font-size:10pt}
.sign{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;margin-top:16mm;text-align:center;font-size:10pt}
.sign .line{border-bottom:.3mm dotted #0f172a;height:12mm;margin-bottom:1.5mm}
@media print{body{background:#fff}.page{width:auto;min-height:0;margin:0;padding:0}}
</style></head><body><div class="page">
<div class="head">
  <div><h1>${esc(title)}</h1><div class="muted">เจ้าหน้าที่ส่งกรุ๊ป</div></div>
  <div class="meta">เลขที่ <b>${esc(expense.id)}</b><br>ยื่นเมื่อ ${esc(formatDateTime(expense.submittedAt ?? expense.requestedAt))}<br>สถานะ ${esc(EXPENSE_STATUS[expense.status].label)}</div>
</div>
<dl class="info">
  <dt>ผู้เบิก</dt><dd>${esc(staffName)}</dd>
  <dt>รหัส</dt><dd>${esc(expense.requesterId)}</dd>
  <dt>โอนเข้าบัญชี</dt><dd>${esc([bank.bank, bank.accountNoMasked].filter(Boolean).join(' ') || '—')}</dd>
  <dt>ชื่อบัญชี</dt><dd>${esc(bank.accountName || '—')}</dd>
</dl>
<table>
  <thead><tr><th class="c" style="width:9mm">#</th><th style="width:26mm">ประเภท</th><th>กรุ๊ป / รายการ</th><th class="c" style="width:22mm">วันไปส่ง</th><th style="width:34mm">อัตรา</th><th class="r" style="width:28mm">จำนวนเงิน</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="5" class="r">รวมทั้งสิ้น (${active.length} รายการ)</td><td class="r">${money(total)}</td></tr></tfoot>
</table>
${expense.note ? `<div class="note"><span class="muted">หมายเหตุ:</span> ${esc(expense.note)}</div>` : ''}
<div class="sign">
  <div><div class="line"></div>ผู้เบิก<br><span class="muted">(${esc(staffName)})</span><br>วันที่ ........../........../..........</div>
  <div><div class="line"></div>ผู้ตรวจสอบ<br><span class="muted">(..............................................)</span><br>วันที่ ........../........../..........</div>
  <div><div class="line"></div>ผู้อนุมัติ<br><span class="muted">(..............................................)</span><br>วันที่ ........../........../..........</div>
</div>
</div>
<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){setTimeout(function(){window.print()},150)})</script>
</body></html>`);
  w.document.close();
}
