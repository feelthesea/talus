/**
 * Talus Geofence Engine — Module 4
 *
 * GPS sampling strategy:
 *   - Far from next CP (>2km): poll every 10 minutes
 *   - Approaching next CP (≤2km): poll every 60 seconds
 *   - After CP arrival detected: stop until next segment starts
 *
 * Recalculation trigger: actual CP time deviates >30% from plan
 * Recalculation method: local, offline, proportional rescaling
 * UI update: silent — ETA numbers update in place, no alerts
 */

import type { BlueprintPlan, SegmentPlan } from './blueprint-engine'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CPArrival {
  cpIndex: number          // index in segments array (0 = first CP after start)
  plannedMinutes: number   // cumulative minutes from blueprint
  actualMinutes: number    // actual elapsed minutes since race start
  deviationPct: number     // (actual - planned) / planned * 100
  timestamp: number        // Date.now()
}

export interface RecalcResult {
  triggered: boolean
  deviationPct: number
  updatedSegments: SegmentPlan[]
  message: string          // silent — for debug only, never shown to user
}

export interface GeofenceState {
  watching: boolean
  currentSegmentIdx: number
  raceStartTime: number | null   // Date.now() when race started
  arrivals: CPArrival[]
  lastPosition: GeolocationCoordinates | null
  samplingMode: 'far' | 'near'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FAR_INTERVAL_MS  = 10 * 60 * 1000   // 10 minutes
const NEAR_INTERVAL_MS = 60 * 1000         // 1 minute
const NEAR_THRESHOLD_M = 2000              // 2 km
const ARRIVAL_RADIUS_M = 200               // 200 m = arrived at CP
const DEVIATION_THRESHOLD = 0.30           // 30% — triggers recalc

// ─── Haversine distance (metres) ─────────────────────────────────────────────

export function haversineM(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Offline recalculation ────────────────────────────────────────────────────

export function recalcFutureSegments(
  blueprint: BlueprintPlan,
  currentSegIdx: number,       // segment we just completed
  actualCumMinutes: number,    // real elapsed time at current CP
): RecalcResult {
  const planned = blueprint.segments[currentSegIdx].cumMinutes
  const deviationPct = (actualCumMinutes - planned) / planned * 100

  if (Math.abs(deviationPct) < DEVIATION_THRESHOLD * 100) {
    return {
      triggered: false,
      deviationPct,
      updatedSegments: blueprint.segments,
      message: `Deviation ${deviationPct.toFixed(1)}% — within threshold, no recalc`,
    }
  }

  // Compute slowdown/speedup ratio for remaining segments
  // Strategy: proportional — remaining budget is compressed/expanded uniformly
  const remainingPlannedMin = blueprint.targetMinutes - planned
  const timeSlip = actualCumMinutes - planned
  const remainingBudget = Math.max(remainingPlannedMin - timeSlip, remainingPlannedMin * 0.5)
  const scaleFactor = remainingBudget / remainingPlannedMin

  const updatedSegments: SegmentPlan[] = blueprint.segments.map((seg, i) => {
    if (i <= currentSegIdx) {
      // Past segments: freeze as-is (cumMinutes already reflects reality for arrived ones)
      return seg
    }
    // Future segments: scale estimated time, recompute cumulative
    const prevCum = i === currentSegIdx + 1
      ? actualCumMinutes
      : (updatedSegments[i - 1]?.cumMinutes ?? actualCumMinutes)

    const newSegMin = Math.round(seg.estMinutes * scaleFactor)
    const newCumMin = prevCum + newSegMin

    return {
      ...seg,
      estMinutes: newSegMin,
      cumMinutes: newCumMin,
    }
  })

  // Fix cumulative chain (second pass to ensure consistency)
  let cumCheck = actualCumMinutes
  for (let i = currentSegIdx + 1; i < updatedSegments.length; i++) {
    cumCheck += updatedSegments[i].estMinutes
    updatedSegments[i] = { ...updatedSegments[i], cumMinutes: cumCheck }
  }

  return {
    triggered: true,
    deviationPct,
    updatedSegments,
    message: `Recalc triggered: ${deviationPct > 0 ? '+' : ''}${deviationPct.toFixed(1)}% deviation. Scale factor: ${scaleFactor.toFixed(3)}`,
  }
}

// ─── Geofence manager (React hook) ───────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseGeofenceOptions {
  blueprint: BlueprintPlan
  currentSegmentIdx: number
  raceStartTime: number | null
  onCPArrival: (arrival: CPArrival, recalc: RecalcResult) => void
  onSegmentAdvance: (nextIdx: number) => void
}

export function useGeofence({
  blueprint,
  currentSegmentIdx,
  raceStartTime,
  onCPArrival,
  onSegmentAdvance,
}: UseGeofenceOptions) {
  const [state, setState] = useState<GeofenceState>({
    watching: false,
    currentSegmentIdx,
    raceStartTime,
    arrivals: [],
    lastPosition: null,
    samplingMode: 'far',
  })
  const [gpsError, setGpsError] = useState<string | null>(null)
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const arrivedRef = useRef<Set<number>>(new Set())
  const segIdxRef = useRef(currentSegmentIdx)

  // Update ref when prop changes
  useEffect(() => { segIdxRef.current = currentSegmentIdx }, [currentSegmentIdx])

  const checkPosition = useCallback((coords: GeolocationCoordinates) => {
    setState(prev => ({ ...prev, lastPosition: coords }))
    setGpsAccuracy(Math.round(coords.accuracy))

    const segIdx = segIdxRef.current
    const nextCP = blueprint.segments[segIdx]?.to
    if (!nextCP?.lat || !nextCP?.lng) return
    if (arrivedRef.current.has(segIdx)) return

    const distM = haversineM(coords.latitude, coords.longitude, nextCP.lat, nextCP.lng)

    // Switch to near mode
    setState(prev => ({
      ...prev,
      samplingMode: distM <= NEAR_THRESHOLD_M ? 'near' : 'far',
    }))

    // CP arrival detection
    if (distM <= ARRIVAL_RADIUS_M && raceStartTime !== null) {
      arrivedRef.current.add(segIdx)
      const actualCumMinutes = Math.round((Date.now() - raceStartTime) / 60000)
      const plannedMinutes = nextCP.km > 0
        ? blueprint.segments[segIdx].cumMinutes
        : 0
      const deviationPct = plannedMinutes > 0
        ? (actualCumMinutes - plannedMinutes) / plannedMinutes * 100
        : 0

      const arrival: CPArrival = {
        cpIndex: segIdx,
        plannedMinutes,
        actualMinutes: actualCumMinutes,
        deviationPct,
        timestamp: Date.now(),
      }

      const recalc = recalcFutureSegments(blueprint, segIdx, actualCumMinutes)

      setState(prev => ({
        ...prev,
        arrivals: [...prev.arrivals, arrival],
      }))

      onCPArrival(arrival, recalc)

      // Auto-advance to next segment after brief delay
      setTimeout(() => {
        onSegmentAdvance(segIdx + 1)
      }, 2000)
    }
  }, [blueprint, raceStartTime, onCPArrival, onSegmentAdvance])

  const scheduleNext = useCallback((mode: 'far' | 'near') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const interval = mode === 'near' ? NEAR_INTERVAL_MS : FAR_INTERVAL_MS
    timerRef.current = setTimeout(() => {
      if (!navigator.geolocation) return
      navigator.geolocation.getCurrentPosition(
        pos => {
          checkPosition(pos.coords)
          scheduleNext(pos.coords.accuracy < 50 ? 'near' : 'far') // re-evaluate mode
        },
        err => setGpsError(err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      )
    }, interval)
  }, [checkPosition])

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS not available on this device')
      return
    }

    setState(prev => ({ ...prev, watching: true, raceStartTime: Date.now() }))

    // Immediate first fix
    navigator.geolocation.getCurrentPosition(
      pos => {
        checkPosition(pos.coords)
        scheduleNext('far')
      },
      err => setGpsError(err.message),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    )
  }, [checkPosition, scheduleNext])

  const stopWatching = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setState(prev => ({ ...prev, watching: false }))
  }, [])

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return {
    state,
    gpsError,
    gpsAccuracy,
    startWatching,
    stopWatching,
  }
}
