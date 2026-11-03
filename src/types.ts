export type DateRange = 'today' | 'thisWeek' | 'anytime' | 'custom';
export const GROUP_BY_VALUES = ['movie', 'cinema', 'table', 'map'] as const;
export type GroupBy = (typeof GROUP_BY_VALUES)[number];
export type CatalogDateRange = 'today' | 'range' | 'anytime';
export const SHOW_MODE_VALUES = ['compact', 'full'] as const;
export type ShowMode = (typeof SHOW_MODE_VALUES)[number];
export const TABLE_SORT_VALUES = [
    'title-asc',
    'title-desc',
    'director-asc',
    'director-desc',
] as const;
export type TableSort = (typeof TABLE_SORT_VALUES)[number];
export interface Filters {
    dateRange: DateRange;
    currentDate: string;
    customStartDate: string;
    customEndDate: string;
}
