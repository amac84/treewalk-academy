import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from './AppRouter'
import { ClerkAcademyBridge } from './components/auth/ClerkAcademyBridge'
import { GlobalFeedbackBar } from './components/feedback/GlobalFeedbackBar'
import { isClerkConfigured } from './lib/clerkEnv'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      {isClerkConfigured() ? <ClerkAcademyBridge /> : null}
      <AppRouter />
      <GlobalFeedbackBar />
    </BrowserRouter>
  )
}

export default App
