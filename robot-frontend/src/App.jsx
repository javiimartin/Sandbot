import { useState } from 'react'

import SetupScreen     from './components/SetupScreen'
import MainInterface   from './components/MainInterface'
import SessionsView    from './components/SessionsView'
import MovementControl from './components/MovementControl'

/**
 * App — raíz de la aplicación.
 *
 * view === 'setup'    →  pantalla de configuración de sesión
 * view === 'records'  →  vista de consulta de registros históricos
 * view === 'session'  →  interfaz principal del mago durante una sesión activa
 * view === 'movement' →  panel de control de movimiento del robot
 */
export default function App() {
  const [view, setView]       = useState('setup')
  const [session, setSession] = useState(null)

  const endSession = () => { setSession(null); setView('setup') }

  if (view === 'movement' && session) {
    return (
      <MovementControl
        session={session}
        onBack={() => setView('session')}
        onEnd={endSession}
      />
    )
  }

  if (view === 'session' && session) {
    return (
      <MainInterface
        session={session}
        onEnd={endSession}
        onOpenMovement={() => setView('movement')}
      />
    )
  }

  if (view === 'records') {
    return <SessionsView onBack={() => setView('setup')} />
  }

  return (
    <SetupScreen
      onStart={(s) => { setSession(s); setView('session') }}
      onViewRecords={() => setView('records')}
    />
  )
}
