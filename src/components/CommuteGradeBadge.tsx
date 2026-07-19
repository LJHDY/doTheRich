import React from 'react';
import { CommuteTime, calcCommuteGrade } from '../types';

interface CommuteGradeBadgeProps {
  commuteTimes: CommuteTime[];
}

const CommuteGradeBadge: React.FC<CommuteGradeBadgeProps> = ({ commuteTimes }) => {
  const result = calcCommuteGrade(commuteTimes);
  if (!result) return null;
  return (
    <span style={{
      fontSize: '12px', fontWeight: 800,
      color: '#fff', backgroundColor: result.color,
      padding: '1px 8px', borderRadius: '10px', lineHeight: '18px',
    }}>
      {result.grade}
    </span>
  );
};

export default CommuteGradeBadge;
