import { useNavigate } from 'react-router-dom'
import { DemoDataStrip } from '../components/common/DemoDataStrip'
import { useAppStore } from '../hooks/useAppStore'
import type { UserRole } from '../types'

function postDemoLoginPath(role: UserRole): string {
  switch (role) {
    case 'content_admin':
      return '/admin/courses/drafts'
    case 'hr_admin':
      return '/admin/invites'
    case 'super_admin':
      return '/admin'
    default:
      return '/home'
  }
}

export function DemoAccessPage() {
  const { users, setCurrentUser } = useAppStore()
  const navigate = useNavigate()

  return (
    <>
      <DemoDataStrip bleed />
      <main className="landing-page">
        <section className="page-header">
          <p className="section-eyebrow">Demo access</p>
          <h1>Choose a seeded role</h1>
          <p className="page-subtitle">
            This page has one purpose: jump into a specific role for QA and journey testing.
          </p>
        </section>

        <section className="landing-support stack-sm">
          <h2>Role shortcuts</h2>
          <div className="landing-demo-list">
            {users.map((user) => (
              <button
                key={user.id}
                type="button"
                className="button button--secondary landing-demo-button"
                onClick={() => {
                  setCurrentUser(user.id)
                  navigate(postDemoLoginPath(user.role))
                }}
              >
                <span>{user.name}</span>
                <span>{user.role}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
