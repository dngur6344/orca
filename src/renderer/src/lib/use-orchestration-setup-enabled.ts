import { useEffect, useState } from 'react'
import {
  isOrchestrationSetupEnabled,
  ORCHESTRATION_SETUP_STATE_EVENT
} from './orchestration-setup-state'

export function useOrchestrationSetupEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => isOrchestrationSetupEnabled())

  useEffect(() => {
    const refresh = (): void => setEnabled(isOrchestrationSetupEnabled())
    window.addEventListener(ORCHESTRATION_SETUP_STATE_EVENT, refresh)
    return () => window.removeEventListener(ORCHESTRATION_SETUP_STATE_EVENT, refresh)
  }, [])

  return enabled
}
