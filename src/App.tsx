import { AppLayout } from './components/layout/AppLayout'
import { usePersistence } from './hooks/usePersistence'

function App() {
  usePersistence()
  return <AppLayout />
}

export default App
