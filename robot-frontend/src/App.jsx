import { useState } from 'react'

import SetupScreen    from './components/SetupScreen'
import MainInterface  from './components/MainInterface'

/**
 * App — raíz de la aplicación.
 *
 * session === null  →  pantalla de configuración (SetupScreen)
 * session !== null  →  interfaz principal del mago (MainInterface)
 *
 * session = { sessionId: string, user: { user_id, name, age }, mode: 'REAL'|'TEST' }
 */
export default function App() {
  const [session, setSession] = useState(null)

  if (!session) {
    return <SetupScreen onStart={setSession} />
  }

  return <MainInterface session={session} />
}
