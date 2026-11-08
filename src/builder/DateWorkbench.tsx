import { useState } from 'react';
import { DateTime } from 'luxon';
import type { ScraperConfig } from '../../shared/scraperConfig';
import { cleanField, parseScreeningTime } from '../../shared/scraperValues';

const examples = [
    ['Italian month', '5 Novembre 2026', '20:30', 'd MMMM yyyy HH:mm', 'it-IT'],
    [
        'French month',
        '5 novembre 2026',
        '20h30',
        "d MMMM yyyy HH'h'mm",
        'fr-FR',
    ],
    ['Day / month / year', '05/11/2026', '20.30', 'dd/MM/yyyy HH.mm', 'en-GB'],
    [
        'English weekday',
        'Thursday 5 November 2026',
        '8:30 pm',
        'cccc d MMMM yyyy h:mm a',
        'en-GB',
    ],
] as const;

export default function DateWorkbench({
    config,
    onChange,
}: {
    config: ScraperConfig;
    onChange: (next: ScraperConfig) => void;
}) {
    const [day, setDay] = useState('');
    const [time, setTime] = useState('');
    const input =
        'mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm';
    let result = '';
    let error = '';
    if (time) {
        try {
            const utc = parseScreeningTime(
                cleanField(time, config.start),
                day ? cleanField(day, config.date) : '',
                config
            );
            result = `${DateTime.fromISO(utc).setZone(config.timezone).toFormat('yyyy-MM-dd HH:mm ZZ')} (${config.timezone}) → ${utc}`;
        } catch (cause) {
            error = cause instanceof Error ? cause.message : String(cause);
        }
    }
    return (
        <div className="space-y-3 border-y border-neutral-800 py-4 text-sm text-neutral-400">
            <h4 className="font-medium text-neutral-200">Dates & times</h4>
            <label className="block">
                Start from an example
                <select
                    className={input}
                    defaultValue=""
                    onChange={(event) => {
                        const example = examples[Number(event.target.value)];
                        if (!example) return;
                        setDay(example[1]);
                        setTime(example[2]);
                        onChange({
                            ...config,
                            dateFormat: example[3],
                            dateLocale: example[4],
                        });
                    }}
                >
                    <option value="" disabled>
                        Choose a date style…
                    </option>
                    {examples.map((example, index) => (
                        <option key={example[0]} value={index}>
                            {example[0]} — {example[1]} {example[2]}
                        </option>
                    ))}
                </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
                <label>
                    Date format
                    <input
                        className={input}
                        value={config.dateFormat}
                        placeholder="Blank for ISO; d MMMM yyyy HH:mm"
                        onChange={(event) =>
                            onChange({
                                ...config,
                                dateFormat: event.target.value,
                            })
                        }
                    />
                </label>
                <label>
                    Date language
                    <input
                        className={input}
                        value={config.dateLocale || ''}
                        placeholder={config.cinema.defaultLanguage}
                        onChange={(event) =>
                            onChange({
                                ...config,
                                dateLocale: event.target.value,
                            })
                        }
                    />
                </label>
            </div>
            <p className="text-xs">
                MMMM = month name, d = day, yyyy = year, HH:mm = 24-hour time.
                Quote literal text with single quotes. Use unix-ms or
                unix-seconds for timestamps. Date language is independent of
                film language.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
                <label>
                    Try date text
                    <input
                        className={input}
                        value={day}
                        placeholder="5 Novembre 2026"
                        onChange={(event) => setDay(event.target.value)}
                    />
                </label>
                <label>
                    Try time or full datetime
                    <input
                        className={input}
                        value={time}
                        placeholder="20:30"
                        onChange={(event) => setTime(event.target.value)}
                    />
                </label>
            </div>
            <p className="text-xs">
                Paste the actual selected text. Field cleanup rules also apply
                here. If date and time are separate, the format describes date,
                a space, then time. An explicit year is required.
            </p>
            {(result || error) && (
                <output
                    className={`block break-words border-l-2 pl-3 text-xs ${error ? 'border-red-500 text-red-300' : 'border-neutral-500 text-neutral-200'}`}
                    aria-live="polite"
                >
                    {error || result}
                </output>
            )}
        </div>
    );
}
