import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Font self-host: satu font variable (100–900) dipotong per unicode-range, jadi
// peramban hanya mengunduh potongan huruf yang benar-benar tampil.
import '@fontsource-variable/noto-sans-kr/wght.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
