'use client'

import Link from 'next/link'
import { useAuth } from './AuthProvider'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, ShoppingCart, Package, LogOut, Store } from 'lucide-react'

export default function Navbar() {
    const { signOut } = useAuth()
    const pathname = usePathname()

    return (
        <nav className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
                <Link href="/" className="flex items-center gap-2 text-xl font-bold text-blue-600 transition-colors hover:text-blue-700">
                    <Store className="h-6 w-6" />
                    <span>WarungKu</span>
                </Link>

                <div className="flex items-center gap-1 sm:gap-2">
                    <NavLink href="/inventory" active={pathname === '/inventory'} icon={<Package className="h-4 w-4" />}>
                        Inventory
                    </NavLink>
                    <NavLink href="/cashier" active={pathname === '/cashier'} icon={<ShoppingCart className="h-4 w-4" />}>
                        Cashier
                    </NavLink>
                    <NavLink href="/dashboard" active={pathname === '/dashboard'} icon={<LayoutDashboard className="h-4 w-4" />}>
                        Dashboard
                    </NavLink>

                    <div className="mx-2 h-6 w-px bg-slate-200"></div>

                    <button
                        onClick={signOut}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden sm:inline">Logout</span>
                    </button>
                </div>
            </div>
        </nav>
    )
}

function NavLink({ href, active, icon, children }: { href: string, active: boolean, icon: React.ReactNode, children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className={`
                flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200
                ${active
                    ? 'bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }
            `}
        >
            {icon}
            <span className="hidden sm:inline">{children}</span>
        </Link>
    )
}
