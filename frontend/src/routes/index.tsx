import { createFileRoute, Link } from '@tanstack/react-router'
import logo from '../logo.svg'
import { useAuthStore } from '@/stores/auth-store'
import { useEffect } from 'react'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
    const {
    user,
    token,
    loginWithGoogle,
    logout,
    loading,
    error,
    initAuthListener,
  } = useAuthStore()

  useEffect(() => {
    initAuthListener()
  }, [initAuthListener])

  return (
        <div>
      {loading && <p>Loading...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {user ? (
        <>
          <p>Welcome, {user.displayName}</p>
          <p>Email: {user.email}</p>
          <img src={user.photoURL || logo} alt="User Avatar" style={{ width: 50, height: 50 }} />
          <p>Token: {token}</p>
          <button onClick={logout}>Logout</button>
          <nav>
            {/* <Link to="/admin/courses">Admin Courses</Link> */}
            {/* <Link to="/home">Home</Link> */}
          </nav>
        </>
      ) : (
        <button onClick={loginWithGoogle}>Login with Google</button>
      )}
    </div>
  )

}
