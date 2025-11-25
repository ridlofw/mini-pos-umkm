'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { db } from '@/lib/db'
import { setupAutoSync } from '@/lib/sync'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import MetricCard from '@/components/MetricCard'
import { DollarSign, ShoppingBag, TrendingUp } from 'lucide-react'

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
)

interface SalesData {
    totalRevenue: number
    totalOrders: number
    avgOrderValue: number
}

export default function DashboardPage() {
    const [weeklySales, setWeeklySales] = useState<any>(null)
    const [salesData, setSalesData] = useState<SalesData>({
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0
    })
    const [loading, setLoading] = useState(true)
    const [isOnline, setIsOnline] = useState(true)

    useEffect(() => {
        setIsOnline(navigator.onLine)

        const handleOnline = () => {
            setIsOnline(true)
            fetchData() // Refresh data when coming online
        }
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        // Initial data fetch
        fetchData()

        // Setup auto-sync
        const cleanupAutoSync = setupAutoSync()

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            cleanupAutoSync()
        }
    }, [])

    const fetchData = async () => {
        try {
            let salesArray: any[] = []

            if (navigator.onLine) {
                // Online: Fetch from Supabase
                const { data, error } = await supabase
                    .from('sales')
                    .select('total_amount, paid_at')
                    .order('paid_at', { ascending: true })

                if (!error && data) {
                    salesArray = data
                } else {
                    // If Supabase fails but we're "online", fallback to IndexedDB
                    console.warn('Supabase query failed, using local data')
                    salesArray = await getLocalSalesData()
                }
            } else {
                // Offline: Use IndexedDB
                salesArray = await getLocalSalesData()
            }

            processData(salesArray)
        } catch (error) {
            console.warn('Error loading sales data:', error)
            // Still try to process empty data to show UI
            processData([])
        } finally {
            setLoading(false)
        }
    }

    const getLocalSalesData = async () => {
        try {
            const pendingSales = await db.pending_sales.toArray()
            // Transform pending_sales to match Supabase format
            return pendingSales.map(sale => ({
                total_amount: sale.total_amount,
                paid_at: sale.paid_at
            }))
        } catch (error) {
            console.warn('Error reading from IndexedDB:', error)
            return []
        }
    }

    const processData = (data: any[]) => {
        // Calculate metrics
        const totalRevenue = data.reduce((sum, sale) => sum + sale.total_amount, 0)
        const totalOrders = data.length
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

        setSalesData({
            totalRevenue,
            totalOrders,
            avgOrderValue
        })

        // Group by day of week for the last 7 days
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']
        const salesByDay: Record<string, number> = {
            'Senin': 0,
            'Selasa': 0,
            'Rabu': 0,
            'Kamis': 0,
            'Jumat': 0,
            'Sabtu': 0,
            'Minggu': 0
        }

        data.forEach(sale => {
            const date = new Date(sale.paid_at)
            const dayName = dayNames[date.getDay()]
            salesByDay[dayName] = (salesByDay[dayName] || 0) + sale.total_amount
        })

        // Sort days in correct order (Mon-Sun)
        const orderedDays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
        const labels = orderedDays
        const values = orderedDays.map(day => salesByDay[day])

        setWeeklySales({
            labels,
            datasets: [
                {
                    label: 'Revenue',
                    data: values,
                    backgroundColor: '#3b82f6',
                    borderRadius: 8,
                    barThickness: 40,
                },
            ],
        })
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                callbacks: {
                    label: function (context: any) {
                        return 'Rp ' + context.parsed.y.toLocaleString('id-ID')
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function (value: any) {
                        return 'Rp ' + (value / 1000) + 'k'
                    }
                },
                grid: {
                    display: true,
                    color: '#f3f4f6'
                }
            },
            x: {
                grid: {
                    display: false
                }
            }
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="mx-auto max-w-7xl">
                {/* Header with Status */}
                <div className="mb-6 flex items-center justify-between">
                    <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
                    <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${isOnline ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                        {isOnline ? 'Online' : 'Offline (Local Data)'}
                    </div>
                </div>
                {loading ? (
                    <div className="flex h-64 items-center justify-center">
                        <div className="text-lg text-gray-500">Loading...</div>
                    </div>
                ) : (
                    <>
                        {/* Metric Cards */}
                        <div className="mb-6 grid gap-6 md:grid-cols-3">
                            <MetricCard
                                icon={<DollarSign className="h-6 w-6 text-green-600" />}
                                label="Total Revenue"
                                value={`Rp ${salesData.totalRevenue.toLocaleString('id-ID')}`}
                                iconBgColor="bg-green-100"
                            />
                            <MetricCard
                                icon={<ShoppingBag className="h-6 w-6 text-blue-600" />}
                                label="Total Orders"
                                value={salesData.totalOrders.toString()}
                                iconBgColor="bg-blue-100"
                            />
                            <MetricCard
                                icon={<TrendingUp className="h-6 w-6 text-purple-600" />}
                                label="Avg. Order Value"
                                value={`Rp ${Math.round(salesData.avgOrderValue).toLocaleString('id-ID')}`}
                                iconBgColor="bg-purple-100"
                            />
                        </div>

                        {/* Weekly Sales Chart */}
                        <div className="rounded-xl bg-white p-6 shadow-sm">
                            <h2 className="mb-6 text-xl font-semibold text-gray-900">Weekly Sales Revenue</h2>
                            <div className="h-80">
                                {weeklySales && (
                                    <Bar options={chartOptions} data={weeklySales} />
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
