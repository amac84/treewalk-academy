import { ClerkProvider } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getClerkPublishableKey } from './lib/clerkEnv'
import { loadAppSettings } from './lib/appSettings'
import { AppStoreProvider } from './state/AppStore'

async function bootstrap() {
  await loadAppSettings()
  const clerkKey = getClerkPublishableKey()
  const tree = (
    <StrictMode>
      <AppStoreProvider>
        <App />
      </AppStoreProvider>
    </StrictMode>
  )

  createRoot(document.getElementById('root')!).render(
    clerkKey ? (
      <ClerkProvider
        publishableKey={clerkKey}
        afterSignOutUrl="/"
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
        signInFallbackRedirectUrl="/home"
        signUpFallbackRedirectUrl="/home"
        signInForceRedirectUrl="/home"
        signUpForceRedirectUrl="/home"
      >
        {tree}
      </ClerkProvider>
    ) : (
      tree
    ),
  )
}

void bootstrap()
