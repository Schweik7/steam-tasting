import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import Share from './Share'
import Admin from './Admin'
import './styles.css'

// Tiny client-side router:
//   /s/<id>      → public read-only shared report
//   /<segment>   → admin console attempt (backend 404s unless it's ADMIN_PATH)
//   /            → the main app
const path = window.location.pathname
const shareMatch = path.match(/^\/s\/([^/]+)/)
const adminMatch = path.match(/^\/([^/]+)\/?$/)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {shareMatch ? (
      <Share id={decodeURIComponent(shareMatch[1])} />
    ) : adminMatch ? (
      <Admin path={decodeURIComponent(adminMatch[1])} />
    ) : (
      <App />
    )}
  </React.StrictMode>,
)
