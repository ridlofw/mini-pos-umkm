import Dexie, { Table } from 'dexie'

export interface Product {
    barcode: string
    name: string
    price: number
    stock: number
    updated_at?: string
    is_active?: boolean
    deleted_at?: string | null
}

export interface PendingSale {
    local_sale_id?: string
    items: {
        product_barcode: string
        quantity: number
        price_each: number
        subtotal: number
    }[]
    total_amount: number
    paid_at: string
    synced: number
}

export interface PendingProductChange {
    id?: number
    barcode: string
    action: 'create' | 'update' | 'delete'
    product_data: Product
    created_at: string
    synced: number
}

export class PosDatabase extends Dexie {
    products!: Table<Product, string>
    pending_sales!: Table<PendingSale, string>
    pending_product_changes!: Table<PendingProductChange, number>

    constructor() {
        super('PosDatabase')

        // Version 1: Initial schema
        this.version(1).stores({
            products: 'barcode, name, price, stock, updated_at, is_active',
            pending_sales: '++local_sale_id, paid_at, synced'
        })

        // Version 2: Add pending_product_changes for offline sync
        this.version(2).stores({
            products: 'barcode, name, price, stock, updated_at, is_active',
            pending_sales: '++local_sale_id, paid_at, synced',
            pending_product_changes: '++id, barcode, synced, created_at'
        })
    }
}

export const db = new PosDatabase()
