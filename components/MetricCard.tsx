import React from 'react'

interface MetricCardProps {
    icon: React.ReactNode
    label: string
    value: string
    iconBgColor: string
}

export default function MetricCard({ icon, label, value, iconBgColor }: MetricCardProps) {
    return (
        <div className="rounded-xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-4">
                <div
                    className={`flex h-14 w-14 items-center justify-center rounded-xl ${iconBgColor}`}
                >
                    {icon}
                </div>
                <div className="flex-1">
                    <p className="text-sm text-gray-500">{label}</p>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                </div>
            </div>
        </div>
    )
}
