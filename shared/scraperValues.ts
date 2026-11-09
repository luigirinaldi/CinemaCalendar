import { DateTime } from 'luxon';
import type { FieldMapping, ScraperConfig } from './scraperConfig';

/** Literal operations: no scripts or expressions from the page are executed. */
export function cleanField(value: string, field: FieldMapping): string {
    let result = value.replace(/\s+/gu, ' ').trim();
    if (field.after) {
        const index = result.indexOf(field.after);
        if (index < 0)
            throw new Error(`Text does not contain “${field.after}”`);
        result = result.slice(index + field.after.length);
    }
    if (field.before) {
        const index = result.indexOf(field.before);
        if (index < 0)
            throw new Error(`Text does not contain “${field.before}”`);
        result = result.slice(0, index);
    }
    for (const replacement of field.replacements ?? [])
        result = result.split(replacement.find).join(replacement.replace);
    return result.replace(/\s+/gu, ' ').trim();
}

export function parseScreeningTime(
    value: string,
    day: string,
    config: Pick<
        ScraperConfig,
        'dateFormat' | 'dateLocale' | 'timezone' | 'cinema' | 'yearPolicy'
    >,
    reference: DateTime = DateTime.now()
): string {
    if (day && day === value)
        throw new Error(
            'The same text is mapped as both date and time. Map the complete datetime only as Screening time, and leave Screening date blank.'
        );
    const input = (day ? `${day} ${value}` : value)
        .replace(/\s+/gu, ' ')
        .trim();
    const options = {
        zone: config.timezone,
        locale: config.dateLocale || config.cinema.defaultLanguage,
    };
    const epoch = ['unix-ms', 'unix-seconds'].includes(config.dateFormat);
    if (epoch && !/^\d{10,13}(?:\.\d+)?$/.test(value))
        throw new Error(`Invalid Unix timestamp: ${value}`);
    const parsed =
        config.dateFormat === 'unix-ms'
            ? DateTime.fromMillis(Number(value), options)
            : config.dateFormat === 'unix-seconds'
              ? DateTime.fromSeconds(Number(value), options)
              : config.dateFormat
                ? DateTime.fromFormat(input, config.dateFormat, options)
                : DateTime.fromISO(input.replace(' ', 'T'), options);
    const explained =
        !epoch && config.dateFormat
            ? DateTime.fromFormatExplain(input, config.dateFormat, options)
            : null;
    if (
        config.yearPolicy === 'nearby-weekday' &&
        explained &&
        explained.result?.year == null
    ) {
        const result = explained.result;
        if (
            !result ||
            result.weekday == null ||
            result.month == null ||
            result.day == null ||
            result.hour == null ||
            result.minute == null
        )
            throw new Error(
                'Year inference requires a format containing weekday, day, month, hour and minute.'
            );
        reference = reference.setZone(config.timezone);
        const matches = [reference.year - 1, reference.year, reference.year + 1]
            .map((year) =>
                DateTime.fromObject(
                    {
                        year,
                        month: result.month,
                        day: result.day,
                        hour: result.hour,
                        minute: result.minute,
                    },
                    options
                )
            )
            .filter(
                (date) =>
                    date.isValid &&
                    date.weekday === result.weekday &&
                    date.hour === result.hour &&
                    date.minute === result.minute &&
                    Math.abs(
                        date
                            .startOf('day')
                            .diff(reference.startOf('day'), 'days').days
                    ) <= 183 &&
                    date.getPossibleOffsets().length === 1
            );
        if (matches.length !== 1)
            throw new Error(
                `No unique nearby year matches the printed weekday: “${input}”. The page may be stale or the format incorrect.`
            );
        return matches[0].toUTC().toISO()!;
    }
    const hasDateAndTime =
        epoch ||
        (explained
            ? explained.result?.year != null &&
              explained.result?.month != null &&
              explained.result?.day != null &&
              explained.result?.hour != null
            : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.replace(' ', 'T')));
    if (!parsed.isValid || !hasDateAndTime)
        throw new Error(
            `Cannot parse a full screening date and time: “${input}”. Check the format, date language and timezone; include an explicit year and time.`
        );
    return parsed.toUTC().toISO()!;
}
