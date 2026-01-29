import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
// 1. Importamos o Provider
import { GameProvider } from './context/GameContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* 2. O Provider PRECISA abraçar o App para os dados passarem */}
    <GameProvider>
      <App />
    </GameProvider>
  </React.StrictMode>,
)