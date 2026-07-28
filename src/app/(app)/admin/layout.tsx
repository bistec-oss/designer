import { ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { resolveTeamForServerComponent } from '@/lib/authz/serverTeam'
import { GlassPanel } from '@/components/ui/GlassPanel'

// Server-side gate for every /admin page. The sidebar already hides the Admin
// entries for non-admins; this enforces it for direct navigation.
//
// This gate is TEAM-admin (per-team role ADMIN, super admins pass every gate),
// NOT global-admin — matching the sidebar (`adminOnly` → isTeamAdmin) and the
// brand-kit API (`withTeamAdmin`). Gating on the global role blocked a team
// admin (whose global Role is EDITOR) from /admin/brandkits even though the API
// would serve them. The super-admin-only pages under /admin (users, teams) keep
// their own in-page "Requires super admin" gate, so loosening this to team-admin
// does not widen their access.
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await resolveTeamForServerComponent()
  const isTeamAdmin =
    ctx != null &&
    (ctx.isSuperAdmin || (ctx.team.kind === 'ok' && ctx.team.teamRole === 'ADMIN'))

  if (!isTeamAdmin) {
    return (
      <GlassPanel className="p-12 text-center max-w-md mx-auto mt-12">
        <ShieldAlert size={32} className="mx-auto mb-3 text-light-text-muted dark:text-dark-text-muted" />
        <h1 className="text-lg font-semibold text-light-text dark:text-dark-text mb-1">
          Requires admin
        </h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-4">
          This area is limited to administrators. Ask an admin if you need access.
        </p>
        <Link
          href="/"
          className="text-sm text-primary dark:text-primary-light hover:underline"
        >
          Back to Dashboard
        </Link>
      </GlassPanel>
    )
  }

  return <>{children}</>
}
