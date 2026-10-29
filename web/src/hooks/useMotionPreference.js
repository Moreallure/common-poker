import { useEffect, useSyncExternalStore } from 'react'
import { useReducedMotion as useSystemReducedMotion } from 'motion/react'

const STORAGE_KEY = 'commonPoker.reduceMotion'
const CHANGE_EVENT = 'commonpoker:motion-preference'
const QUERY = '(prefers-reduced-motion: reduce)'

function readStoredPreference() {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch {
    // Fall back to the operating-system preference when storage is unavailable.
  }
  return null
}

function readSystemPreference() {
  return typeof window !== 'undefined' && window.matchMedia?.(QUERY)?.matches === true
}

function applyPreference(value) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.reduceMotion = String(value)
  }
}

export function setMotionPreference(value) {
  if (typeof window === 'undefined') return
  try {
    if (value === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, String(Boolean(value)))
  } catch {
    // Keep the setting usable for this page even when storage is unavailable.
  }
  applyPreference(value ?? readSystemPreference())
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(listener) {
  const onStorage = event => {
    if (event.key === STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, listener)
  }
}

applyPreference(readStoredPreference() ?? readSystemPreference())

export function useMotionPreference() {
  const stored = useSyncExternalStore(subscribe, readStoredPreference, () => null)
  const system = useSystemReducedMotion()
  const reduce = stored ?? Boolean(system)

  useEffect(() => applyPreference(reduce), [reduce])
  return reduce
}

export function useMotionPreferenceSettings() {
  const stored = useSyncExternalStore(subscribe, readStoredPreference, () => null)
  const system = useSystemReducedMotion()
  return {
    reduce: stored ?? Boolean(system),
    override: stored,
    setPreference: setMotionPreference,
  }
}
