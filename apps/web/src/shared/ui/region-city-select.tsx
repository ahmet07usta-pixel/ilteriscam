import { useMemo } from 'react'
import type { ApiRegion } from '../api/contracts'

interface RegionCitySelectProps {
  regions: ApiRegion[]
  value: string | undefined
  onChange: (regionId: string | undefined) => void
  zoneAllLabel?: string
  cityAllLabel?: string
  labelClassName?: string
}

/** Two-step Bolge (zone) -> Il (city) picker. `value` may resolve to either a zone id (broad) or a city id (specific). */
export function RegionCitySelect({ regions, value, onChange, zoneAllLabel = 'Tum bolgeler', cityAllLabel = 'Tum iller', labelClassName }: RegionCitySelectProps) {
  const zones = useMemo(
    () => regions.filter((region) => region.regionType === 'ZONE').slice().sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [regions],
  )
  const regionById = useMemo(() => new Map(regions.map((region) => [region.id, region])), [regions])

  const selectedRegion = value ? regionById.get(value) : undefined
  const effectiveZoneId = selectedRegion?.regionType === 'CITY' ? selectedRegion.parentRegionId ?? '' : selectedRegion?.id ?? ''

  const citiesInZone = useMemo(
    () =>
      regions
        .filter((region) => region.regionType === 'CITY' && region.parentRegionId === effectiveZoneId)
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [regions, effectiveZoneId],
  )

  return (
    <>
      <label className={labelClassName}>
        Bolge
        <select value={effectiveZoneId} onChange={(event) => onChange(event.target.value || undefined)}>
          <option value="">{zoneAllLabel}</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName}>
        Il
        <select
          value={selectedRegion?.regionType === 'CITY' ? selectedRegion.id : ''}
          onChange={(event) => onChange(event.target.value || effectiveZoneId || undefined)}
          disabled={!effectiveZoneId}
        >
          <option value="">{cityAllLabel}</option>
          {citiesInZone.map((city) => (
            <option key={city.id} value={city.id}>
              {city.name}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
