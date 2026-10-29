import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App.jsx'
import { useMotionPreference } from './hooks/useMotionPreference'

export function MotionPreferences({ children }) {
  const reduce = useMotionPreference()
  return <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>{children}</MotionConfig>
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <MotionPreferences><App /></MotionPreferences>
    </BrowserRouter>
  </StrictMode>,
)
