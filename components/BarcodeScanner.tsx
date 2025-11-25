'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader, NotFoundException } from '@zxing/library'
import { X, Camera, RefreshCcw } from 'lucide-react'

interface BarcodeScannerProps {
    onScan: (barcode: string) => void
    onClose: () => void
    autoClose?: boolean // Optional: whether to auto-close after scan
}

export default function BarcodeScanner({ onScan, onClose, autoClose = true }: BarcodeScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const readerRef = useRef<BrowserMultiFormatReader | null>(null)
    const scannedRef = useRef<boolean>(false) // Track if we've already scanned
    const [isScanning, setIsScanning] = useState(false)
    const [error, setError] = useState<string>('')
    const [cameraReady, setCameraReady] = useState(false)
    const [videoInputDevices, setVideoInputDevices] = useState<MediaDeviceInfo[]>([])
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

    // Initialize reader and devices
    useEffect(() => {
        const codeReader = new BrowserMultiFormatReader()
        readerRef.current = codeReader

        codeReader.listVideoInputDevices()
            .then((devices) => {
                setVideoInputDevices(devices)
                if (devices.length > 0) {
                    // Try to find back camera first, otherwise use the first available
                    const backCamera = devices.find(device => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('environment'))
                    setSelectedDeviceId(backCamera ? backCamera.deviceId : devices[0].deviceId)
                } else {
                    setError('No camera found')
                }
            })
            .catch((err) => {
                console.error('Error listing devices:', err)
                setError('Failed to access camera devices.')
            })

        return () => {
            if (readerRef.current) {
                readerRef.current.reset()
            }
        }
    }, [])

    // Start scanning when selectedDeviceId changes
    useEffect(() => {
        if (!selectedDeviceId || !readerRef.current) return

        const startScanning = async () => {
            try {
                setCameraReady(false)
                setIsScanning(false)
                scannedRef.current = false

                // Reset previous stream if any
                readerRef.current?.reset()

                setIsScanning(true)

                await readerRef.current?.decodeFromVideoDevice(
                    selectedDeviceId,
                    videoRef.current!,
                    (result, error) => {
                        if (result && !scannedRef.current) {
                            scannedRef.current = true
                            const barcodeText = result.getText()
                            console.log('Barcode detected:', barcodeText)

                            const beep = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwJHm/A7+CVMQ0PU6rk77FgGAU+ltryxnUpCS18y/DReSsIHG+/8N2VMRAM')
                            beep.play().catch(e => console.log('Audio play failed:', e))

                            if (autoClose && readerRef.current) {
                                readerRef.current.reset()
                            }

                            onScan(barcodeText)

                            if (!autoClose) {
                                setTimeout(() => {
                                    scannedRef.current = false
                                }, 2000)
                            }
                        }

                        if (error && !(error instanceof NotFoundException)) {
                            console.error('Scanner error:', error)
                        }
                    }
                )

                setTimeout(() => setCameraReady(true), 500)

            } catch (err) {
                console.error('Error starting scanner:', err)
                setError('Failed to start camera stream.')
                setIsScanning(false)
            }
        }

        startScanning()

    }, [selectedDeviceId, autoClose, onScan])

    const handleClose = () => {
        if (readerRef.current) {
            readerRef.current.reset()
        }
        onClose()
    }

    const switchCamera = useCallback(() => {
        if (videoInputDevices.length <= 1) return

        const currentIndex = videoInputDevices.findIndex(d => d.deviceId === selectedDeviceId)
        const nextIndex = (currentIndex + 1) % videoInputDevices.length
        setSelectedDeviceId(videoInputDevices[nextIndex].deviceId)
    }, [videoInputDevices, selectedDeviceId])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/33">
            <div className="relative w-full max-w-2xl mx-4">
                {/* Close button */}
                <button
                    onClick={handleClose}
                    className="absolute -top-12 right-0 flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-white transition-colors hover:bg-red-600 shadow-lg"
                >
                    <X className="h-5 w-5" />
                    Close
                </button>

                {/* Scanner card */}
                <div className="overflow-hidden rounded-2xl bg-white shadow-2xl border-2 border-blue-200">
                    {/* Header */}
                    <div className="border-b border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="rounded-full bg-blue-500 p-2">
                                    <Camera className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">Scan Barcode</h2>
                                    <p className="text-sm text-slate-600">
                                        {cameraReady ? 'Position barcode within the frame' : 'Initializing camera...'}
                                    </p>
                                </div>
                            </div>

                            {/* Switch Camera Button */}
                            {videoInputDevices.length > 1 && (
                                <button
                                    onClick={switchCamera}
                                    className="flex items-center gap-2 rounded-lg bg-white border border-blue-200 px-3 py-2 text-sm font-medium text-blue-600 shadow-sm hover:bg-blue-50 transition-colors"
                                >
                                    <RefreshCcw className="h-4 w-4" />
                                    Switch
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Video container */}
                    <div className="relative aspect-video bg-black">
                        <video
                            ref={videoRef}
                            className="h-full w-full object-cover"
                            autoPlay
                            playsInline
                            muted
                        />

                        {/* Scanning overlay */}
                        {isScanning && cameraReady && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                {/* Scan frame */}
                                <div className="relative h-48 w-64 rounded-lg border-4 border-blue-500 shadow-lg shadow-blue-500/50">
                                    {/* Corner decorations */}
                                    <div className="absolute -left-1 -top-1 h-8 w-8 border-l-4 border-t-4 border-blue-400"></div>
                                    <div className="absolute -right-1 -top-1 h-8 w-8 border-r-4 border-t-4 border-blue-400"></div>
                                    <div className="absolute -bottom-1 -left-1 h-8 w-8 border-b-4 border-l-4 border-blue-400"></div>
                                    <div className="absolute -bottom-1 -right-1 h-8 w-8 border-b-4 border-r-4 border-blue-400"></div>

                                    {/* Animated scan line */}
                                    <div className="absolute inset-x-0 top-0 h-1 animate-scan bg-gradient-to-r from-transparent via-blue-400 to-transparent"></div>
                                </div>
                            </div>
                        )}

                        {/* Error message */}
                        {error && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                                <div className="max-w-md rounded-lg bg-red-500/20 p-6 text-center">
                                    <p className="text-lg font-semibold text-red-400">{error}</p>
                                    <button
                                        onClick={handleClose}
                                        className="mt-4 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes scan {
                    0%, 100% {
                        transform: translateY(0);
                    }
                    50% {
                        transform: translateY(11rem);
                    }
                }
                .animate-scan {
                    animation: scan 2s ease-in-out infinite;
                }
            `}</style>
        </div>
    )
}
