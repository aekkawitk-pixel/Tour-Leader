'use client';

/** คะแนน + ประวัติการเดินทางของหัวหน้าทัวร์ — แหล่งเดียวสำหรับ Profile Header และแท็บภาพรวม */

import { useMemo } from 'react';
import { useDemo } from '@/store/DemoStore';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { buildGroupScoreRows } from '@/lib/logic/tourGroupScoreRows';
import { groupResponsesByPeriod, getScoreScale, getTravelerCountMap } from '@/services/groupScoreStore';
import { summarizeLeaderScores } from '@/lib/logic/leaderScoreSummary';

export function useLeaderScoreSummary(leaderId: string) {
  const { leaders, today } = useDemo();
  return useMemo(() => {
    const rows = buildGroupScoreRows({
      periods: getTourPeriods(),
      assignments: loadActiveGuideAssignments().map((a) => ({ periodId: a.periodId, tourLeaderId: a.tourLeaderId })),
      leaderNameById: new Map(leaders.map((l) => [l.id, `${l.firstName} ${l.lastName}`])),
      responsesByPeriod: groupResponsesByPeriod(),
      travelerCountByPeriod: getTravelerCountMap(),
      tourLeaderId: leaderId,
      travelledOnAsOf: today,
    });
    return summarizeLeaderScores(rows, getScoreScale().max, today);
  }, [leaderId, leaders, today]);
}
