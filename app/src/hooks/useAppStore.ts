import { useContext, useMemo } from 'react'
import { AppStoreContext } from '../state/AppStoreContext'

export function useAppStore() {
  const context = useContext(AppStoreContext)
  if (!context) {
    throw new Error('useAppStore must be used within an AppStoreProvider')
  }
  return context
}

export function useCurrentUser() {
  const store = useAppStore()
  return store.currentUser
}

export function useRoleLabel() {
  const store = useAppStore()

  return useMemo(() => {
    const role = store.currentUserRole
    if (!role) return 'Guest'
    return role.replace('_', ' ')
  }, [store.currentUserRole])
}
