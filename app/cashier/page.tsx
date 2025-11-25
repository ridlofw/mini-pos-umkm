'use client'

import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, Product } from '@/lib/db'
import { fullSync, setupAutoSync } from '@/lib/sync'
import BarcodeScanner from '@/components/BarcodeScanner'
import { Trash2, Plus, Minus, ShoppingCart, Printer, Scan, Search, CreditCard } from 'lucide-react'
import { jsPDF } from "jspdf";

interface CartItem {
    barcode: string
    name: string
    price: number
    stock: number
    quantity: number
    subtotal: number
    updated_at?: string
    is_active?: boolean
    deleted_at?: string | null
}

export default function CashierPage() {
    const products = useLiveQuery(() => db.products.filter((p: Product) => p.is_active !== false).toArray())
    const [cart, setCart] = useState<CartItem[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [showScanner, setShowScanner] = useState(false)
    const [isCheckout, setIsCheckout] = useState(false)
    const [lastSaleId, setLastSaleId] = useState<string | null>(null)

    // Setup auto-sync
    useEffect(() => {
        const cleanupAutoSync = setupAutoSync()
        return () => cleanupAutoSync()
    }, [])

    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.barcode === product.barcode)
            if (existing) {
                return prev.map(item =>
                    item.barcode === product.barcode
                        ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.price }
                        : item
                )
            }
            return [...prev, { ...product, quantity: 1, subtotal: product.price }]
        })
        // Don't close scanner - allow continuous scanning
    }

    const updateQuantity = (barcode: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.barcode === barcode) {
                const newQty = Math.max(1, item.quantity + delta)
                return { ...item, quantity: newQty, subtotal: newQty * item.price }
            }
            return item
        }))
    }

    const removeFromCart = (barcode: string) => {
        setCart(prev => prev.filter(item => item.barcode !== barcode))
    }

    const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0)

    const handleScan = (decodedText: string) => {
        const product = products?.find((p: Product) => p.barcode === decodedText)
        if (product) {
            addToCart(product)
        } else {
            // Product not found - just show console log, keep scanner open
            console.log('Product not found:', decodedText)
        }
    }

    const handleCloseScanner = () => {
        setShowScanner(false)
    }

    const handleCheckout = async () => {
        if (cart.length === 0) return
        setIsCheckout(true)

        const saleId = crypto.randomUUID()
        const sale = {
            local_sale_id: saleId,
            items: cart.map(item => ({
                product_barcode: item.barcode,
                quantity: item.quantity,
                price_each: item.price,
                subtotal: item.subtotal
            })),
            total_amount: totalAmount,
            paid_at: new Date().toISOString(),
            synced: 0
        }

        await db.pending_sales.add(sale)

        for (const item of cart) {
            const product = await db.products.get(item.barcode)
            if (product) {
                await db.products.update(item.barcode, { stock: product.stock - item.quantity })
            }
        }

        if (navigator.onLine) {
            await fullSync()
        }

        setLastSaleId(saleId)
        setCart([])
        setIsCheckout(false)
    }

    const filteredProducts = products?.filter((p: Product) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.barcode.includes(searchQuery)
    )

    const printReceipt = async () => {
        if (!lastSaleId) return;

        // Get sale data from database
        const sale = await db.pending_sales.where('local_sale_id').equals(lastSaleId).first();
        if (!sale) return;

        // Get product details for each item
        const itemsWithDetails = await Promise.all(
            sale.items.map(async (item: { product_barcode: string; quantity: number; price_each: number; subtotal: number }) => {
                const product = await db.products.get(item.product_barcode);
                return {
                    ...item,
                    name: product?.name || 'Unknown Product'
                };
            })
        );

        // Detect if mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            // PDF format for mobile - wider format for better mobile viewing
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: [80, 200] // Wider than thermal for mobile screens
            });

            const pageWidth = 80;
            const centerX = pageWidth / 2;
            const leftMargin = 5;
            const rightMargin = pageWidth - 5;

            let y = 15;

            // Store Name - Bold and larger
            doc.setFontSize(16);
            doc.setFont('courier', 'bold');
            doc.text("WarungKu", centerX, y, { align: "center" });

            y += 8;
            doc.setFontSize(10);
            doc.setFont('courier', 'normal');
            doc.text("Jl. Indrapasta No. 123", centerX, y, { align: "center" });

            y += 5;
            doc.text("Telp: 0851-8311-2683", centerX, y, { align: "center" });

            y += 7;
            // Divider line
            doc.setLineWidth(0.2);
            doc.setDrawColor(0);
            for (let i = leftMargin; i < rightMargin; i += 2) {
                doc.line(i, y, i + 1, y);
            }

            y += 7;
            const date = new Date(sale.paid_at);
            doc.setFontSize(9);
            doc.text(date.toLocaleDateString('id-ID'), centerX, y, { align: "center" });

            y += 5;
            doc.text(date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), centerX, y, { align: "center" });

            y += 7;
            // Divider line
            for (let i = leftMargin; i < rightMargin; i += 2) {
                doc.line(i, y, i + 1, y);
            }

            y += 7;
            doc.setFont('courier', 'bold');
            doc.setFontSize(11);
            doc.text("STRUK PEMBELIAN", centerX, y, { align: "center" });

            y += 7;
            // Divider line
            for (let i = leftMargin; i < rightMargin; i += 2) {
                doc.line(i, y, i + 1, y);
            }

            y += 8;
            doc.setFont('courier', 'normal');

            // Items
            itemsWithDetails.forEach((item: { product_barcode: string; quantity: number; price_each: number; subtotal: number; name: string }) => {
                // Check if we need more space
                if (y > 180) {
                    doc.addPage();
                    y = 15;
                }

                // Product name
                doc.setFontSize(10);
                const productName = item.name.length > 35 ? item.name.substring(0, 35) : item.name;
                doc.text(productName, leftMargin, y);
                y += 5;

                // Quantity x Price = Subtotal
                const qtyPrice = `${item.quantity} x Rp ${item.price_each.toLocaleString('id-ID')}`;
                const subtotal = `Rp ${item.subtotal.toLocaleString('id-ID')}`;

                doc.setFontSize(9);
                doc.text(qtyPrice, leftMargin, y);
                doc.text(subtotal, rightMargin, y, { align: "right" });
                y += 7;
            });

            y += 2;
            // Divider line
            for (let i = leftMargin; i < rightMargin; i += 2) {
                doc.line(i, y, i + 1, y);
            }

            y += 7;
            doc.setFont('courier', 'bold');
            doc.setFontSize(12);
            doc.text("TOTAL:", leftMargin, y);
            doc.text(`Rp ${sale.total_amount.toLocaleString('id-ID')}`, rightMargin, y, { align: "right" });

            y += 7;
            // Divider line
            for (let i = leftMargin; i < rightMargin; i += 2) {
                doc.line(i, y, i + 1, y);
            }

            y += 10;
            doc.setFont('courier', 'normal');
            doc.setFontSize(10);
            doc.text("Terima Kasih", centerX, y, { align: "center" });

            y += 6;
            doc.text("Selamat Berbelanja Kembali", centerX, y, { align: "center" });

            // Open in new tab for better mobile experience
            const pdfBlob = doc.output('blob');
            const pdfUrl = URL.createObjectURL(pdfBlob);
            const newWindow = window.open(pdfUrl, '_blank');

            // Fallback to download if popup blocked
            if (!newWindow) {
                doc.save(`receipt-${lastSaleId.substring(0, 8)}.pdf`);
            }
        } else {
            // Thermal printer format for web - use window.print
            const receiptWindow = window.open('', '', 'width=300,height=600');
            if (!receiptWindow) return;

            const date = new Date(sale.paid_at);

            receiptWindow.document.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Receipt</title>
                    <style>
                        @media print {
                            @page {
                                size: 58mm auto;
                                margin: 0;
                            }
                            body {
                                margin: 0;
                                padding: 0;
                            }
                        }
                        
                        body {
                            font-family: 'Courier New', monospace;
                            width: 58mm;
                            margin: 0 auto;
                            padding: 5mm;
                            font-size: 10pt;
                        }
                        
                        .center {
                            text-align: center;
                        }
                        
                        .bold {
                            font-weight: bold;
                        }
                        
                        .header {
                            font-size: 14pt;
                            font-weight: bold;
                            margin-bottom: 3mm;
                        }
                        
                        .divider {
                            border-top: 1px dashed #000;
                            margin: 3mm 0;
                        }
                        
                        .item {
                            margin: 2mm 0;
                        }
                        
                        .item-name {
                            font-weight: normal;
                        }
                        
                        .item-detail {
                            display: flex;
                            justify-content: space-between;
                            font-size: 9pt;
                        }
                        
                        .total {
                            font-size: 12pt;
                            font-weight: bold;
                            display: flex;
                            justify-content: space-between;
                            margin-top: 3mm;
                        }
                        
                        .footer {
                            margin-top: 5mm;
                            font-size: 9pt;
                        }
                    </style>
                </head>
                <body>
                    <div class="center header">WarungKu</div>
                    <div class="center">Jl. Indrapasta No. 123</div>
                    <div class="center">Telp: 0851-8311-2683</div>
                    
                    <div class="divider"></div>
                    
                    <div class="center">${date.toLocaleDateString('id-ID')}</div>
                    <div class="center">${date.toLocaleTimeString('id-ID')}</div>
                    
                    <div class="divider"></div>
                    
                    <div class="center bold">STRUK PEMBELIAN</div>
                    
                    <div class="divider"></div>
                    
                    ${itemsWithDetails.map((item: { product_barcode: string; quantity: number; price_each: number; subtotal: number; name: string }) => `
                        <div class="item">
                            <div class="item-name">${item.name}</div>
                            <div class="item-detail">
                                <span>${item.quantity} x Rp ${item.price_each.toLocaleString('id-ID')}</span>
                                <span>Rp ${item.subtotal.toLocaleString('id-ID')}</span>
                            </div>
                        </div>
                    `).join('')}
                    
                    <div class="divider"></div>
                    
                    <div class="total">
                        <span>TOTAL:</span>
                        <span>Rp ${sale.total_amount.toLocaleString('id-ID')}</span>
                    </div>
                    
                    <div class="divider"></div>
                    
                    <div class="center footer">Terima Kasih</div>
                    <div class="center footer">Selamat Berbelanja Kembali</div>
                </body>
                </html>
            `);

            receiptWindow.document.close();
            receiptWindow.focus();

            // Auto print after a brief delay
            setTimeout(() => {
                receiptWindow.print();
                receiptWindow.close();
            }, 250);
        }
    }

    return (
        <div className="container mx-auto h-[calc(100vh-64px)] p-4">
            <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Left: Product List */}
                <div className="flex flex-col gap-4 lg:col-span-2">
                    <div className="flex gap-4">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Search products..."
                                className="w-full pl-4 pr-10 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all hover:border-slate-400"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        </div>
                        <button
                            onClick={() => setShowScanner(!showScanner)}
                            className={`btn-secondary flex items-center gap-2 ${showScanner ? 'bg-blue-50 text-blue-600 border-blue-200' : ''}`}
                        >
                            <Scan className="h-5 w-5" />
                            <span className="hidden sm:inline">Scan</span>
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto rounded-xl bg-slate-50 p-4 border border-slate-200">
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                            {filteredProducts?.map((product: Product) => (
                                <div
                                    key={product.barcode}
                                    onClick={() => addToCart(product)}
                                    className="group cursor-pointer rounded-xl bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md border border-slate-100"
                                >
                                    <div className="mb-2 aspect-square w-full rounded-lg bg-slate-100 flex items-center justify-center text-slate-300">
                                        <ShoppingCart className="h-8 w-8" />
                                    </div>
                                    <div className="font-semibold text-slate-900 line-clamp-1">{product.name}</div>
                                    <div className="flex items-center justify-between mt-1">
                                        <div className="text-sm font-medium text-blue-600">Rp {product.price.toLocaleString()}</div>
                                        <div className={`text-xs font-medium px-1.5 py-0.5 rounded ${product.stock <= 5 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                            {product.stock}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Cart */}
                <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm h-full">
                    <div className="border-b border-slate-100 p-4">
                        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                            <ShoppingCart className="h-5 w-5" /> Current Order
                        </h2>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {cart.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center text-slate-400">
                                <ShoppingCart className="mb-4 h-12 w-12 opacity-20" />
                                <p>Cart is empty</p>
                                <p className="text-sm">Scan or click products to add</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {cart.map(item => (
                                    <div key={item.barcode} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
                                        <div className="flex-1">
                                            <div className="font-medium text-slate-900">{item.name}</div>
                                            <div className="text-sm text-slate-500">Rp {item.price.toLocaleString()} x {item.quantity}</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center rounded-lg bg-white shadow-sm border border-slate-200">
                                                <button onClick={() => updateQuantity(item.barcode, -1)} className="p-1 hover:bg-slate-50 rounded-l-lg"><Minus className="h-4 w-4" /></button>
                                                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.barcode, 1)} className="p-1 hover:bg-slate-50 rounded-r-lg"><Plus className="h-4 w-4" /></button>
                                            </div>
                                            <button onClick={() => removeFromCart(item.barcode)} className="text-red-400 hover:text-red-600">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="border-t border-slate-100 bg-slate-50 p-4 rounded-b-xl">
                        <div className="mb-4 flex justify-between text-lg font-bold text-slate-900">
                            <span>Total</span>
                            <span>Rp {totalAmount.toLocaleString()}</span>
                        </div>

                        {lastSaleId ? (
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center justify-center gap-2 rounded-lg bg-green-100 p-3 text-green-700 font-medium">
                                    <CreditCard className="h-5 w-5" /> Payment Successful
                                </div>
                                <button onClick={printReceipt} className="btn-secondary flex w-full items-center justify-center gap-2">
                                    <Printer className="h-4 w-4" /> Print Receipt
                                </button>
                                <button onClick={() => setLastSaleId(null)} className="btn-primary w-full">
                                    New Transaction
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={handleCheckout}
                                disabled={cart.length === 0 || isCheckout}
                                className="btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isCheckout ? 'Processing...' : 'Charge Rp ' + totalAmount.toLocaleString()}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Barcode Scanner Modal */}
            {showScanner && (
                <BarcodeScanner onScan={handleScan} onClose={handleCloseScanner} autoClose={false} />
            )}
        </div>
    )
}
