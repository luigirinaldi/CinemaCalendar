import type { FieldMapping } from '../../shared/scraperConfig';

export default function FieldOptions({
    value,
    onChange,
    html,
}: {
    value: FieldMapping;
    onChange: (value: Partial<FieldMapping>) => void;
    html: boolean;
}) {
    const input =
        'mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm';
    return (
        <details className="mt-2 text-xs text-neutral-400">
            <summary className="cursor-pointer">
                Where to read & text cleanup
            </summary>
            <div className="mt-3 space-y-3 border-l border-neutral-700 pl-3">
                <label className="flex items-center gap-2">
                    <input
                        type="checkbox"
                        checked={!!value.htmlText}
                        onChange={(event) =>
                            onChange({ htmlText: event.target.checked })
                        }
                    />
                    Read HTML as text (e.g. WordPress rendered titles)
                </label>
                <label className="block">
                    Read relative to
                    <select
                        className={input}
                        value={value.scope || 'row'}
                        onChange={(event) =>
                            onChange({
                                scope: event.target
                                    .value as FieldMapping['scope'],
                            })
                        }
                    >
                        <option value="row">
                            Current film / screening row
                        </option>
                        <option value="film">Film container</option>
                        <option value="page">Whole page / JSON response</option>
                        {html && (
                            <option value="ancestor">
                                Containing HTML section
                            </option>
                        )}
                    </select>
                </label>
                {value.scope === 'ancestor' && (
                    <label className="block">
                        Containing section selector (e.g. .programme-day)
                        <input
                            className={input}
                            value={value.ancestor || ''}
                            onChange={(event) =>
                                onChange({ ancestor: event.target.value })
                            }
                        />
                    </label>
                )}
                <p>
                    Whitespace is collapsed. These optional steps run in order
                    and use exact text.
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <label>
                        Keep text after
                        <input
                            className={input}
                            value={value.after || ''}
                            placeholder="e.g. Date:"
                            onChange={(event) =>
                                onChange({ after: event.target.value })
                            }
                        />
                    </label>
                    <label>
                        Keep text before
                        <input
                            className={input}
                            value={value.before || ''}
                            placeholder="e.g. (subtitled)"
                            onChange={(event) =>
                                onChange({ before: event.target.value })
                            }
                        />
                    </label>
                </div>
                {(value.replacements ?? []).map((replacement, index) => (
                    <div key={index} className="flex items-end gap-2">
                        <label className="min-w-0 flex-1">
                            Replace
                            <input
                                className={input}
                                value={replacement.find}
                                onChange={(event) =>
                                    onChange({
                                        replacements: value.replacements!.map(
                                            (row, i) =>
                                                i === index
                                                    ? {
                                                          ...row,
                                                          find: event.target
                                                              .value,
                                                      }
                                                    : row
                                        ),
                                    })
                                }
                            />
                        </label>
                        <label className="min-w-0 flex-1">
                            With (blank removes)
                            <input
                                className={input}
                                value={replacement.replace}
                                onChange={(event) =>
                                    onChange({
                                        replacements: value.replacements!.map(
                                            (row, i) =>
                                                i === index
                                                    ? {
                                                          ...row,
                                                          replace:
                                                              event.target
                                                                  .value,
                                                      }
                                                    : row
                                        ),
                                    })
                                }
                            />
                        </label>
                        <button
                            type="button"
                            className="px-1 py-2 underline"
                            aria-label={`Remove replacement ${index + 1}`}
                            onClick={() =>
                                onChange({
                                    replacements: value.replacements!.filter(
                                        (_, i) => i !== index
                                    ),
                                })
                            }
                        >
                            Remove
                        </button>
                    </div>
                ))}
                <button
                    type="button"
                    className="underline"
                    disabled={(value.replacements?.length ?? 0) >= 20}
                    onClick={() =>
                        onChange({
                            replacements: [
                                ...(value.replacements ?? []),
                                { find: '', replace: '' },
                            ],
                        })
                    }
                >
                    Add text replacement
                </button>
            </div>
        </details>
    );
}
