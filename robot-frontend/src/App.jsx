import { useState } from 'react'

import SetupScreen   from './components/SetupScreen'
import MainInterface from './components/MainInterface'
import SessionsView  from './components/SessionsView'

/**
 * App — raíz de la aplicación.
 *
 * view === 'setup'    →  pantalla de configuración de sesión
 * view === 'records'  →  vista de consulta de registros históricos
 * view === 'session'  →  interfaz principal del mago durante una sesión activa
 */
export default function App() {
  const [view, setView]       = useState('setup')   // 'setup' | 'records' | 'session'
  const [session, setSession] = useState(null)

  if (view === 'session' && session) {
    return <MainInterface session={session} onEnd={() => { setSession(null); setView('setup') }} />
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
