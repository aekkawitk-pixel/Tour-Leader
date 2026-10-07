/**
 * พิมพ์ "เอกสารค่าใช้จ่ายหัวหน้าทัวร์" — หน้าตาตามแบบฟอร์มกระดาษของบริษัท (A4 แนวตั้ง)
 *
 * หัวเอกสาร (ตาราง 2 คอลัมน์ ป้ายชิดซ้าย ค่าเรียงตรงกัน): จ่ายเงินให้ · Code กรุ๊ป · โปรแกรมทัวร์ (รหัส) · เดินทาง
 *   · โปรแกรม (เต็มแถว) · จำนวน (ท่าน + หัวหน้าทัวร์) · ลูกค้ายกเลิก
 * ตาราง 5 รายการตั้งต้น (LEADER_FORM_ITEMS) + รายการที่หัวหน้าทัวร์เพิ่มเอง ต่อท้าย
 *   คอลัมน์ จำนวนเงิน + สกุลเงิน แยกกัน (เห็นสกุลทุกบรรทัด) · ท้ายตารางรวมแยกทีละสกุล (มีหลายสกุล = หลายแถวรวม)
 * รายละเอียดการโอนเงิน (เลขบัญชีปิดบังตามที่ระบบเก็บ) · ช่องลงชื่อผู้จัดทำ / ผู้รับเอกสาร (แผนกบัญชี)
 * ใช้ได้ทั้งพอร์ทัลหัวหน้าทัวร์และหน้าจัดการค่าใช้จ่ายกรุ๊ป (แท็บเบี้ยเลี้ยง)
 */

import { formatCurrency, formatDate, formatDateRange } from '@/lib/format';
import { LEADER_FORM_ITEMS } from '@/lib/logic/leaderClaims';
import type { ExpenseRequest } from '@/types';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import { periodCodeOf } from '@/services/tourPeriodMaster';

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const num = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function printLeaderExpenseForm(claim: ExpenseRequest, period: TourPeriodMaster | null, phone?: string): void {
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) return;
  const f = claim.claimForm;
  const lines = claim.lines.filter((l) => !l.rejected);
  const lineOf = (item: string) => lines.filter((l) => l.expenseType === item);
  const others = lines.filter((l) => !(LEADER_FORM_ITEMS as readonly string[]).includes(l.expenseType));
  // ใบเก่า (ก่อนมีแบบฟอร์ม — ไม่มี claimForm) มีรายการเดียวชื่อ "เบี้ยเลี้ยง" — นับเป็นข้อ 1
  const legacy = f ? [] : others;
  // รายการที่หัวหน้าทัวร์เพิ่มเอง (ตั้งชื่อเอง) — ต่อท้ายข้อตั้งต้น ชื่อเดียวกันรวมเป็นแถวเดียว
  const addedNames = f ? [...new Set(others.map((l) => l.expenseType))] : [];

  const rows = [...LEADER_FORM_ITEMS, ...addedNames].map((item, i) => {
    const ls = i === 0 ? [...lineOf(item), ...legacy] : lineOf(item);
    // ราคา × จำนวน — เบี้ยเลี้ยงแสดงเสมอ (อัตรา × วัน) · รายการอื่นแสดงเมื่อจำนวนไม่ใช่ 1
    const detail = ls.map((l) => {
      const calc = l.unitPrice && l.quantity && (i === 0 || l.quantity !== 1) ? `${num(l.unitPrice)} × ${l.quantity}` : '';
      const text = i === 0 ? '' : l.description ?? '';
      return [text, calc].filter(Boolean).join(' ');
    }).filter(Boolean).join(', ');
    // ยอดของข้อนี้แยกตามสกุล — ข้อเดียวมีได้หลายสกุล (เช่น เพิ่มรายการชื่อซ้ำคนละสกุล)
    const byCur = new Map<string, number>();
    for (const l of ls) byCur.set(l.currency, (byCur.get(l.currency) ?? 0) + l.amount);
    const note = ls.map((l) => l.note ?? '').filter(Boolean).join(', ');
    return `<tr>
      <td class="c">${i + 1}</td>
      <td><b>${esc(item)}</b>${detail ? ` <span class="d">${esc(detail)}</span>` : ''}</td>
      <td class="r">${[...byCur.values()].map(num).join('<br>')}</td>
      <td class="cur">${[...byCur.keys()].map(esc).join('<br>')}</td>
      <td>${esc(note)}</td>
    </tr>`;
  }).join('');

  // รวมทีละสกุล — บาทขึ้นก่อน แล้วสกุลอื่นตามลำดับที่พบ
  const totals = new Map<string, number>();
  for (const l of [...lines].sort((a, b) => Number(b.currency === 'THB') - Number(a.currency === 'THB'))) {
    totals.set(l.currency, (totals.get(l.currency) ?? 0) + l.amount);
  }
  const sumRows = [...totals].map(([c, a], k) => `<tr class="sum">
      ${k === 0 ? `<td rowspan="${totals.size}"></td><td rowspan="${totals.size}" style="text-align:center">รวม${totals.size > 1 ? 'แยกสกุลเงิน' : ''}</td>` : ''}
      <td class="r">${num(a)}</td><td class="cur">${esc(c)}</td>
      ${k === 0 ? `<td rowspan="${totals.size}"></td>` : ''}
    </tr>`).join('');
  /** ช่องในตารางหัวเอกสาร — ป้าย (พื้นเทา) + ค่า · span = ค่ากินหลายคอลัมน์ (เช่น ชื่อโปรแกรมยาว) */
  const cell = (label: string, value: string, span = 1) => `<td class="k">${esc(label)}</td><td${span > 1 ? ` colspan="${span}"` : ''}>${esc(value) || '&nbsp;'}</td>`;
  const bank = claim.bankAccount;
  const leaderCount = f?.leaderCount ?? 1;
  const paidNote = claim.status === 'paid' ? `โอนแล้ว${claim.paidAt ? ` ${formatDate(claim.paidAt)}` : ''}${claim.paidRef ? ` · อ้างอิง ${claim.paidRef}` : ''}` : '';

  w.document.write(`<!doctype html><html lang="th"><head><meta charset="utf-8"><title>เอกสารค่าใช้จ่ายหัวหน้าทัวร์ ${esc(period?.groupCode ?? periodCodeOf(claim.jobId))}</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4 portrait;margin:14mm}
*{box-sizing:border-box}
body{font-family:'Sarabun',system-ui,sans-serif;color:#0f172a;margin:0;font-size:11pt}
.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:.6mm solid #0f172a;padding-bottom:2mm;margin-bottom:4mm}
h1{font-size:16pt;margin:0}
.ref{font-size:9pt;color:#475569;text-align:right;line-height:1.4}
table.info{margin-bottom:5mm}
table.info td{border:.25mm solid #94a3b8;padding:1.6mm 2.5mm;vertical-align:top}
table.info td.k{background:#f1f5f9;font-weight:600;white-space:nowrap;width:30mm}
.wrap{position:relative}
table{width:100%;border-collapse:collapse;margin-bottom:5mm}
th,td{border:.35mm solid #0f172a;padding:1.6mm 2mm;vertical-align:top}
th{background:#f1f5f9;font-weight:600}
td.c{text-align:center;width:10mm}
td.r{text-align:right;white-space:nowrap;width:30mm}
td.cur{text-align:center;white-space:nowrap;width:18mm}
th{white-space:nowrap}
.d{color:#334155}
tr.sum td{font-weight:700}
h2{font-size:12pt;margin:0 0 2mm}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:14mm;margin-top:12mm;text-align:center}
.sign .line{border-bottom:.3mm solid #0f172a;height:12mm;margin-bottom:1.5mm;display:flex;align-items:flex-end;justify-content:center}
.muted{color:#64748b;font-size:9pt}
</style></head><body><div class="wrap">
<div class="head">
  <h1>เอกสารค่าใช้จ่ายหัวหน้าทัวร์</h1>
  <div class="ref">เลขที่ ${esc(claim.id)}${paidNote ? `<br>${esc(paidNote)}` : ''}</div>
</div>
<table class="info">
  <tr>${cell('จ่ายเงินให้', claim.requesterName)}${cell('Code กรุ๊ป', period?.groupCode ?? periodCodeOf(claim.jobId))}</tr>
  <tr>${cell('โปรแกรมทัวร์', period?.programCode ?? '')}${cell('เดินทาง', period ? formatDateRange(period.startDate, period.endDate) : '')}</tr>
  <tr>${cell('โปรแกรม', period?.displayName ?? '', 3)}</tr>
  <tr>${cell('จำนวน', f?.paxCount != null ? `${f.paxCount} ท่าน${leaderCount > 0 ? ` + ${leaderCount}` : ''}` : '')}${cell('ลูกค้ายกเลิก', f?.cancelledPax != null ? `${f.cancelledPax} คน` : '-')}</tr>
</table>
<table>
  <thead>
    <tr><th>No.</th><th>รายละเอียด</th><th>จำนวนเงิน</th><th>สกุลเงิน</th><th>หมายเหตุ</th></tr>
  </thead>
  <tbody>
    ${rows}
    ${sumRows || '<tr class="sum"><td></td><td style="text-align:center">รวม</td><td class="r">-</td><td></td><td></td></tr>'}
  </tbody>
</table>
${claim.note ? `<p class="muted">หมายเหตุ: ${esc(claim.note)}</p>` : ''}
<h2>รายละเอียดการโอนเงิน</h2>
<table class="info">
  <tr>${cell('ชื่อบัญชี', bank.accountName)}${cell('ธนาคาร', bank.bank)}</tr>
  <tr>${cell('เลขที่บัญชี', bank.accountNoMasked)}${cell('เบอร์ติดต่อ', f?.contactPhone ?? phone ?? '')}</tr>
</table>
<div class="sign">
  <div><div class="line">${esc(claim.requesterName)}</div><b>ผู้จัดทำ (ไกด์/หัวหน้าทัวร์)</b><br>วันที่ ${esc(formatDate(claim.submittedAt ?? claim.requestedAt))}</div>
  <div><div class="line"></div><b>ผู้รับเอกสาร (แผนกบัญชี)</b><br>วันที่ ........./........./.........</div>
</div>
<p class="muted" style="margin-top:8mm">ยอดรวม ${esc([...totals].map(([c, a]) => formatCurrency(a, c)).join(' · ') || '-')} · พิมพ์จากระบบจัดการหัวหน้าทัวร์</p>
</div>
<script>(document.fonts ? document.fonts.ready : Promise.resolve()).then(function(){setTimeout(function(){window.print()},150)})</script>
</body></html>`);
  w.document.close();
}
