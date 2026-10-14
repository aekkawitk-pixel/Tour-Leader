'use client';

import { useEffect, useState } from 'react';
import { CLEAR_CAPACITY_EVENT, capacityOf, loadClearCapacity, type ClearCapacitySettings } from '@/services/clearCapacityStore';
import type { ClearLane } from '@/lib/logic/appointmentSlots';

/** จำนวนเจ้าหน้าที่ต่อคิว — อ่านใหม่เมื่อมีการแก้การตั้งค่า (หน้าต่างอื่นในแท็บเดียวกัน) */
export function useClearCapacity() {
  const [settings, setSettings] = useState<ClearCapacitySettings>(() => loadClearCapacity());
  useEffect(() => {
    const reload = () => setSettings(loadClearCapacity());
    window.addEventListener(CLEAR_CAPACITY_EVENT, reload);
    return () => window.removeEventListener(CLEAR_CAPACITY_EVENT, reload);
  }, []);
  return {
    settings,
    capacity: (date: string, lane: ClearLane) => capacityOf(settings, date, lane),
  };
}
