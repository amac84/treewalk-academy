import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from './AppRouter'
import { GlobalFeedbackBar } from './components/feedback/GlobalFeedbackBar'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <AppRouter />
      <GlobalFeedbackBar />
    </BrowserRouter>
  )
}

export default App
