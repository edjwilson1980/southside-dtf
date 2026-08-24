'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Crop, Droplets, Eraser, Feather, Paintbrush, RotateCcw, ScanSearch, Shrink, Sun, Undo2, WandSparkles } from 'lucide-react'
import { CropOverlay } from '@/components/crop-overlay'
import {
  applyKnockoutTolerance,
  colorFromHex,
  hexFromRgb,
  loadLiveKnockout,
  recolorKnockoutSession,
  type KnockoutSession,
  type RgbColor,
} from '@/lib/color-knockout'
import { applyBrightnessContrast } from '@/lib/adjust-image'
import { applyColorReplace, colorDistances } from '@/lib/color-replace'
import { hasEdgeRefine, refineEdges } from '@/lib/edge-refine'
import { cropImage, defaultCrop, type CropRect } from '@/lib/crop-image'
import { canvasToPngBlob, loadImageData, parsePrintWidthInches, printDpi, qualityFromDpi, readImageSize } from '@/lib/image-utils'
import { removeImageBackground } from '@/lib/remove-background'
import { upscaleImage } from '@/lib/upscale-image'

const TAN_GRAY = '#c4b8a8'

const backdropPresets = [
  { id: 'check', label: 'Checker' },
  { id: TAN_GRAY, label: 'Tan gray' },
  { id: '#ffffff', label: 'White' },
  { id: '#111111', label: 'Black' },
  { id: '#1e3a5f', label: 'Navy' },
  { id: '#cf202d', label: 'Red' },
  { id: '#6b7280', label: 'Gray' },
] as const

type InspectDesign = {
  id: number
  name: string
  size: string
  placement: string
  customWidth: string
  originalUrl: string
  previewUrl: string
}

type DesignInspectorProps = {
  design: InspectDesign
  onClose: () => void
  onApply: (previewUrl: string) => void
}

type LiveKnockout = {
  base: ImageData
  session: KnockoutSession
  sourceUrl: string
}

const zoomLevels = [
  { id: 'fit', label: 'Fit' },
  { id: '1', label: '100%' },
  { id: '2', label: '200%' },
  { id: '4', label: '400%' },
] as const

export function DesignInspector({ design, onClose, onApply }: DesignInspectorProps) {
  const imageRef = useRef<HTMLImageElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const zoomPaneRef = useRef<HTMLDivElement>(null)
  const createdUrls = useRef<string[]>([])
  const keptUrl = useRef<string | null>(null)
  const knockoutBaseUrl = useRef<string | null>(null)
  const liveRef = useRef<LiveKnockout | null>(null)
  const edgeSourceRef = useRef<ImageData | null>(null)
  const displayBufferRef = useRef<ImageData | null>(null)
  const replaceDistancesRef = useRef<Float32Array | null>(null)
  const liveReplaceRef = useRef(false)
  const prepareLive = useRef<Promise<void> | null>(null)
  const paintFrame = useRef(0)
  const liveSettings = useRef({ tolerance: 18, choke: 0, crisp: 0, smooth: 0, replaceTolerance: 18, brightness: 0, contrast: 0 })
  const zoomScaleRef = useRef(1)
  const fitZoomRef = useRef(true)
  const [workingUrl, setWorkingUrl] = useState(design.previewUrl)
  const [pixels, setPixels] = useState({ width: 0, height: 0 })
  const [fitZoom, setFitZoom] = useState(true)
  const [zoomScale, setZoomScale] = useState(1)
  const [showOriginal, setShowOriginal] = useState(false)
  const [backdrop, setBackdrop] = useState<'check' | 'color'>('color')
  const [backdropColor, setBackdropColor] = useState(TAN_GRAY)
  const [pickingMode, setPickingMode] = useState<null | 'knockout' | 'replace'>(null)
  const [knockoutColorValue, setKnockoutColorValue] = useState('#ffffff')
  const [tolerance, setTolerance] = useState(18)
  const [replaceFrom, setReplaceFrom] = useState('#cf202d')
  const [replaceTo, setReplaceTo] = useState('#00a6d6')
  const [replaceTolerance, setReplaceTolerance] = useState(18)
  const [liveReplace, setLiveReplace] = useState(false)
  const [choke, setChoke] = useState(0)
  const [crisp, setCrisp] = useState(0)
  const [smooth, setSmooth] = useState(0)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [cropping, setCropping] = useState(false)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [liveKnockout, setLiveKnockout] = useState(false)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [editHistory, setEditHistory] = useState<string[]>([])

  const printWidth = parsePrintWidthInches(design.size, design.placement, design.customWidth)
  const dpi = printDpi(pixels.width, printWidth)
  const quality = qualityFromDpi(dpi)
  const edgeActive = hasEdgeRefine({ choke, crisp, smooth })
  const toneActive = brightness !== 0 || contrast !== 0
  const displayUrl = showOriginal ? design.originalUrl : workingUrl
  const showLiveCanvas = (liveKnockout || edgeActive || liveReplace || toneActive) && !showOriginal
  const changed = workingUrl !== design.originalUrl || liveKnockout || edgeActive || liveReplace || toneActive
  const pickingColor = pickingMode !== null

  useEffect(() => {
    let active = true
    readImageSize(displayUrl).then((size) => {
      if (active) setPixels(size)
    })
    return () => {
      active = false
    }
  }, [displayUrl])

  useEffect(() => {
    const urls = createdUrls.current
    return () => {
      cancelAnimationFrame(paintFrame.current)
      for (const url of urls) {
        if (url !== keptUrl.current && url !== design.originalUrl && url !== design.previewUrl) {
          URL.revokeObjectURL(url)
        }
      }
    }
  }, [design.originalUrl, design.previewUrl])

  function rememberUrl(blob: Blob) {
    const url = URL.createObjectURL(blob)
    createdUrls.current.push(url)
    setEditHistory((history) => history.concat(workingUrl))
    setWorkingUrl(url)
    setShowOriginal(false)
    return url
  }

  function undoLastChange() {
    if (cropping || liveKnockout || edgeActive || liveReplace || toneActive) {
      clearLiveKnockout()
      setChoke(0)
      setCrisp(0)
      setSmooth(0)
      setBrightness(0)
      setContrast(0)
      setCropping(false)
      setCrop(null)
      liveSettings.current = { ...liveSettings.current, choke: 0, crisp: 0, smooth: 0, brightness: 0, contrast: 0 }
      setShowOriginal(false)
      setError('')
      return
    }
    const previous = editHistory[editHistory.length - 1]
    if (!previous) return
    setEditHistory((history) => history.slice(0, -1))
    setWorkingUrl(previous)
    setShowOriginal(false)
    setError('')
  }

  function resetImage() {
    clearLiveKnockout()
    setChoke(0)
    setCrisp(0)
    setSmooth(0)
    setBrightness(0)
    setContrast(0)
    setCropping(false)
    setCrop(null)
    setReplaceTolerance(18)
    liveSettings.current = { tolerance, choke: 0, crisp: 0, smooth: 0, replaceTolerance: 18, brightness: 0, contrast: 0 }
    setEditHistory([])
    setWorkingUrl(design.originalUrl)
    setShowOriginal(false)
    setError('')
  }

  function clearLiveKnockout() {
    cancelAnimationFrame(paintFrame.current)
    liveRef.current = null
    knockoutBaseUrl.current = null
    edgeSourceRef.current = null
    replaceDistancesRef.current = null
    liveReplaceRef.current = false
    setLiveKnockout(false)
    setLiveReplace(false)
  }

  function displayBuffer(width: number, height: number) {
    if (!displayBufferRef.current || displayBufferRef.current.width !== width || displayBufferRef.current.height !== height) {
      displayBufferRef.current = new ImageData(width, height)
    }
    return displayBufferRef.current
  }

  function paintLivePreview(
    nextTolerance = liveSettings.current.tolerance,
    nextChoke = liveSettings.current.choke,
    nextCrisp = liveSettings.current.crisp,
    nextSmooth = liveSettings.current.smooth,
    nextReplaceTolerance = liveSettings.current.replaceTolerance,
    nextBrightness = liveSettings.current.brightness,
    nextContrast = liveSettings.current.contrast,
  ) {
    const canvas = previewCanvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    if (liveRef.current) applyKnockoutTolerance(liveRef.current.session, nextTolerance)
    const source = liveRef.current?.session.pixels ?? edgeSourceRef.current
    if (!source) return

    const output = displayBuffer(source.width, source.height)
    output.data.set(source.data)
    if (liveReplaceRef.current && replaceDistancesRef.current) {
      applyColorReplace(output, replaceDistancesRef.current, colorFromHex(replaceTo), nextReplaceTolerance)
    }
    const result = nextChoke > 0 || nextCrisp > 0 || nextSmooth > 0
      ? refineEdges(output, { choke: nextChoke, crisp: nextCrisp, smooth: nextSmooth })
      : output
    applyBrightnessContrast(result, nextBrightness, nextContrast)
    context.putImageData(result, 0, 0)
  }

  function scheduleLivePaint(next: Partial<{ tolerance: number; choke: number; crisp: number; smooth: number; replaceTolerance: number; brightness: number; contrast: number }>) {
    liveSettings.current = { ...liveSettings.current, ...next }
    cancelAnimationFrame(paintFrame.current)
    paintFrame.current = requestAnimationFrame(() => {
      paintLivePreview(
        liveSettings.current.tolerance,
        liveSettings.current.choke,
        liveSettings.current.crisp,
        liveSettings.current.smooth,
        liveSettings.current.replaceTolerance,
        liveSettings.current.brightness,
        liveSettings.current.contrast,
      )
    })
  }

  function replaceSourcePixels() {
    return liveRef.current?.base ?? edgeSourceRef.current
  }

  function rebuildReplaceDistances(fromColor = replaceFrom) {
    const source = replaceSourcePixels()
    if (!source) return
    replaceDistancesRef.current = colorDistances(source, colorFromHex(fromColor))
  }

  async function ensureEdgeSource() {
    const canvas = previewCanvasRef.current
    if (!canvas || liveRef.current || edgeSourceRef.current) return
    const loaded = await loadImageData(workingUrl)
    edgeSourceRef.current = loaded.pixels
    canvas.width = loaded.width
    canvas.height = loaded.height
    setPixels({ width: loaded.width, height: loaded.height })
  }

  async function ensureLiveKnockout(nextColor = knockoutColorValue, nextTolerance = tolerance) {
    const sourceUrl = knockoutBaseUrl.current ?? workingUrl
    knockoutBaseUrl.current = sourceUrl
    const color = colorFromHex(nextColor)
    const canvas = previewCanvasRef.current
    if (!canvas) return

    if (!liveRef.current || liveRef.current.sourceUrl !== sourceUrl) {
      if (!prepareLive.current) {
        prepareLive.current = loadLiveKnockout(sourceUrl, color)
          .then((loaded) => {
            liveRef.current = { base: loaded.base, session: loaded.session, sourceUrl }
            canvas.width = loaded.width
            canvas.height = loaded.height
            setPixels({ width: loaded.width, height: loaded.height })
          })
          .finally(() => {
            prepareLive.current = null
          })
      }
      await prepareLive.current
    }

    if (liveRef.current) {
      liveRef.current.session = recolorKnockoutSession(liveRef.current.base, color)
    }

    liveSettings.current.tolerance = nextTolerance
    if (liveReplace) rebuildReplaceDistances()
    paintLivePreview(nextTolerance, choke, crisp, smooth, replaceTolerance, brightness, contrast)
    setShowOriginal(false)
    setLiveKnockout(true)
  }

  async function updateKnockoutColor(nextColor: string) {
    setKnockoutColorValue(nextColor)
    setError('')
    try {
      await ensureLiveKnockout(nextColor, tolerance)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview color knockout.')
    }
  }

  async function updateTolerance(nextTolerance: number) {
    setTolerance(nextTolerance)
    setError('')
    try {
      if (!liveRef.current) await ensureLiveKnockout(knockoutColorValue, nextTolerance)
      else scheduleLivePaint({ tolerance: nextTolerance })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview color knockout.')
    }
  }

  async function updateReplace(nextFrom: string, nextTo: string, nextTolerance: number) {
    setReplaceFrom(nextFrom)
    setReplaceTo(nextTo)
    setReplaceTolerance(nextTolerance)
    liveSettings.current.replaceTolerance = nextTolerance
    setError('')
    try {
      await ensureEdgeSource()
      rebuildReplaceDistances(nextFrom)
      liveReplaceRef.current = true
      setLiveReplace(true)
      setShowOriginal(false)
      scheduleLivePaint({ replaceTolerance: nextTolerance })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview color replacement.')
    }
  }

  async function updateTone(nextBrightness: number, nextContrast: number) {
    setBrightness(nextBrightness)
    setContrast(nextContrast)
    liveSettings.current = { ...liveSettings.current, brightness: nextBrightness, contrast: nextContrast }
    setError('')
    try {
      await ensureEdgeSource()
      if (!liveRef.current && !edgeSourceRef.current) return
      setShowOriginal(false)
      scheduleLivePaint({ brightness: nextBrightness, contrast: nextContrast })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview brightness and contrast.')
    }
  }

  async function updateEdge(nextChoke: number, nextCrisp: number, nextSmooth: number) {
    setChoke(nextChoke)
    setCrisp(nextCrisp)
    setSmooth(nextSmooth)
    liveSettings.current = { ...liveSettings.current, choke: nextChoke, crisp: nextCrisp, smooth: nextSmooth }
    setError('')
    try {
      await ensureEdgeSource()
      if (!liveRef.current && !edgeSourceRef.current) return
      scheduleLivePaint({ choke: nextChoke, crisp: nextCrisp, smooth: nextSmooth })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not preview edge refinement.')
    }
  }

  function startCrop() {
    if (!pixels.width || !pixels.height) return
    setCrop(defaultCrop(pixels.width, pixels.height))
    setCropping(true)
  }

  async function applyCurrentCrop() {
    if (!crop) return
    setError('')
    setBusy('Cropping image')
    try {
      const sourceUrl = liveKnockout || edgeActive || liveReplace || toneActive ? await commitLiveKnockout() : workingUrl
      clearLiveKnockout()
      setChoke(0)
      setCrisp(0)
      setSmooth(0)
      liveSettings.current = { ...liveSettings.current, choke: 0, crisp: 0, smooth: 0 }
      rememberUrl(await cropImage(sourceUrl, crop))
      setCropping(false)
      setCrop(null)
      applyFit()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not crop the image.')
    } finally {
      setBusy('')
    }
  }

  async function commitLiveKnockout() {
    const canvas = previewCanvasRef.current
    if ((!liveKnockout && !edgeActive && !liveReplace && !toneActive) || !canvas) return workingUrl
    const url = rememberUrl(await canvasToPngBlob(canvas))
    setBrightness(0)
    setContrast(0)
    liveSettings.current = { ...liveSettings.current, brightness: 0, contrast: 0 }
    return url
  }

  async function runTool(label: string, work: (sourceUrl: string) => Promise<Blob>) {
    setError('')
    setBusy(label)
    setProgress(0)
    try {
      const sourceUrl = liveKnockout || edgeActive || liveReplace || toneActive ? await commitLiveKnockout() : workingUrl
      clearLiveKnockout()
      rememberUrl(await work(sourceUrl))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not upscale this design.')
    } finally {
      setBusy('')
      setProgress(0)
    }
  }

  function pickColorFromImage(event: React.MouseEvent<HTMLElement>) {
    if (!pickingMode) return

    const live = liveRef.current
    const image = imageRef.current
    const target = event.currentTarget
    const bounds = target.getBoundingClientRect()
    const width = live?.base.width ?? image?.naturalWidth ?? pixels.width
    const height = live?.base.height ?? image?.naturalHeight ?? pixels.height
    if (!width || !height) return

    const x = Math.min(width - 1, Math.max(0, Math.round((event.clientX - bounds.left) * (width / bounds.width))))
    const y = Math.min(height - 1, Math.max(0, Math.round((event.clientY - bounds.top) * (height / bounds.height))))

    let color: RgbColor
    if (live) {
      const index = (y * width + x) * 4
      color = { r: live.base.data[index], g: live.base.data[index + 1], b: live.base.data[index + 2] }
    } else if (edgeSourceRef.current) {
      const index = (y * width + x) * 4
      color = { r: edgeSourceRef.current.data[index], g: edgeSourceRef.current.data[index + 1], b: edgeSourceRef.current.data[index + 2] }
    } else if (image) {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.drawImage(image, 0, 0)
      const [r, g, b] = context.getImageData(x, y, 1, 1).data
      color = { r, g, b }
    } else {
      return
    }

    const hex = hexFromRgb(color)
    const mode = pickingMode
    setPickingMode(null)
    if (mode === 'replace') void updateReplace(hex, replaceTo, replaceTolerance)
    else void updateKnockoutColor(hex)
  }

  function currentDisplayScale() {
    if (!fitZoomRef.current) return zoomScaleRef.current
    const node = (showLiveCanvas ? previewCanvasRef.current : imageRef.current)
    if (!node || !pixels.width) return 1
    return node.clientWidth / pixels.width
  }

  function applyZoom(nextScale: number, origin?: { x: number; y: number; left: number; top: number }) {
    const pane = zoomPaneRef.current
    const current = Math.max(0.01, currentDisplayScale())
    const clamped = Math.max(0.01, Math.min(8, nextScale))
    zoomScaleRef.current = clamped
    fitZoomRef.current = false
    setFitZoom(false)
    setZoomScale(clamped)
    requestAnimationFrame(() => {
      if (!pane) return
      if (origin) {
        const ratio = clamped / current
        pane.scrollLeft = origin.x * ratio - origin.left
        pane.scrollTop = origin.y * ratio - origin.top
        return
      }
      pane.scrollLeft = 0
      pane.scrollTop = 0
    })
  }

  function applyFit() {
    const pane = zoomPaneRef.current
    fitZoomRef.current = true
    setFitZoom(true)
    if (pane) {
      pane.scrollLeft = 0
      pane.scrollTop = 0
    }
  }

  useEffect(() => {
    const pane = zoomPaneRef.current
    if (!pane) return

    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = pane.getBoundingClientRect()
      const current = currentDisplayScale()
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12
      applyZoom(current * factor, {
        x: event.clientX - rect.left + pane.scrollLeft,
        y: event.clientY - rect.top + pane.scrollTop,
        left: event.clientX - rect.left,
        top: event.clientY - rect.top,
      })
    }

    pane.addEventListener('wheel', onWheel, { passive: false })
    return () => pane.removeEventListener('wheel', onWheel)
  }, [pixels.width, showLiveCanvas])

  const zoomStyle = !fitZoom && pixels.width > 0 && pixels.height > 0
    ? {
        width: `${Math.max(1, Math.round(pixels.width * zoomScale))}px`,
        height: `${Math.max(1, Math.round(pixels.height * zoomScale))}px`,
        imageRendering: zoomScale > 1.01 ? 'pixelated' : 'auto',
      } as React.CSSProperties
    : pixels.width > 0 && pixels.height > 0
      ? { aspectRatio: `${pixels.width} / ${pixels.height}` } as React.CSSProperties
      : undefined

  return (
    <div
      className="size-popup-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section className="inspect-popup" role="dialog" aria-modal="true" aria-labelledby="inspect-title">
        <div className="inspect-head">
          <div>
            <span className="eyebrow">Inspect design</span>
            <h2 id="inspect-title">Check quality, then upscale</h2>
            <p>Click the artwork to blow it up. Use the tools only if the print needs cleanup.</p>
          </div>
          <button className="size-popup-close" aria-label="Close design inspector" onClick={onClose} disabled={Boolean(busy)}>
            ×
          </button>
        </div>

        <div className="inspect-primary-actions">
          <button
            type="button"
            className="inspect-tool"
            disabled={Boolean(busy)}
            onClick={() => runTool('Removing background', async (sourceUrl) => {
              const source = await fetch(sourceUrl).then((response) => response.blob())
              return removeImageBackground(source, (update) => {
                setBusy(update.label)
                setProgress(update.percent)
              })
            })}
          >
            <span className="primary-icon primary-icon-blue"><Eraser size={18} /></span>
            <span>
              <strong>Background removal</strong>
              <small>Clear the backdrop, keep the design</small>
            </span>
          </button>
          <button
            type="button"
            className={`inspect-tool ${cropping ? 'armed' : ''}`}
            disabled={Boolean(busy) || pixels.width === 0}
            onClick={() => cropping ? setCropping(false) : startCrop()}
          >
            <span className="primary-icon primary-icon-red"><Crop size={18} /></span>
            <span>
              <strong>Crop image</strong>
              <small>{cropping ? 'Drag the box on the artwork' : 'Trim extra space around the design'}</small>
            </span>
          </button>
          <button
            type="button"
            className="inspect-tool"
            disabled={Boolean(busy)}
            onClick={() => runTool('Upscaling image', (sourceUrl) => upscaleImage(sourceUrl))}
          >
            <span className="primary-icon primary-icon-green"><WandSparkles size={18} /></span>
            <span>
              <strong>Upscale image</strong>
              <small>Sharpen for print</small>
            </span>
          </button>
          {cropping && (
            <div className="inspect-crop-actions">
              <button type="button" className="knockout-apply" disabled={Boolean(busy) || !crop} onClick={() => { void applyCurrentCrop() }}>
                Apply crop
              </button>
              <button type="button" className="knockout-white" onClick={() => { setCropping(false); setCrop(null) }}>
                Cancel crop
              </button>
            </div>
          )}
        </div>

        <div className="inspect-edit-actions">
          <button
            type="button"
            className="bg-keep inspect-undo"
            disabled={Boolean(busy) || (!changed && !cropping && editHistory.length === 0)}
            onClick={undoLastChange}
          >
            <Undo2 size={15} />
            Undo last change
          </button>
          <button
            type="button"
            className="bg-keep inspect-reset"
            disabled={Boolean(busy) || !changed || showOriginal}
            onClick={resetImage}
          >
            <RotateCcw size={15} />
            Reset image
          </button>
          <button
            type="button"
            className="bg-use"
            disabled={Boolean(busy)}
            onClick={async () => {
              const url = await commitLiveKnockout()
              keptUrl.current = url
              onApply(url)
            }}
          >
            <Check size={16} />
            Use this version
          </button>
        </div>

        <div className="inspect-grid">
          <div className="inspect-stage">
            <div className="inspect-toolbar">
              <strong>{design.name}</strong>
              <div className="inspect-zooms">
                <button
                  type="button"
                  className={fitZoom ? 'selected' : ''}
                  onClick={applyFit}
                >
                  Fit
                </button>
                {zoomLevels.filter((level) => level.id !== 'fit').map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    className={!fitZoom && Math.abs(zoomScale - Number(level.id)) < 0.05 ? 'selected' : ''}
                    onClick={() => applyZoom(Number(level.id))}
                  >
                    {level.label}
                  </button>
                ))}
                <span className="zoom-readout">{fitZoom ? 'Fit' : `${Math.round(zoomScale * 100)}%`}</span>
              </div>
            </div>

            <div className="inspect-stage-view">
              <div
                ref={zoomPaneRef}
                className={`inspect-frame ${fitZoom ? 'zoom-fit' : 'zoom-manual'} ${backdrop === 'check' ? 'on-check' : ''} ${pickingColor ? 'picking' : ''}`}
                style={backdrop === 'color' ? { background: backdropColor } : undefined}
              >
                <div className="inspect-zoom-inner">
                  <div className="inspect-media" style={zoomStyle}>
                    <img
                      ref={imageRef}
                      src={displayUrl}
                      alt={`${design.name} enlarged for quality review`}
                      className={fitZoom ? 'fit' : 'actual'}
                      style={{ display: showLiveCanvas ? 'none' : undefined }}
                      onClick={pickColorFromImage}
                    />
                    <canvas
                      ref={previewCanvasRef}
                      className={fitZoom ? 'fit' : 'actual'}
                      style={{ display: showLiveCanvas ? 'block' : 'none' }}
                      onClick={pickColorFromImage}
                    />
                    {cropping && crop && pixels.width > 0 && pixels.height > 0 && (
                      <CropOverlay crop={crop} imageWidth={pixels.width} imageHeight={pixels.height} onChange={setCrop} />
                    )}
                  </div>
                </div>
              </div>
              {busy && (
                <div className="inspect-busy">
                  <span>{busy}{progress ? ` ${progress}%` : ''}</span>
                </div>
              )}
              {showOriginal && (
                <div className="inspect-original-banner">
                  <strong>Viewing the original</strong>
                  <span>Your edited version is still here.</span>
                  <button type="button" onClick={() => setShowOriginal(false)}>
                    Show edited version
                  </button>
                </div>
              )}
            </div>

            <div className="inspect-quality">
              <div className="inspect-quality-copy">
                <span className={`quality-pill ${quality.tone}`}>
                  <ScanSearch size={14} />
                  {pixels.width ? `${pixels.width} × ${pixels.height} px` : 'Reading pixels…'}
                  {dpi > 0 ? ` · ${dpi} DPI at ${printWidth} in` : ''}
                  {` · ${quality.label}`}
                </span>
              </div>
              <div className="inspect-view-toggles">
                {backdropPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={(preset.id === 'check' ? backdrop === 'check' : backdrop === 'color' && backdropColor === preset.id) ? 'selected' : ''}
                    onClick={() => {
                      if (preset.id === 'check') setBackdrop('check')
                      else {
                        setBackdrop('color')
                        setBackdropColor(preset.id)
                      }
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
                <label className={`backdrop-picker ${backdrop === 'color' && !backdropPresets.some((preset) => preset.id === backdropColor) ? 'selected' : ''}`}>
                  <span>Pick</span>
                  <input
                    type="color"
                    value={backdrop === 'color' ? backdropColor : TAN_GRAY}
                    aria-label="Pick a preview background color"
                    onChange={(event) => {
                      setBackdrop('color')
                      setBackdropColor(event.target.value)
                    }}
                  />
                </label>
                {changed && (
                  <button
                    type="button"
                    className={showOriginal ? 'selected showing-original' : ''}
                    onClick={() => setShowOriginal((value) => !value)}
                  >
                    {showOriginal ? 'Show edited version' : 'Show original'}
                  </button>
                )}
              </div>
            </div>
            {pickingMode === 'knockout' && <p className="inspect-hint">Click the blown-up design to pick the color to knock out.</p>}
            {pickingMode === 'replace' && <p className="inspect-hint">Click the blown-up design to pick the color to replace.</p>}
            {!pickingMode && <p className="inspect-hint">Scroll the mouse wheel on the art to zoom in and check edges or small details.</p>}
            {liveKnockout && !pickingMode && <p className="inspect-hint">Tolerance is live. Slide it to add or take back knocked-out color.</p>}
            {liveReplace && !pickingMode && <p className="inspect-hint">Color replacement is live. Slide tolerance to cover more or less of the matched color.</p>}
            {edgeActive && !pickingMode && <p className="inspect-hint">Put the art on black to check for a white edge halo, then choke, crisp, or smooth the edge.</p>}
            {cropping && <p className="inspect-hint">Drag the box to crop. Use the corners and sides to resize, then apply the crop.</p>}
            {error && <p className="inspect-error">{error}</p>}
          </div>

          <aside className="inspect-tools">
            <h3>Fine-tune</h3>
            <p>Adjust color and edges after the main cleanup.</p>

            <div className="inspect-knockout">
              <div className="inspect-tool static-tool">
                <Sun size={18} />
                <span>
                  <strong>Brightness &amp; contrast</strong>
                  <small>Lighten, darken, or punch up the art</small>
                </span>
              </div>
              <div className="knockout-controls">
                <label className="tolerance-field">
                  Brightness {brightness > 0 ? `+${brightness}` : brightness}
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={brightness}
                    onInput={(event) => { void updateTone(Number((event.target as HTMLInputElement).value), contrast) }}
                    onChange={(event) => { void updateTone(Number(event.target.value), contrast) }}
                  />
                </label>
                <label className="tolerance-field">
                  Contrast {contrast > 0 ? `+${contrast}` : contrast}
                  <input
                    type="range"
                    min="-50"
                    max="50"
                    step="1"
                    value={contrast}
                    onInput={(event) => { void updateTone(brightness, Number((event.target as HTMLInputElement).value)) }}
                    onChange={(event) => { void updateTone(brightness, Number(event.target.value)) }}
                  />
                </label>
              </div>
            </div>

            <div className="inspect-knockout">
              <button
                type="button"
                className={`inspect-tool ${pickingMode === 'knockout' ? 'armed' : ''}`}
                disabled={Boolean(busy)}
                onClick={() => setPickingMode((value) => value === 'knockout' ? null : 'knockout')}
              >
                <Droplets size={18} />
                <span>
                  <strong>Color knockout</strong>
                  <small>{pickingMode === 'knockout' ? 'Click the design to sample' : 'Slide tolerance to preview live'}</small>
                </span>
              </button>
              <div className="knockout-controls">
                <label>
                  Color
                  <input
                    type="color"
                    value={knockoutColorValue}
                    onChange={(event) => { void updateKnockoutColor(event.target.value) }}
                  />
                </label>
                <button type="button" className="knockout-white" onClick={() => { void updateKnockoutColor('#ffffff') }}>White</button>
                <label className="tolerance-field">
                  Tolerance {tolerance}
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={tolerance}
                    onInput={(event) => { void updateTolerance(Number((event.target as HTMLInputElement).value)) }}
                    onChange={(event) => { void updateTolerance(Number(event.target.value)) }}
                  />
                </label>
                <button
                  type="button"
                  className="knockout-apply"
                  disabled={Boolean(busy) || !liveKnockout}
                  onClick={() => { void commitLiveKnockout() }}
                >
                  Keep this knockout
                </button>
              </div>
            </div>

            <div className="inspect-knockout">
              <button
                type="button"
                className={`inspect-tool ${pickingMode === 'replace' ? 'armed' : ''}`}
                disabled={Boolean(busy)}
                onClick={() => setPickingMode((value) => value === 'replace' ? null : 'replace')}
              >
                <Paintbrush size={18} />
                <span>
                  <strong>Color replacement</strong>
                  <small>{pickingMode === 'replace' ? 'Click the design to sample' : 'Swap a color for another'}</small>
                </span>
              </button>
              <div className="knockout-controls">
                <label>
                  From
                  <input
                    type="color"
                    value={replaceFrom}
                    onChange={(event) => { void updateReplace(event.target.value, replaceTo, replaceTolerance) }}
                  />
                </label>
                <label>
                  To
                  <input
                    type="color"
                    value={replaceTo}
                    onChange={(event) => { void updateReplace(replaceFrom, event.target.value, replaceTolerance) }}
                  />
                </label>
                <label className="tolerance-field">
                  Tolerance {replaceTolerance}
                  <input
                    type="range"
                    min="0"
                    max="80"
                    value={replaceTolerance}
                    onInput={(event) => { void updateReplace(replaceFrom, replaceTo, Number((event.target as HTMLInputElement).value)) }}
                    onChange={(event) => { void updateReplace(replaceFrom, replaceTo, Number(event.target.value)) }}
                  />
                </label>
              </div>
            </div>

            <div className="inspect-knockout">
              <div className="inspect-tool static-tool">
                <Shrink size={18} />
                <span>
                  <strong>Edge refinement</strong>
                  <small>Choke and harden edges so white ink does not print a halo</small>
                </span>
              </div>
              <div className="knockout-controls">
                <label className="tolerance-field">
                  Choke {choke}px
                  <input
                    type="range"
                    min="0"
                    max="4"
                    step="1"
                    value={choke}
                    onInput={(event) => { void updateEdge(Number((event.target as HTMLInputElement).value), crisp, smooth) }}
                    onChange={(event) => { void updateEdge(Number(event.target.value), crisp, smooth) }}
                  />
                </label>
                <label className="tolerance-field">
                  Crisp {crisp}
                  <input
                    type="range"
                    min="0"
                    max="70"
                    value={crisp}
                    onInput={(event) => { void updateEdge(choke, Number((event.target as HTMLInputElement).value), smooth) }}
                    onChange={(event) => { void updateEdge(choke, Number(event.target.value), smooth) }}
                  />
                </label>
              </div>
            </div>

            <div className="inspect-knockout">
              <div className="inspect-tool static-tool">
                <Feather size={18} />
                <span>
                  <strong>Smooth edge</strong>
                  <small>Feather a hard cut so the print edge is not jagged</small>
                </span>
              </div>
              <div className="knockout-controls">
                <label className="tolerance-field">
                  Smooth {smooth}px
                  <input
                    type="range"
                    min="0"
                    max="12"
                    step="1"
                    value={smooth}
                    onInput={(event) => { void updateEdge(choke, crisp, Number((event.target as HTMLInputElement).value)) }}
                    onChange={(event) => { void updateEdge(choke, crisp, Number(event.target.value)) }}
                  />
                </label>
              </div>
            </div>

          </aside>
        </div>
      </section>
    </div>
  )
}
