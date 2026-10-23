import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'commonPoker.reduceMotion'
const CHANGE_EVENT = 'commonpoker:motion-preference'
let fallbackValue = false

function readPreference() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === 'true'
  } catch {
    // Keep the preference usable for this page when browser storage is blocked.
  }
  return fallbackValue
}

function applyPreference() {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.reduceMotion = readPreference() ? 'true' : 'false'
  }
}

if (typeof window !== 'undefined') applyPreference()

function subscribe(listener) {
  const onStorage = event => {
    if (event.key === STORAGE_KEY || event.key === null) applyPreference()
    listener()
  }
  const onLocalChange = () => {
    applyPreference()
    listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, onLocalChange)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, onLocalChange)
  }
}

export function setReducedMotion(value) {
  fallbackValue = Boolean(value)
  try {
    window.localStorage.setItem(STORAGE_KEY, String(fallbackValue))
  } catch {
    // The in-memory preference still applies for the current page.
  }
  applyPreference()
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function useReducedMotion() {
  return useSyncExternalStore(subscribe, readPreference, () => false)
}
