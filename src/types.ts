export type DateRange = 'today' | 'thisWeek' | 'anytime' | 'custom';
export const GROUP_BY_VALUES = ['movie', 'cinema', 'table'] as const;
export type GroupBy = (typeof GROUP_BY_VALUES)[number];
