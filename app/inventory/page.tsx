'use client'

import { useState, useEffect, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Product } from '@/lib/db'
import { fullSync, setupAutoSync } from '@/lib/sync'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import { Trash2, Edit, Plus, RefreshCw, Scan, Search, AlertTriangle } from 'lucide-react'
import BarcodeScanner from '@/components/BarcodeScanner'
import DeleteConfirmModal from '@/components/DeleteConfirmModal'

export default function InventoryPage() {
    const { user } = useAuth()
    const products = useLiveQuery(() => db.products.filter((p: Product) => p.is_active !== false).toArray())
    const [isOnline, setIsOnline] = useState(true)
    const [loading, setLoading] = useState(false)

    // Form state
    const [isEditing, setIsEditing] = useState(false)
    const [showScanner, setShowScanner] = useState(false)
    const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
    const [formData, setFormData] = useState<Product>({
        barcode: '',
        name: '',
        price: 0,
        stock: 0
    })

    useEffect(() => {
        setIsOnline(navigator.onLine)
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)

        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)

        // Initial sync
        handleSync()

        // Setup auto-sync on online/focus
        const cleanupAutoSync = setupAutoSync()

        return () => {
            window.removeEventListener('online', handleOnline)
            window.removeEventListener('offline', handleOffline)
            cleanupAutoSync()
        }
    }, [])

    const handleSync = async () => {
        if (!navigator.onLine) return
        setLoading(true)
        await fullSync()
        setLoading(false)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        const product: Product = {
            ...formData,
            updated_at: new Date().toISOString(),
            is_active: true,
            deleted_at: null
        }

        // Save to local database
        await db.products.put(product)

        if (navigator.onLine) {
            // If online, sync immediately
            const { error } = await supabase
                .from('products')
                .upsert({
                    barcode: product.barcode,
                    name: product.name,
                    price: product.price,
                    stock: product.stock,
                    updated_at: product.updated_at,
                    is_active: true,
                    deleted_at: null
                })

            if (error) {
                console.error('Error saving to Supabase:', error)
            }
        } else {
            // If offline, record to pending changes
            await db.pending_product_changes.add({
                barcode: product.barcode,
                action: isEditing ? 'update' : 'create',
                product_data: product,
                created_at: new Date().toISOString(),
                synced: 0
            })
            console.log('📝 Product change recorded for later sync')
        }

        resetForm()
    }

    const handleDelete = (product: Product) => {
        setDeleteProduct(product)
    }

    const confirmDelete = async () => {
        if (!deleteProduct) return

        const now = new Date().toISOString()

        const updatedProduct: Product = {
            ...deleteProduct,
            is_active: false,
            deleted_at: now,
            updated_at: now
        }

        // Soft delete locally
        await db.products.update(deleteProduct.barcode, {
            is_active: false,
            deleted_at: now,
            updated_at: now
        })

        if (navigator.onLine) {
            // Soft delete remotely
            await supabase
                .from('products')
                .update({
                    is_active: false,
                    deleted_at: now,
                    updated_at: now
                })
                .eq('barcode', deleteProduct.barcode)
        } else {
            // If offline, record to pending changes
            await db.pending_product_changes.add({
                barcode: deleteProduct.barcode,
                action: 'delete',
                product_data: updatedProduct,
                created_at: now,
                synced: 0
            })
            console.log('📝 Product deletion recorded for later sync')
        }

        setDeleteProduct(null)
    }

    const startEdit = (product: Product) => {
        setFormData(product)
        setIsEditing(true)
    }

    const resetForm = () => {
        setFormData({ barcode: '', name: '', price: 0, stock: 0 })
        setIsEditing(false)
        setShowScanner(false)
    }

    const handleScan = (decodedText: string) => {
        setFormData((prev: Product) => ({ ...prev, barcode: decodedText }))
        setShowScanner(false)
    }

    const handleCloseScanner = () => {
        setShowScanner(false)
    }

    // Calculate low stock products
    const lowStockProducts = useMemo(() => {
        if (!products) return []
        return products.filter((product: Product) => product.stock <= 5)
    }, [products])

    return (
        <div className="container mx-auto max-w-6xl p-6">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Inventory</h1>
                    <p className="text-slate-500">Manage your products and stock levels</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        {isOnline ? 'Online' : 'Offline'}
                    </div>
                    <button
                        onClick={handleSync}
                        disabled={loading}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Sync
                    </button>
                </div>
            </div>

            {/* Low Stock Notification */}
            {lowStockProducts.length > 0 && (
                <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                            <h3 className="font-semibold text-amber-800 mb-1">
                                Peringatan: {lowStockProducts.length} Produk Stok Rendah
                            </h3>
                            <p className="text-sm text-amber-700 mb-2">
                                Produk berikut memiliki stok ≤ 5 unit:
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {lowStockProducts.slice(0, 5).map((product: Product) => (
                                    <span
                                        key={product.barcode}
                                        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800"
                                    >
                                        {product.name}
                                        <span className="text-amber-600">({product.stock} unit{product.stock !== 1 ? 's' : ''})</span>
                                    </span>
                                ))}
                                {lowStockProducts.length > 5 && (
                                    <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                                        ... dan {lowStockProducts.length - 5} produk lainnya
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-8 lg:grid-cols-3">
                {/* Form Section */}
                <div className="lg:col-span-1">
                    <div className="card sticky top-24">
                        <h2 className="mb-4 text-lg font-semibold text-slate-800">{isEditing ? 'Edit Product' : 'Add New Product'}</h2>
                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div className="input-group">
                                <label className="input-label">Barcode</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={formData.barcode}
                                        onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                                        disabled={isEditing}
                                        className="w-full"
                                        placeholder="Scan or enter barcode"
                                        required
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowScanner(!showScanner)}
                                        className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:bg-slate-100"
                                        title="Scan Barcode"
                                    >
                                        <Scan className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="input-group">
                                <label className="input-label">Product Name</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full"
                                    placeholder="e.g. Indomie Goreng"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="input-group">
                                    <label className="input-label">Price</label>
                                    <input
                                        type="number"
                                        value={formData.price}
                                        onChange={e => setFormData({ ...formData, price: Number(e.target.value) })}
                                        className="w-full"
                                        min="0"
                                        required
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label">Stock</label>
                                    <input
                                        type="number"
                                        value={formData.stock}
                                        onChange={e => setFormData({ ...formData, stock: Number(e.target.value) })}
                                        className="w-full"
                                        min="0"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="mt-4 flex gap-2">
                                <button type="submit" className="btn-primary flex-1 flex items-center justify-center gap-2">
                                    {isEditing ? <Edit className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                    {isEditing ? 'Update Product' : 'Add Product'}
                                </button>
                                {isEditing && (
                                    <button type="button" onClick={resetForm} className="btn-secondary">
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>

                {/* List Section */}
                <div className="lg:col-span-2">
                    <div className="card overflow-hidden p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm text-slate-600">
                                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                    <tr>
                                        <th className="px-6 py-4 font-semibold">Product Info</th>
                                        <th className="px-6 py-4 font-semibold">Price</th>
                                        <th className="px-6 py-4 font-semibold">Stock</th>
                                        <th className="px-6 py-4 text-right font-semibold">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {products?.map((product: Product) => (
                                        <tr key={product.barcode} className="transition-colors hover:bg-slate-50">
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-slate-900">{product.name}</div>
                                                <div className="text-xs text-slate-400">{product.barcode}</div>
                                            </td>
                                            <td className="px-6 py-4 font-medium">
                                                Rp {product.price.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${product.stock <= 5
                                                    ? 'bg-red-100 text-red-800'
                                                    : 'bg-green-100 text-green-800'
                                                    }`}>
                                                    {product.stock} units
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => startEdit(product)}
                                                        className="rounded-lg p-2 text-blue-600 transition-colors hover:bg-blue-50"
                                                        title="Edit"
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(product)}
                                                        className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {products?.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                                                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                                                    <Search className="h-6 w-6 text-slate-400" />
                                                </div>
                                                <p>No products found</p>
                                                <p className="text-xs">Add a new product to get started</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Barcode Scanner Modal */}
            {showScanner && (
                <BarcodeScanner onScan={handleScan} onClose={handleCloseScanner} />
            )}

            {/* Delete Confirmation Modal */}
            <DeleteConfirmModal
                isOpen={deleteProduct !== null}
                onClose={() => setDeleteProduct(null)}
                onConfirm={confirmDelete}
                productName={deleteProduct?.name || ''}
            />
        </div>
    )
}
