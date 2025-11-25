'use client'

import { AlertTriangle, X } from 'lucide-react'
import { useEffect } from 'react'

interface DeleteConfirmModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: () => void
    productName: string
}

export default function DeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    productName
}: DeleteConfirmModalProps) {
    // Close modal on ESC key
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        if (isOpen) {
            window.addEventListener('keydown', handleEsc)
            // Prevent body scroll when modal is open
            document.body.style.overflow = 'hidden'
        }
        return () => {
            window.removeEventListener('keydown', handleEsc)
            document.body.style.overflow = 'unset'
        }
    }, [isOpen, onClose])

    if (!isOpen) return null

    const handleConfirm = () => {
        onConfirm()
        onClose()
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop with blur effect */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md transform rounded-2xl bg-white p-6 shadow-2xl transition-all animate-scale-in">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                    <X className="h-5 w-5" />
                </button>

                {/* Icon */}
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-50 to-red-100">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-red-200">
                        <AlertTriangle className="h-7 w-7 text-red-600" />
                    </div>
                </div>

                {/* Title */}
                <h3 className="mb-2 text-center text-xl font-bold text-slate-900">
                    Hapus Produk?
                </h3>

                {/* Message */}
                <p className="mb-6 text-center text-sm text-slate-600">
                    Apakah Anda yakin ingin menghapus produk{' '}
                    <span className="font-semibold text-slate-900">{productName}</span>?
                    <br />
                    <span className="text-xs text-slate-500">Produk yang sudah dihapus tidak dapat dikembalikan.</span>
                </p>

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 rounded-lg border-2 border-slate-200 bg-white px-4 py-2.5 font-semibold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-95"
                    >
                        Batal
                    </button>
                    <button
                        onClick={handleConfirm}
                        className="flex-1 rounded-lg bg-gradient-to-r from-red-600 to-red-500 px-4 py-2.5 font-semibold text-white shadow-lg shadow-red-500/30 transition-all hover:shadow-xl hover:shadow-red-500/40 active:scale-95"
                    >
                        Ya, Hapus
                    </button>
                </div>
            </div>
        </div>
    )
}
