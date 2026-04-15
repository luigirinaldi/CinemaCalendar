import { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type YearFilterPreset =
    | 'all'
    | '60s'
    | '70s'
    | '80s'
    | '90s'
    | '2000s'
    | '2010s'
    | 'thisYear'
    | 'custom';

interface YearFilterProps {
    movieYears: number[];
    onChange: (range: [number, number] | null) => void;
}

function YearFilter({ movieYears, onChange }: YearFilterProps) {
    const currentYear = new Date().getFullYear();
    const [selectedPreset, setSelectedPreset] =
        useState<YearFilterPreset>('all');
    const [isDetailedOpen, setIsDetailedOpen] = useState(false);
    const [customRange, setCustomRange] = useState<[number, number]>([
        currentYear,
        currentYear,
    ]);
    const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null);

    const histogram = useMemo(() => {
        if (movieYears.length === 0) {
            return {
                yearCounts: {} as Record<number, number>,
                minYear: currentYear,
                maxYear: currentYear,
                maxCount: 0,
            };
        }
        const minYear = Math.min(...movieYears);
        const maxYear = Math.max(...movieYears);
        const yearCounts: Record<number, number> = {};

        for (let year = minYear; year <= maxYear; year++) {
            yearCounts[year] = 0;
        }
        movieYears.forEach((y) => {
            yearCounts[y]++;
        });

        const maxCount = Math.max(...Object.values(yearCounts));
        return { yearCounts, minYear, maxYear, maxCount };
    }, [movieYears, currentYear]);

    // When histogram bounds change and preset is 'all', keep range in sync
    useEffect(() => {
        if (selectedPreset === 'all') {
            setCustomRange([histogram.minYear, histogram.maxYear]);
        }
    }, [histogram.minYear, histogram.maxYear, selectedPreset]);

    // Emit filter to parent whenever range or preset changes
    useEffect(() => {
        if (selectedPreset === 'all') {
            onChange(null);
        } else {
            onChange(customRange);
        }
    }, [customRange, selectedPreset, onChange]);

    const handlePresetClick = (preset: YearFilterPreset) => {
        setSelectedPreset(preset);
        switch (preset) {
            case 'all':
                setCustomRange([histogram.minYear, histogram.maxYear]);
                break;
            case '60s':
                setCustomRange([1960, 1969]);
                break;
            case '70s':
                setCustomRange([1970, 1979]);
                break;
            case '80s':
                setCustomRange([1980, 1989]);
                break;
            case '90s':
                setCustomRange([1990, 1999]);
                break;
            case '2000s':
                setCustomRange([2000, 2009]);
                break;
            case '2010s':
                setCustomRange([2010, 2019]);
                break;
            case 'thisYear':
                setCustomRange([currentYear, currentYear]);
                break;
        }
    };

    const handleMouseDown = (handle: 'start' | 'end') => {
        setIsDragging(handle);
        setSelectedPreset('custom');
    };

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        const { maxYear, minYear } = histogram;
        if (maxYear === minYear) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percentage = x / rect.width;
        const year = Math.round(minYear + (maxYear - minYear) * percentage);

        if (isDragging === 'start') {
            setCustomRange([Math.min(year, customRange[1]), customRange[1]]);
        } else {
            setCustomRange([customRange[0], Math.max(year, customRange[0])]);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(null);
    };

    const getFilteredCount = () =>
        movieYears.filter(
            (y) => y >= customRange[0] && y <= customRange[1]
        ).length;

    const rangeSpan = histogram.maxYear - histogram.minYear || 1;
    const startPercentage =
        ((customRange[0] - histogram.minYear) / rangeSpan) * 100;
    const endPercentage =
        ((customRange[1] - histogram.minYear) / rangeSpan) * 100;

    const presetBtn = (preset: YearFilterPreset, label: string) => (
        <button
            key={preset}
            onClick={() => handlePresetClick(preset)}
            className={`px-4 py-2 rounded-lg transition ${
                selectedPreset === preset
                    ? 'bg-red-700 text-white'
                    : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div className="space-y-4">
            <div>
                <label className="text-sm text-neutral-400 mb-2 block">
                    Release Year
                </label>
                <div className="flex flex-wrap gap-2">
                    {presetBtn('all', 'All Years')}
                    {presetBtn('thisYear', String(currentYear))}
                    {presetBtn('2010s', '2010s')}
                    {presetBtn('2000s', '2000s')}
                    {presetBtn('90s', '90s')}
                    {presetBtn('80s', '80s')}
                    {presetBtn('70s', '70s')}
                    {presetBtn('60s', '60s')}
                </div>
            </div>

            <button
                onClick={() => setIsDetailedOpen(!isDetailedOpen)}
                className="flex items-center gap-2 text-neutral-300 hover:text-white transition"
            >
                {isDetailedOpen ? (
                    <ChevronUp className="w-4 h-4" />
                ) : (
                    <ChevronDown className="w-4 h-4" />
                )}
                <span className="text-sm">Advanced Year Range</span>
            </button>

            {isDetailedOpen && (
                <div className="bg-neutral-800 rounded-lg p-6 space-y-4">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-neutral-400">
                            Selected:{' '}
                            <span className="text-white font-semibold">
                                {customRange[0]} – {customRange[1]}
                            </span>
                        </span>
                        <span className="text-neutral-400">
                            Movies:{' '}
                            <span className="text-red-500 font-semibold">
                                {getFilteredCount()}
                            </span>
                        </span>
                    </div>

                    <div
                        className="relative h-40 select-none"
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
                        {/* Decade marker lines */}
                        <div className="absolute inset-0 pointer-events-none">
                            {(() => {
                                const lines = [];
                                const startDecade =
                                    Math.ceil(histogram.minYear / 10) * 10;
                                const endDecade =
                                    Math.floor(histogram.maxYear / 10) * 10;

                                for (
                                    let decade = startDecade;
                                    decade <= endDecade;
                                    decade += 10
                                ) {
                                    if (
                                        decade >= histogram.minYear &&
                                        decade <= histogram.maxYear
                                    ) {
                                        const pos =
                                            ((decade - histogram.minYear) /
                                                rangeSpan) *
                                            100;
                                        lines.push(
                                            <div
                                                key={`decade-${decade}`}
                                                className="absolute top-0 bottom-8 w-px bg-neutral-600"
                                                style={{ left: `${pos}%` }}
                                            >
                                                <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-semibold text-neutral-400">
                                                    {decade}
                                                </span>
                                            </div>
                                        );
                                    }
                                }

                                for (
                                    let decade = startDecade - 10;
                                    decade <= endDecade;
                                    decade += 10
                                ) {
                                    const half = decade + 5;
                                    if (
                                        half >= histogram.minYear &&
                                        half <= histogram.maxYear
                                    ) {
                                        const pos =
                                            ((half - histogram.minYear) /
                                                rangeSpan) *
                                            100;
                                        lines.push(
                                            <div
                                                key={`half-${half}`}
                                                className="absolute top-0 bottom-8 w-px bg-neutral-700"
                                                style={{ left: `${pos}%` }}
                                            />
                                        );
                                    }
                                }

                                return lines;
                            })()}
                        </div>

                        {/* Histogram bars */}
                        <div className="absolute inset-0 flex items-end pb-8">
                            {Object.entries(histogram.yearCounts).map(
                                ([year, count]) => {
                                    const yearNum = parseInt(year);
                                    const isInRange =
                                        yearNum >= customRange[0] &&
                                        yearNum <= customRange[1];
                                    const height =
                                        count > 0
                                            ? (count / histogram.maxCount) *
                                              100
                                            : 0;
                                    const pos =
                                        ((yearNum - histogram.minYear) /
                                            rangeSpan) *
                                        100;
                                    const width = (1 / (rangeSpan + 1)) * 100;

                                    return (
                                        <div
                                            key={year}
                                            className="absolute bottom-8"
                                            style={{
                                                left: `${pos}%`,
                                                width: `${width}%`,
                                                height: `calc(100% - 2rem)`,
                                            }}
                                        >
                                            <div className="h-full flex items-end justify-center px-0.5">
                                                <div
                                                    className={`w-full transition-colors ${
                                                        isInRange
                                                            ? 'bg-red-600'
                                                            : 'bg-neutral-700'
                                                    } hover:bg-red-500 cursor-pointer`}
                                                    style={{
                                                        height: `${height}%`,
                                                    }}
                                                    title={`${year}: ${count} movie${count !== 1 ? 's' : ''}`}
                                                />
                                            </div>
                                        </div>
                                    );
                                }
                            )}
                        </div>

                        {/* Selection overlay */}
                        <div
                            className="absolute top-0 bottom-8 bg-red-600/20 pointer-events-none border-l-2 border-r-2 border-red-500"
                            style={{
                                left: `${startPercentage}%`,
                                width: `${endPercentage - startPercentage}%`,
                            }}
                        />

                        {/* Start handle */}
                        <div
                            className="absolute top-0 bottom-8 w-4 -ml-2 cursor-ew-resize group z-10"
                            style={{ left: `${startPercentage}%` }}
                            onMouseDown={() => handleMouseDown('start')}
                        >
                            <div className="absolute inset-y-0 left-1/2 -ml-0.5 w-1 bg-red-500 group-hover:bg-red-400" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-red-600 rounded-full border-2 border-neutral-900 group-hover:bg-red-500 shadow-lg" />
                        </div>

                        {/* End handle */}
                        <div
                            className="absolute top-0 bottom-8 w-4 -ml-2 cursor-ew-resize group z-10"
                            style={{ left: `${endPercentage}%` }}
                            onMouseDown={() => handleMouseDown('end')}
                        >
                            <div className="absolute inset-y-0 left-1/2 -ml-0.5 w-1 bg-red-500 group-hover:bg-red-400" />
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-red-600 rounded-full border-2 border-neutral-900 group-hover:bg-red-500 shadow-lg" />
                        </div>
                    </div>

                    {/* Year inputs */}
                    <div className="flex gap-4 items-center">
                        <div className="flex-1">
                            <label className="text-xs text-neutral-400 block mb-1">
                                From Year
                            </label>
                            <input
                                type="number"
                                min={histogram.minYear}
                                max={histogram.maxYear}
                                value={customRange[0]}
                                onChange={(e) => {
                                    const val = Math.max(
                                        histogram.minYear,
                                        Math.min(
                                            parseInt(e.target.value) ||
                                                histogram.minYear,
                                            histogram.maxYear
                                        )
                                    );
                                    setCustomRange([
                                        Math.min(val, customRange[1]),
                                        customRange[1],
                                    ]);
                                    setSelectedPreset('custom');
                                }}
                                className="w-full bg-neutral-700 text-white px-3 py-2 rounded border border-neutral-600 focus:border-red-600 outline-none"
                            />
                        </div>
                        <span className="text-neutral-500 mt-5">to</span>
                        <div className="flex-1">
                            <label className="text-xs text-neutral-400 block mb-1">
                                To Year
                            </label>
                            <input
                                type="number"
                                min={histogram.minYear}
                                max={histogram.maxYear}
                                value={customRange[1]}
                                onChange={(e) => {
                                    const val = Math.max(
                                        histogram.minYear,
                                        Math.min(
                                            parseInt(e.target.value) ||
                                                histogram.maxYear,
                                            histogram.maxYear
                                        )
                                    );
                                    setCustomRange([
                                        customRange[0],
                                        Math.max(val, customRange[0]),
                                    ]);
                                    setSelectedPreset('custom');
                                }}
                                className="w-full bg-neutral-700 text-white px-3 py-2 rounded border border-neutral-600 focus:border-red-600 outline-none"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default YearFilter;
