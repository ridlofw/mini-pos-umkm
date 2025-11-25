import { db } from './db'
import { supabase } from './supabase'

/**
 * Upload pending product changes from IndexedDB to Supabase
 */
export async function syncPendingProducts() {
    try {
        // Get all unsynced product changes
        const unsyncedChanges = await db.pending_product_changes
            .filter(change => change.synced === 0)
            .toArray()

        if (unsyncedChanges.length === 0) {
            console.log('No pending product changes to sync')
            return
        }

        console.log(`Syncing ${unsyncedChanges.length} pending product changes...`)

        // Upload each change to Supabase
        for (const change of unsyncedChanges) {
            try {
                if (change.action === 'delete') {
                    // Soft delete
                    const { error } = await supabase
                        .from('products')
                        .update({
                            is_active: false,
                            deleted_at: change.product_data.deleted_at,
                            updated_at: change.product_data.updated_at
                        })
                        .eq('barcode', change.barcode)

                    if (error) {
                        console.error('Error deleting product in Supabase:', error)
                        continue
                    }
                } else {
                    // Create or Update
                    const { error } = await supabase
                        .from('products')
                        .upsert({
                            barcode: change.product_data.barcode,
                            name: change.product_data.name,
                            price: change.product_data.price,
                            stock: change.product_data.stock,
                            updated_at: change.product_data.updated_at,
                            is_active: change.product_data.is_active,
                            deleted_at: change.product_data.deleted_at
                        })

                    if (error) {
                        console.error('Error upserting product to Supabase:', error)
                        continue
                    }
                }

                // Mark as synced
                if (change.id) {
                    await db.pending_product_changes.update(change.id, { synced: 1 })
                }
            } catch (changeError) {
                console.error('Error processing change:', changeError)
            }
        }

        console.log('Pending product changes synced successfully')
    } catch (error) {
        console.error('Error syncing pending product changes:', error)
    }
}

/**
 * Download products from Supabase to IndexedDB
 */
export async function syncProducts() {
    try {
        // Fetch products from Supabase
        const { data: remoteProducts, error } = await supabase
            .from('products')
            .select('*')
            .order('updated_at', { ascending: false })

        if (error) {
            console.error('Error fetching products from Supabase:', error)
            return
        }

        if (!remoteProducts) return

        // Update local database
        for (const product of remoteProducts) {
            const localProduct = await db.products.get(product.barcode)

            // Check if there's a pending change for this product
            const hasPendingChange = await db.pending_product_changes
                .where('barcode')
                .equals(product.barcode)
                .and(change => change.synced === 0)
                .count()

            // Only update if:
            // 1. No pending local changes for this product
            // 2. Remote is newer or doesn't exist locally
            if (hasPendingChange === 0) {
                if (!localProduct || (product.updated_at && (!localProduct.updated_at || new Date(product.updated_at) > new Date(localProduct.updated_at)))) {
                    await db.products.put({
                        barcode: product.barcode,
                        name: product.name,
                        price: product.price,
                        stock: product.stock,
                        updated_at: product.updated_at,
                        is_active: product.is_active,
                        deleted_at: product.deleted_at
                    })
                }
            }
        }

        console.log('Products synced successfully')
    } catch (error) {
        console.error('Error syncing products:', error)
    }
}

export async function syncSales() {
    try {
        // Get all unsynced sales
        const unsyncedSales = await db.pending_sales
            .filter(sale => sale.synced === 0)
            .toArray()

        if (unsyncedSales.length === 0) {
            console.log('No pending sales to sync')
            return
        }

        // Upload each sale to Supabase
        for (const sale of unsyncedSales) {
            // Step 1: Insert into sales table (header)
            const { data: saleData, error: saleError } = await supabase
                .from('sales')
                .insert({
                    total_amount: sale.total_amount,
                    paid_at: sale.paid_at
                })
                .select('id')
                .single()

            if (saleError) {
                console.error('Error uploading sale to Supabase:', saleError)
                continue
            }

            if (!saleData) {
                console.error('No sale data returned after insert')
                continue
            }

            // Step 2: Insert into sale_items table (detail items)
            const saleItemsToInsert = sale.items.map(item => ({
                sale_id: saleData.id,
                product_barcode: item.product_barcode,
                quantity: item.quantity,
                price_each: item.price_each,
                subtotal: item.subtotal
            }))

            const { error: itemsError } = await supabase
                .from('sale_items')
                .insert(saleItemsToInsert)

            if (itemsError) {
                console.error('Error uploading sale items to Supabase:', itemsError)
                // Even if items fail, we continue since the sale header was created
            }

            // Mark as synced if successful
            if (sale.local_sale_id) {
                await db.pending_sales.update(sale.local_sale_id, { synced: 1 })
            }
        }

        console.log(`${unsyncedSales.length} sales synced successfully`)
    } catch (error) {
        console.error('Error syncing sales:', error)
    }
}

/**
 * Perform full synchronization (upload pending changes + download latest data)
 */
export async function fullSync() {
    if (!navigator.onLine) {
        console.log('Cannot sync: offline')
        return
    }

    console.log('🔄 Starting full sync...')

    // Step 1: Upload pending changes (products and sales)
    await syncPendingProducts()
    await syncSales()

    // Step 2: Download latest data
    await syncProducts()

    console.log('✅ Full sync completed')
}

/**
 * Setup auto-sync when browser comes back online
 */
export function setupAutoSync() {
    let syncTimeout: NodeJS.Timeout | null = null

    const handleOnline = () => {
        console.log('📶 Connection restored, auto-syncing...')

        // Debounce sync to avoid multiple calls
        if (syncTimeout) {
            clearTimeout(syncTimeout)
        }

        syncTimeout = setTimeout(() => {
            fullSync()
        }, 1000)
    }

    const handleVisibilityChange = () => {
        if (!document.hidden && navigator.onLine) {
            console.log('👀 Tab visible and online, checking sync...')

            if (syncTimeout) {
                clearTimeout(syncTimeout)
            }

            syncTimeout = setTimeout(() => {
                fullSync()
            }, 2000)
        }
    }

    // Listen for online event
    window.addEventListener('online', handleOnline)

    // Listen for visibility change (tab focus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Cleanup function
    return () => {
        window.removeEventListener('online', handleOnline)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        if (syncTimeout) {
            clearTimeout(syncTimeout)
        }
    }
}
