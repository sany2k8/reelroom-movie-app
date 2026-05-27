import { cx } from "@/lib/format";
import type { Facets } from "@/types";

export interface FilterValues {
  q: string;
  category: string;
  genre: string;
  year: string;
  quality: string;
  letter: string;
  ratingMin: number;
  ratingMax: number;
}

interface Props {
  facets: Facets | null;
  values: FilterValues;
  onChange: (patch: Partial<FilterValues>) => void;
  onReset: () => void;
  activeCount: number;
}

export function FilterSidebar({ facets, values, onChange, onReset, activeCount }: Props) {
  return (
    <aside className="flex flex-col gap-6" aria-label="Filters">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl tracking-wide">Filters</h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold uppercase tracking-wider text-amber hover:underline"
          >
            Clear ({activeCount})
          </button>
        )}
      </div>

      <RatingRange
        min={values.ratingMin}
        max={values.ratingMax}
        onChange={(ratingMin, ratingMax) => onChange({ ratingMin, ratingMax })}
      />

      <Select
        label="Category"
        value={values.category}
        options={facets?.categories ?? []}
        onChange={(category) => onChange({ category })}
      />

      <Select
        label="Genre"
        value={values.genre}
        options={facets?.genres ?? []}
        onChange={(genre) => onChange({ genre })}
      />

      <Select
        label="Year"
        value={values.year}
        options={(facets?.years ?? []).map(String)}
        onChange={(year) => onChange({ year })}
      />

      {(facets?.qualities.length ?? 0) > 0 && (
        <Fieldset label="Quality">
          <div className="flex flex-wrap gap-2">
            {facets!.qualities.map((quality) => (
              <button
                key={quality}
                type="button"
                onClick={() => onChange({ quality: values.quality === quality ? "" : quality })}
                aria-pressed={values.quality === quality}
                className={cx(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  values.quality === quality
                    ? "border-amber bg-amber text-ink"
                    : "border-ink-500 bg-ink-800 text-muted hover:border-amber/50 hover:text-chalk",
                )}
              >
                {quality}
              </button>
            ))}
          </div>
        </Fieldset>
      )}

      <Fieldset label="Alphabet">
        <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-4">
          {(facets?.letters ?? []).map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => onChange({ letter: values.letter === letter ? "" : letter })}
              aria-pressed={values.letter === letter}
              className={cx(
                "aspect-square rounded-lg border text-xs font-bold transition-colors",
                values.letter === letter
                  ? "border-amber bg-amber text-ink"
                  : "border-ink-500 bg-ink-800 text-muted hover:border-amber/50 hover:text-chalk",
              )}
            >
              {letter}
            </button>
          ))}
        </div>
      </Fieldset>
    </aside>
  );
}

function Fieldset({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-amber">
        {label}
      </legend>
      {children}
    </fieldset>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Fieldset label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="field cursor-pointer appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238A93A6' stroke-width='2'%3E%3Cpath d='m5 9 7 7 7-7'/%3E%3C/svg%3E\")",
        }}
      >
        <option value="">All {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </Fieldset>
  );
}

/**
 * Two native range inputs stacked on one track. Cheaper and more accessible
 * than a custom drag implementation, and it keeps keyboard support for free.
 */
function RatingRange({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const left = (min / 10) * 100;
  const right = (max / 10) * 100;

  return (
    <Fieldset label="Rating">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-600" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-amber"
          style={{ left: `${left}%`, right: `${100 - right}%` }}
        />
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={min}
          aria-label="Minimum rating"
          onChange={(e) => onChange(Math.min(Number(e.target.value), max), max)}
          className="pointer-events-none absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 appearance-none bg-transparent
                     [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber
                     [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-ink"
        />
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={max}
          aria-label="Maximum rating"
          onChange={(e) => onChange(min, Math.max(Number(e.target.value), min))}
          className="pointer-events-none absolute inset-x-0 top-1/2 h-6 w-full -translate-y-1/2 appearance-none bg-transparent
                     [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber
                     [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-ink"
        />
      </div>
      <div className="flex justify-between text-xs text-muted">
        <span>{min.toFixed(1)}</span>
        <span>{max.toFixed(1)}</span>
      </div>
    </Fieldset>
  );
}
