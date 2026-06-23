import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Share from './Share'
import './styles.css'

// Tiny client-side route: /s/<id> shows a shared, read-only report.
const shareMatch = window.location.pathname.match(/^\/s\/([^/]+)/)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {shareMatch ? <Share id={decodeURIComponent(shareMatch[1])} /> : <App />}
  </React.StrictMode>,
)
