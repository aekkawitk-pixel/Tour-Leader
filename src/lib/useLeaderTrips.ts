'use client';

import { useEffect, useState } from 'react';
import { loadLeaderTrips, type LeaderTrip } from '@/lib/logic/leaderTrips';

/** อ่านกรุ๊ปจริงจาก localStorage หลัง mount (กัน hydration mismatch) */
export function useLeaderTrips(): LeaderTrip[] {
  const [trips, setTrips] = useState<LeaderTrip[]>([]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ตอน mount
    setTrips(loadLeaderTrips());
  }, []);
  return trips;
}
