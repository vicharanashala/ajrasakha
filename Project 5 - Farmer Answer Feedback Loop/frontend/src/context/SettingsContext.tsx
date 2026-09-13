/**
 * SettingsContext — global source-of-truth for flagging settings.
 * Loaded once from the backend on app mount and shared across all pages.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getFlaggingSettings } from '../client/api'

interface Settings {
  feedback_threshold: number
  min_responses_to_flag: number
}

interface SettingsCtx {
  settings: Settings
  setSettings: (s: Settings) => void
  loading: boolean
}

const DEFAULT: Settings = { feedback_threshold: 60, min_responses_to_flag: 10 }

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT,
  setSettings: () => {},
  loading: true,
})

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getFlaggingSettings()
      .then((s: Settings) => {
        setSettings(s)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <Ctx.Provider value={{ settings, setSettings, loading }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSettings() {
  return useContext(Ctx)
}
