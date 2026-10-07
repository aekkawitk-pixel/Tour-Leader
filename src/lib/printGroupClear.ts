/**
 * พิมพ์ "ใบเคลียร์เงินกรุ๊ป" (A4 แนวตั้ง) — สรุปเงินในซองแยกสกุล และผลของแต่ละสกุล
 *   ใช้เงินครบ          = คงเหลือ 0 ไม่ต้องคืน ไม่ต้องจ่ายเพิ่ม
 *   หัวหน้าทัวร์คืนเงิน    = คงเหลือ > 0 · ยอดต้องคืน / รับคืนจริง / ค้าง
 *   ใช้เกินเงินในซอง     = คงเหลือ < 0 · บริษัทจ่ายเพิ่ม / ไม่อนุมัติจ่ายเพิ่ม (พร้อมเหตุผล) / ยังไม่ตัดสิน
 * ใบเสร็จนอกรายการเบิกไม่ใช่เงินในซอง — แสดงแยกท้ายเอกสาร ไม่อยู่ในการคำนวณ
 * ช่องลงชื่อ: หัวหน้าทัวร์ · การเงิน · ผู้อนุมัติ (เฉพาะมียอดใช้เกิน)
 */

import { formatDate, formatDateRange, formatDateTime } from '@/lib/format';
import { settlementBreakdown, type GroupClearSummary } from '@/lib/logic/groupClear';
import type { ClearSettlement } from '@/services/groupClearStore';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { ExpenseRequest } from '@/types';
import { requestedAtOf } from '@/app/guide/expenses/expenseAmounts';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const num = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const EPS = 0.005;

type Amt = { currency: string; amount: number };

export function printGroupClear(input: {
  summary: GroupClearSummary;
  period: TourPeriodMaster | null;
  leaderName: string;
  returned: ClearSettlement[];
  paidExtra: ClearSettlement[];
  rejectedExtra: (Amt & { reason: string })[];
  outsideReceipts: ExpenseRequest[];
  note?: string;
  /** ปิดแล้ว — ไม่มี = ฉบับร่าง (ยังไม่ปิดการเคลียร์) */
  closed?: { at: string; by: string; kind?: 'complete' | 'partial' };
  printedBy: string;
}): void {
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) return;
  const { summary: s, period: p } = input;
  const amt = (list: Amt[], c: string) => list.filter((x) => x.currency === c).reduce((n, x) => n + x.amount, 0);
  /** แจกแจงการคืน/จ่าย — มีสกุลอื่น (พร้อมอัตรา) หรือหลายรายการ */
  const detail = (list: ClearSettlement[], c: string) => settlementBreakdown(list, c).map((t) => `<br><span class="d">· ${esc(t)}</span>`).join('');

  const rows = s.balance.map((b) => {
    let result: string;
    if (Math.abs(b.remaining) < EPS) {
      result = '<b class="ok">ใช้เงินครบ</b><br><span class="d">ไม่ต้องคืน · ไม่ต้องจ่ายเพิ่ม</span>';
    } else if (b.remaining > 0) {
      const ret = amt(input.returned, b.currency);
      const short = b.remaining - ret;
      const status = short > EPS ? ` · <span class="bad">ค้างคืน ${num(short)}</span>` : ret - b.remaining > EPS ? ` · คืนเกิน ${num(ret - b.remaining)}` : ' · ครบ';
      result = `<b>หัวหน้าทัวร์คืนเงิน ${num(b.remaining)}</b><br><span class="d">รับคืนจริง ${num(ret)} ${esc(b.currency)}${status}</span>${detail(input.returned, b.currency)}`;
    } else {
      const over = -b.remaining;
      const paid = amt(input.paidExtra, b.currency);
      const rej = input.rejectedExtra.filter((x) => x.currency === b.currency);
      const rejAmt = rej.reduce((n, x) => n + x.amount, 0);
      const open = over - paid - rejAmt;
      result = [
        `<b>ใช้เกินเงินในซอง ${num(over)}</b>`,
        paid > EPS && `<span class="d">บริษัทจ่ายเพิ่ม ${num(paid)} ${esc(b.currency)}</span>${detail(input.paidExtra, b.currency)}`,
        ...rej.map((x) => `<span class="bad">ไม่อนุมัติจ่ายเพิ่ม ${num(x.amount)}</span><br><span class="d">เหตุผล: ${esc(x.reason)}</span>`),
        open > EPS && `<span class="bad">รอพิจารณา ${num(open)}</span>`,
      ].filter(Boolean).join('<br>');
    }
    return `<tr>
      <td class="cur">${esc(b.currency)}</td>
      <td class="r">${num(b.face)}</td>
      <td class="r">${num(b.land)}</td>
      <td class="r">${num(b.spent)}${b.pending > 0 ? `<br><span class="d">รอตรวจ ${num(b.pending)}</span>` : ''}</td>
      <td class="r"><b>${num(Math.abs(b.remaining))}</b></td>
      <td>${result}</td>
    </tr>`;
  }).join('');

  const hasOver = s.balance.some((b) => b.remaining < -EPS);
  const hasPending = s.balance.some((b) => b.pending > 0) || s.toReview.receipts + s.atLeader.receipts > 0;
  const cell = (label: string, value: string, span = 1) => `<td class="k">${esc(label)}</td><td${span > 1 ? ` colspan="${span}"` : ''}>${esc(value) || '&nbsp;'}</td>`;
  const status = input.closed
    ? `ปิดการเคลียร์${input.closed.kind === 'partial' ? 'แบบมีค้าง' : ''} ${formatDateTime(input.closed.at)} · ${input.closed.by}`
    : 'ฉบับร่าง — ยังไม่ปิดการเคลียร์';
  const outside = input.outsideReceipts.map((r) => `<tr>
      <td>${esc(r.lines[0]?.purpose || r.lines[0]?.expenseType || 'ใบเสร็จ')}<br><span class="d">บันทึก ${esc(formatDateTime(requestedAtOf(r)))}</span></td>
      <td class="r">${r.lines.filter((l) => !l.rejected).map((l) => `${num(l.amount)} ${esc(l.currency)}`).join('<br>')}</td>
    </tr>`).join('');

  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>ใบเคลียร์เงินกรุ๊ป ${esc(p?.groupCode ?? s.periodId)}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4 portrait;margin:14mm}
*{box-sizing:border-box}
body{font-family:'Sarabun',system-ui,sans-serif;color:#0f172a;margin:0;font-size:11pt}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.6mm solid #0f172a;padding-bottom:2mm;margin-bottom:4mm}
h1{font-size:16pt;margin:0}
h2{font-size:12pt;margin:0 0 2mm}
.ref{font-size:9pt;color:#475569;text-align:right;line-height:1.4}
table{width:100%;border-collapse:collapse;margin-bottom:5mm}
th,td{border:.35mm solid #0f172a;padding:1.6mm 2mm;vertical-align:top}
th{background:#f1f5f9;font-weight:600;white-space:nowrap}
table.info td{border:.25mm solid #94a3b8}
table.info td.k{background:#f1f5f9;font-weight:600;white-space:nowrap;width:30mm}
td.r{text-align:right;white-space:nowrap}
td.cur{text-align:center;white-space:nowrap;width:14mm}
.d{color:#334155;font-size:10pt}
.ok{color:#047857}
.bad{color:#b91c1c}
.box{border:.3mm solid #94a3b8;border-radius:1.5mm;padding:2mm 3mm;margin-bottom:5mm;font-size:10pt}
.warn{border-color:#d97706;background:#fffbeb}
.sign{display:grid;grid-template-columns:repeat(${hasOver ? 3 : 2},1fr);gap:10mm;margin-top:12mm;text-align:center}
.sign .line{border-bottom:.3mm solid #0f172a;height:12mm;margin-bottom:1.5mm;display:flex;align-items:flex-end;justify-content:center}
.muted{color:#64748b;font-size:9pt}
</style></head><body>
<div class="head">
  <h1>ใบเคลียร์เงินกรุ๊ป</h1>
  <div class="ref">${esc(p?.groupCode ?? s.periodId)}<br>${esc(status)}</div>
</div>
<table class="info">
  <tr>${cell('Code กรุ๊ป', p?.groupCode ?? s.periodId)}${cell('เดินทาง', p ? formatDateRange(p.startDate, p.endDate) : '')}</tr>
  <tr>${cell('โปรแกรม', p?.displayName ?? '', 3)}</tr>
  <tr>${cell('หัวหน้าทัวร์', input.leaderName, 3)}</tr>
</table>
${hasPending ? '<div class="box warn">ยังมีใบเสร็จรอตรวจ / หัวหน้าทัวร์ยังไม่ส่ง — ยอดในเอกสารนี้อาจเปลี่ยน</div>' : ''}
<h2>สรุปเงินในซอง (แยกสกุล)</h2>
<table>
  <thead><tr><th>สกุล</th><th>ในซอง (รับแล้ว)</th><th>ส่งแลนด์</th><th>ใช้ตามใบเสร็จ</th><th>คงเหลือ / เกิน</th><th>ผลการเคลียร์</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="6" style="text-align:center">ไม่มีเงินในซอง</td></tr>'}</tbody>
</table>
${outside ? `<h2>ค่าใช้จ่ายนอกรายการเบิก <span class="muted">(ไม่ใช่เงินในซอง — ไม่หักจากคงเหลือ)</span></h2>
<table><thead><tr><th>รายการ</th><th>จำนวนเงิน</th></tr></thead><tbody>${outside}</tbody></table>` : ''}
${input.note ? `<p class="muted">หมายเหตุ: ${esc(input.note)}</p>` : ''}
<div class="sign">
  <div><div class="line">${esc(input.leaderName)}</div><b>หัวหน้าทัวร์</b><br>วันที่ ........./........./.........</div>
  <div><div class="line">${input.closed ? esc(input.closed.by) : ''}</div><b>การเงิน</b><br>วันที่ ${input.closed ? esc(formatDate(input.closed.at)) : '........./........./.........'}</div>
  ${hasOver ? '<div><div class="line"></div><b>ผู้อนุมัติ (ส่วนที่ใช้เกิน)</b><br>วันที่ ........./........./.........</div>' : ''}
</div>
<p class="muted" style="margin-top:8mm">พิมพ์โดย ${esc(input.printedBy)} · ${esc(formatDateTime(new Date().toISOString()))} · พิมพ์จากระบบจัดการหัวหน้าทัวร์</p>
<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){setTimeout(function(){window.print()},150)})</script>
</body></html>`);
  w.document.close();
}
