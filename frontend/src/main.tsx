import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter as Router } from 'react-router-dom'
import App from './App.tsx'
import { store } from './app/store.ts'
import './index.css'
import { restoreSession } from './features/auth/authSlice.ts'

void store.dispatch(restoreSession());

const application = <Provider store={store}><Router><App /></Router></Provider>;
ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>{application}</StrictMode>,
)
