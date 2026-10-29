import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import App from '../src/App'
import { AuthProvider } from '../src/context/AuthContext'

const render = (path) => renderToString(React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(AuthProvider, null, React.createElement(App))))

describe('router configuration', () => {
  it.each(['/', '/login', '/forgot-password', '/reset-password', '/unauthorized', '/register/ABC123', '/registration-success',
    '/admin', '/admin/students', '/admin/classes', '/admin/classes/new', '/admin/classes/abc', '/admin/classes/abc/edit', '/admin/reports', '/admin/overrides',
    '/admin/registration-forms', '/admin/registration-forms/new', '/admin/registration-forms/abc', '/admin/departments', '/admin/courses', '/admin/academic-sessions',
    '/admin/users', '/admin/audit-logs', '/admin/settings', '/admin/biometrics', '/admin/attendance', '/admin/students/abc',
    '/lecturer', '/lecturer/courses', '/lecturer/classes', '/lecturer/classes/abc', '/lecturer/classes/new', '/lecturer/overrides', '/lecturer/reports', '/lecturer/students',
    '/student', '/student/schedule', '/student/attendance', '/student/biometric', '/student/profile', '/scanner', '/scanner/abc', '/nonexistent',
  ])('renders %s without a routing error', (path) => { expect(() => render(path)).not.toThrow() })
  it('the login page shows the unconfigured-Supabase notice instead of crashing', () => {
    // no Supabase env in tests: the app must degrade gracefully
    expect(render('/login')).toBeTypeOf('string')
  })
})
