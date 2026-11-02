import { DateTime } from 'luxon';

/** Preserve explicit offsets; interpret unzoned source dates in the cinema's zone. */
export function cinemaDate(value: string, zone: string): string {
    const date = DateTime.fromISO(value.trim().replace(' ', 'T'), { zone });
    if (!date.isValid) throw new Error(`Invalid screening date: ${value}`);
    return date.toUTC().toISO()!;
}
export function upcomingDate(
    day: string,
    time: string,
    now = DateTime.now().setZone('Europe/London')
): DateTime {
    const parts = day
        .trim()
        .match(/(?:\w+\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)(?:\s+(\d{4}))?$/);
    if (!parts) throw new Error(`Invalid day: ${day}`);
    const baseYear = parts[3] ? Number(parts[3]) : now.year;
    let date = DateTime.fromFormat(
        `${parts[1]} ${parts[2]} ${baseYear} ${time.trim().toUpperCase()}`,
        'd LLLL yyyy h:mm a',
        { zone: 'Europe/London', locale: 'en-GB' }
    );
    // A previous month in a forward-looking programme belongs to next year.
    // Do not shift yesterday's listings a year into the future.
    if (!parts[3] && date.isValid && date.month < now.month)
        date = date.plus({ years: 1 });
    if (!date.isValid)
        throw new Error(`Invalid screening date: ${day} ${time}`);
    return date;
}
