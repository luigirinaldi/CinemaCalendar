export type DateRange = 'today' | 'range' | 'anytime';
export const GROUP_BY_VALUES = ['movie', 'cinema', 'table'] as const;
export type GroupBy = (typeof GROUP_BY_VALUES)[number];
export const SHOW_MODE_VALUES = ['compact', 'full'] as const;
export type ShowMode = (typeof SHOW_MODE_VALUES)[number];
