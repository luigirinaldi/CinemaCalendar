export type DateRange = 'today' | 'range' | 'anytime';
export const GROUP_BY_VALUES = ['movie', 'cinema', 'table', 'map'] as const;
export type GroupBy = (typeof GROUP_BY_VALUES)[number];
export const SHOW_MODE_VALUES = ['compact', 'full'] as const;
export type ShowMode = (typeof SHOW_MODE_VALUES)[number];
export const TABLE_SORT_VALUES = [
    'title-asc',
    'title-desc',
    'director-asc',
    'director-desc',
] as const;
export type TableSort = (typeof TABLE_SORT_VALUES)[number];
