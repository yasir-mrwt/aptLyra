import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { Provider } from 'react-redux'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { BrowserRouter as Router } from 'react-router-dom'
import axios from 'axios'
import App from './App.tsx'
import { store } from './app/store.ts'
import './index.css'
import { setupInterceptors } from './services/axiosSetup.ts'
import { googleClientId, googleLoginConfigured } from './services/googleLoginConfig.ts'

setupInterceptors(axios);

const application = <Provider store={store}><Router><App /></Router></Provider>;
ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>{googleLoginConfigured ? <GoogleOAuthProvider clientId={googleClientId}>{application}</GoogleOAuthProvider> : application}</StrictMode>,
)
