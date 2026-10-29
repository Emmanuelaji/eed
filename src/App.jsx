import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { BarChart3, BookOpen, CalendarClock, CalendarDays, ClipboardList, Fingerprint, GraduationCap, History, LayoutDashboard, ListChecks, Building2, ScrollText, Settings as Cog, ShieldCheck, ScanLine, UserCog, Users, User, CalendarRange } from 'lucide-react'
import ProtectedRoute from './routes/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import { FullPageSpinner } from './components/ui/States'
import { useAuth, homeForRole } from './context/AuthContext'
import LandingPage from './pages/public/LandingPage'
import PublicRegistration from './pages/public/PublicRegistration'
import RegistrationSuccess from './pages/public/RegistrationSuccess'
import Login from './pages/auth/Login'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import Unauthorized from './pages/auth/Unauthorized'

const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const Students = lazy(() => import('./pages/admin/Students'))
const StudentDetails = lazy(() => import('./pages/admin/StudentDetails'))
const BiometricManagement = lazy(() => import('./pages/admin/BiometricManagement'))
const RegistrationForms = lazy(() => import('./pages/admin/RegistrationForms'))
const RegistrationFormEdit = lazy(() => import('./pages/admin/RegistrationFormEdit'))
const Academic = lazy(() => import('./pages/admin/AcademicPages'))
const ClassSessions = lazy(() => import('./pages/admin/ClassSessions'))
const ClassSessionForm = lazy(() => import('./pages/admin/ClassSessionForm'))
const LiveClassControl = lazy(() => import('./pages/admin/LiveClassControl'))
const AttendanceRecords = lazy(() => import('./pages/admin/AttendanceRecords'))
const Overrides = lazy(() => import('./pages/admin/Overrides'))
const Reports = lazy(() => import('./pages/admin/Reports'))
const Users_ = lazy(() => import('./pages/admin/Users'))
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const LecturerCourses = lazy(() => import('./pages/lecturer/LecturerCourses'))
const ScannerWelcome = lazy(() => import('./pages/attendance/ScannerWelcome'))
const Scanner = lazy(() => import('./pages/attendance/Scanner'))

const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })))
const Departments = named(() => import('./pages/admin/AcademicPages'), 'Departments')
const Courses = named(() => import('./pages/admin/AcademicPages'), 'Courses')
const AcademicSessions = named(() => import('./pages/admin/AcademicPages'), 'AcademicSessions')
const StudentDashboard = named(() => import('./pages/student/StudentPages'), 'StudentDashboard')
const StudentProfile = named(() => import('./pages/student/StudentPages'), 'StudentProfile')
const StudentAttendance = named(() => import('./pages/student/StudentPages'), 'StudentAttendance')
const StudentSchedule = named(() => import('./pages/student/StudentPages'), 'StudentSchedule')
const StudentBiometric = named(() => import('./pages/student/StudentPages'), 'StudentBiometric')

const adminNav = [
  { to: '/admin', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/admin/students', label: 'Students', icon: Users },
  { to: '/admin/classes', label: 'Class sessions', short: 'Classes', icon: CalendarClock },
  { to: '/scanner', label: 'Attendance scanner', short: 'Scanner', icon: ScanLine },
  { to: '/admin/reports', label: 'Reports', icon: BarChart3 },
  { to: '/admin/registration-forms', label: 'Registration forms', icon: ClipboardList },
  { to: '/admin/biometrics', label: 'Biometrics', icon: Fingerprint },
  { to: '/admin/attendance', label: 'Attendance records', icon: ListChecks },
  { to: '/admin/overrides', label: 'Overrides', icon: ShieldCheck },
  { to: '/admin/departments', label: 'Departments', icon: Building2 },
  { to: '/admin/courses', label: 'Courses', icon: BookOpen },
  { to: '/admin/academic-sessions', label: 'Academic sessions', icon: CalendarRange },
  { to: '/admin/users', label: 'Users & roles', icon: UserCog },
  { to: '/admin/audit-logs', label: 'Audit log', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Cog },
]
const lecturerNav = [
  { to: '/lecturer', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/lecturer/courses', label: 'My courses', short: 'Courses', icon: GraduationCap },
  { to: '/lecturer/classes', label: 'Class sessions', short: 'Classes', icon: CalendarClock },
  { to: '/scanner', label: 'Attendance scanner', short: 'Scanner', icon: ScanLine },
  { to: '/lecturer/overrides', label: 'Override approvals', short: 'Overrides', icon: ShieldCheck },
  { to: '/lecturer/reports', label: 'Reports', icon: BarChart3 },
  { to: '/lecturer/students', label: 'Students', icon: Users },
]
const studentNav = [
  { to: '/student', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, end: true },
  { to: '/student/schedule', label: 'Class schedule', short: 'Schedule', icon: CalendarDays },
  { to: '/student/attendance', label: 'Attendance', icon: History },
  { to: '/student/biometric', label: 'Biometric', icon: Fingerprint },
  { to: '/student/profile', label: 'Profile', icon: User },
]

function Home() {
  const { user, profile, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (user && profile?.is_active) return <Navigate to={homeForRole(profile.role)} replace />
  return <LandingPage />
}

// Pages shared by admins and lecturers. Data visibility is enforced by RLS, not by these routes.
const staffShared = () => (<>
  <Route path="classes" element={<ClassSessions />} />
  <Route path="classes/new" element={<ClassSessionForm />} />
  <Route path="classes/:id" element={<LiveClassControl />} />
  <Route path="classes/:id/edit" element={<ClassSessionForm />} />
  <Route path="students" element={<Students />} />
  <Route path="students/:id" element={<StudentDetails />} />
  <Route path="overrides" element={<Overrides />} />
  <Route path="reports" element={<Reports />} />
</>)

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/register/:token" element={<PublicRegistration />} />
        <Route path="/registration-success" element={<RegistrationSuccess />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        <Route path="/admin" element={<ProtectedRoute roles={['ADMIN']}><AppLayout nav={adminNav} area="Administration" /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          {staffShared()}
          <Route path="attendance" element={<AttendanceRecords />} />
          <Route path="biometrics" element={<BiometricManagement />} />
          <Route path="registration-forms" element={<RegistrationForms />} />
          <Route path="registration-forms/new" element={<RegistrationFormEdit />} />
          <Route path="registration-forms/:id" element={<RegistrationFormEdit />} />
          <Route path="departments" element={<Departments />} />
          <Route path="courses" element={<Courses />} />
          <Route path="academic-sessions" element={<AcademicSessions />} />
          <Route path="users" element={<Users_ />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="settings" element={<Settings />} />
        </Route>

        <Route path="/lecturer" element={<ProtectedRoute roles={['LECTURER']}><AppLayout nav={lecturerNav} area="Lecturer" /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="courses" element={<LecturerCourses />} />
          {staffShared()}
        </Route>

        <Route path="/student" element={<ProtectedRoute roles={['STUDENT']}><AppLayout nav={studentNav} area="Student" /></ProtectedRoute>}>
          <Route index element={<StudentDashboard />} />
          <Route path="schedule" element={<StudentSchedule />} />
          <Route path="attendance" element={<StudentAttendance />} />
          <Route path="biometric" element={<StudentBiometric />} />
          <Route path="profile" element={<StudentProfile />} />
        </Route>

        <Route path="/scanner" element={<ProtectedRoute roles={['ADMIN', 'LECTURER']}><ScannerWelcome /></ProtectedRoute>} />
        <Route path="/scanner/:sessionId" element={<ProtectedRoute roles={['ADMIN', 'LECTURER']}><Scanner /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
