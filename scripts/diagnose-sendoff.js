// วางในแท็บ Console ของ DevTools (F12) บนหน้า /jobs ของระบบ แล้วกด Enter — อ่านอย่างเดียว ไม่แก้ข้อมูล
(() => {
  const snap = JSON.parse(localStorage.getItem('zegoImportedPrograms') || 'null');
  const rows = JSON.parse(localStorage.getItem('sendOffAssignments') || '[]');
  const periods = snap?.periods ?? [];
  const programs = new Map((snap?.programs ?? []).map((p) => [p.programCode, p]));
  const byId = new Map(periods.map((p) => [p.id, p]));
  const ids = periods.map((p) => p.id);
  const oct = periods.filter((p) => (p.startDate || '').startsWith('2026-10'));
  const withFlight = oct.filter((p) => programs.get(p.programCode)?.flights?.some((f) => f.departureTime));
  console.log('Zego periods:', periods.length, '| duplicate ids:', ids.length - new Set(ids).size,
    '| ต.ค. 2026:', oct.length, '| ต.ค. มีเวลาบิน:', withFlight.length,
    '| ต.ค. ไม่มี endDate:', oct.filter((p) => !p.endDate).length);
  console.table(rows.slice(-10).map((r) => {
    const p = byId.get(r.periodId);
    const f = p && programs.get(p.programCode)?.flights?.[0];
    return { id: r.assignmentId, periodId: r.periodId, found: !!p, start: p?.startDate, end: p?.endDate, sale: p?.saleStatus, flight: f?.departureTime ?? null, staff: r.staffId, status: r.status };
  }));
})();
