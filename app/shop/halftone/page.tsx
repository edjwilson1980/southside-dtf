'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brush, Crop, Download, Eraser, MousePointerClick, Pipette, Scan, Trash2, Upload } from 'lucide-react'
import { CropOverlay } from '@/components/crop-overlay'
import { contentBounds, normalizeCrop, type CropRect } from '@/lib/crop-image'
import { colorFromHex, hexFromRgb } from '@/lib/color-knockout'
import { canvasToPngBlob, loadImage } from '@/lib/image-utils'
import { formatInches, type MeasuredFile } from '@/lib/measure-file'
import { DESIGN_ACCEPT, DESIGN_ACCEPT_LABEL, isAcceptedDesignFile } from '@/lib/accepted-uploads'
import { prepareEditableUpload } from '@/lib/rasterize-upload'
import {
  DEFAULT_HALFTONE,
  LPI_PRESETS,
  alphaMatte,
  grayLevels,
  minDotMicrons,
  effectiveDpi,
  processArtwork,
  scaleMask,
  selectRegion,
  unsharpBuffer,
  type DotShape,
  type HalftoneMode,
  type HalftoneSettings,
} from '@/lib/halftone'

/** Browsers cap canvas area; stay well under it. */
const MAX_EXPORT_PX = 14000
const MAX_PREVIEW_PX = 1100

type View = 'original' | 'print' | 'alpha'
/** Protection tools keep parts of the art out of the knockout. */
type Tool = 'none' | 'brush' | 'erase' | 'region'

const TOOLS: { value: Tool; label: string; icon: React.ReactNode }[] = [
  { value: 'none', label: 'Off', icon: null },
  { value: 'region', label: 'Click area', icon: <MousePointerClick size={14} /> },
  { value: 'brush', label: 'Protect', icon: <Brush size={14} /> },
  { value: 'erase', label: 'Unprotect', icon: <Eraser size={14} /> },
]

const MODES: { value: HalftoneMode; label: string }[] = [
  { value: 'halftone', label: 'Halftone only' },
  { value: 'knockout', label: 'Knockout only' },
  { value: 'both', label: 'Halftone + knockout' },
]

const VIEWS: { value: View; label: string }[] = [
  { value: 'original', label: 'Original' },
  { value: 'print', label: 'Print' },
  { value: 'alpha', label: 'Alpha' },
]

const SHAPES: { value: DotShape; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'ellipse', label: 'Elliptical' },
  { value: 'square', label: 'Square' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'line', label: 'Line' },
]

const ANGLES = [0, 15, 22.5, 45, 75]

export default function HalftonePage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)
  /** Untouched preview-scale pixels, kept for the eyedropper and region select. */
  const sourcePixelsRef = useRef<ImageData | null>(null)
  /** Protection mask at preview resolution. 255 = never knock this out. */
  const protectRef = useRef<Uint8Array | null>(null)
  const paintingRef = useRef(false)

  const [file, setFile] = useState<File | null>(null)
  const [measured, setMeasured] = useState<MeasuredFile | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState<View>('print')
  const [picking, setPicking] = useState(false)
  const [tool, setTool] = useState<Tool>('none')
  const [brushSize, setBrushSize] = useState(28)
  const [showProtection, setShowProtection] = useState(true)
  const [protectedPct, setProtectedPct] = useState(0)
  /** Bumped whenever the mask changes so the preview re-runs. */
  const [maskVersion, setMaskVersion] = useState(0)
  const [coverage, setCoverage] = useState<number | null>(null)
  const [knockedOut, setKnockedOut] = useState<number | null>(null)
  const [bgRemoved, setBgRemoved] = useState<number | null>(null)
  const [backdrop, setBackdrop] = useState<{ r: number; g: number; b: number } | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [printW, setPrintW] = useState(0)
  const [printH, setPrintH] = useState(0)
  const [lockAspect, setLockAspect] = useState(true)
  const [enhance, setEnhance] = useState(true)
  const [settings, setSettings] = useState<HalftoneSettings>(DEFAULT_HALFTONE)

  const set = useCallback(<K extends keyof HalftoneSettings>(key: K, value: HalftoneSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const screens = settings.mode !== 'knockout'
  const erases = settings.mode !== 'halftone'

  const widthIn = printW || measured?.widthIn || 0
  const heightIn = printH || measured?.heightIn || 0
  const cropW = crop?.width ?? measured?.pixelWidth ?? 0
  const cropH = crop?.height ?? measured?.pixelHeight ?? 0
  const sourceDpi = effectiveDpi(cropW, widthIn)
  const upscaleFactor = widthIn > 0 && cropW > 0 ? (widthIn * settings.dpi) / cropW : 1
  const levels = grayLevels(settings.dpi, settings.lpi)
  const minDot = minDotMicrons(settings)
  const exportW = Math.round(widthIn * settings.dpi)
  const exportH = Math.round(heightIn * settings.dpi)
  const tooBig = exportW > MAX_EXPORT_PX || exportH > MAX_EXPORT_PX

  const warnings = useMemo(() => {
    const list: string[] = []
    if (screens && levels < 100) {
      list.push(
        `Only ${levels} gray levels at ${settings.dpi} DPI and ${settings.lpi} LPI — gradients will band. Raise the render DPI to 600 or drop the LPI.`,
      )
    }
    if (screens && minDot < 90) {
      list.push(
        `Smallest dot is about ${minDot} microns. Dots that fine may not hold powder — raise the minimum dot percentage.`,
      )
    }
    if (sourceDpi > 0 && sourceDpi < 100) {
      list.push(
        `At ${formatInches(widthIn)} in wide this art only has ${sourceDpi} DPI of real detail — too soft to print. Crop tighter, print it smaller, or get a higher-resolution file.`,
      )
    } else if (sourceDpi > 0 && sourceDpi < 150) {
      list.push(
        `Only ${sourceDpi} DPI of real detail at this size. It will print soft. Upscaling past this invents pixels, it does not add detail.`,
      )
    }
    if (tooBig) {
      list.push(
        `${exportW} × ${exportH} px is past what the browser will render. Lower the DPI, or screen this design before it goes on the sheet.`,
      )
    }
    return list
  }, [screens, levels, minDot, settings.dpi, settings.lpi, tooBig, exportW, exportH, sourceDpi, widthIn])

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    }
  }, [sourceUrl])

  async function onPick(list: FileList | null) {
    const next = list?.[0]
    if (!next) return
    setError(null)
    if (!isAcceptedDesignFile(next)) {
      setError(`Upload a ${DESIGN_ACCEPT_LABEL.replace(/ · /g, ', ')} file.`)
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    try {
      const prepared = await prepareEditableUpload(next)
      setFile(prepared.editFile)
      setMeasured(prepared.measured)
      setCrop({ x: 0, y: 0, width: prepared.measured.pixelWidth, height: prepared.measured.pixelHeight })
      setPrintW(Number(prepared.measured.widthIn.toFixed(2)))
      setPrintH(Number(prepared.measured.heightIn.toFixed(2)))
      setCropMode(false)
      protectRef.current = null
      setProtectedPct(0)
      setMaskVersion((v) => v + 1)
      setSourceUrl((url) => {
        if (url) URL.revokeObjectURL(url)
        return prepared.editUrl
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  /** Screen at a preview DPI so dot density matches what the art will print at. */
  useEffect(() => {
    if (!sourceUrl || !measured) return
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const canvas = previewRef.current
      if (!canvas) return
      setBusy(true)
      try {
        const image = await loadImage(sourceUrl)
        if (cancelled) return
        const area =
          crop ?? { x: 0, y: 0, width: measured.pixelWidth, height: measured.pixelHeight }
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return

        // Crop mode shows the whole file so the box can be dragged over it.
        if (cropMode) {
          const scale = Math.min(1, MAX_PREVIEW_PX / Math.max(1, measured.pixelWidth))
          canvas.width = Math.max(1, Math.round(measured.pixelWidth * scale))
          canvas.height = Math.max(1, Math.round(measured.pixelHeight * scale))
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
          sourcePixelsRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height)
          setCoverage(null)
          setKnockedOut(null)
          return
        }

        const previewDpi = Math.min(settings.dpi, MAX_PREVIEW_PX / Math.max(0.01, widthIn))
        const w = Math.max(1, Math.round(widthIn * previewDpi))
        const h = Math.max(1, Math.round(heightIn * previewDpi))
        canvas.width = w
        canvas.height = h
        ctx.clearRect(0, 0, w, h)
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, w, h)
        let source = ctx.getImageData(0, 0, w, h)
        if (enhance && area.width > 0 && w > area.width) {
          const sharpened = unsharpBuffer({ data: source.data, width: w, height: h })
          source = new ImageData(sharpened.data, w, h)
        }
        sourcePixelsRef.current = new ImageData(new Uint8ClampedArray(source.data), w, h)
        if (!protectRef.current || protectRef.current.length !== w * h) {
          protectRef.current = new Uint8Array(w * h)
        }

        if (view === 'original') {
          if (showProtection) paintProtectionOverlay(ctx, protectRef.current, w, h)
          setCoverage(null)
          setKnockedOut(null)
          return
        }

        const { image: out, stats } = processArtwork(
          source,
          { ...settings, dpi: previewDpi },
          { protectMask: protectRef.current },
        )
        const shown = view === 'alpha' ? alphaMatte(out) : out
        ctx.putImageData(new ImageData(shown.data, shown.width, shown.height), 0, 0)
        if (showProtection && erases) paintProtectionOverlay(ctx, protectRef.current, w, h)
        if (!cancelled) {
          setCoverage(stats.coverage)
          setKnockedOut(stats.knockedOut)
          setBgRemoved(stats.backgroundRemoved)
          setBackdrop(stats.backdrop)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Preview failed.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    sourceUrl,
    measured,
    settings,
    view,
    showProtection,
    erases,
    maskVersion,
    crop,
    cropMode,
    widthIn,
    heightIn,
    enhance,
  ])

  function applyPrintWidth(value: number) {
    const next = Math.max(0.25, value)
    setPrintW(Number(next.toFixed(2)))
    if (lockAspect && cropW > 0 && cropH > 0) {
      setPrintH(Number(((next * cropH) / cropW).toFixed(2)))
    }
  }

  function applyPrintHeight(value: number) {
    const next = Math.max(0.25, value)
    setPrintH(Number(next.toFixed(2)))
    if (lockAspect && cropW > 0 && cropH > 0) {
      setPrintW(Number(((next * cropW) / cropH).toFixed(2)))
    }
  }

  /** Snap the crop to the artwork, dropping empty or flat-colour margins. */
  function fitCropToContent() {
    const pixels = sourcePixelsRef.current
    if (!pixels || !measured) return
    const bounds = contentBounds(pixels)
    if (!bounds) return
    // Preview pixels -> source pixels.
    const scale = measured.pixelWidth / pixels.width
    const next = normalizeCrop(
      {
        x: bounds.x * scale,
        y: bounds.y * scale,
        width: bounds.width * scale,
        height: bounds.height * scale,
      },
      measured.pixelWidth,
      measured.pixelHeight,
    )
    setCropAndResize(next)
  }

  function resetCrop() {
    if (!measured) return
    setCropAndResize({ x: 0, y: 0, width: measured.pixelWidth, height: measured.pixelHeight })
  }

  /** Crop changes invalidate the protect mask, and rescale the print size. */
  function setCropAndResize(next: CropRect) {
    setCrop(next)
    if (protectRef.current) {
      protectRef.current.fill(0)
      setProtectedPct(0)
    }
    if (lockAspect && printW > 0 && next.width > 0) {
      setPrintH(Number(((printW * next.height) / next.width).toFixed(2)))
    }
    setMaskVersion((v) => v + 1)
  }

  function maskStats(mask: Uint8Array) {
    let painted = 0
    for (let i = 0; i < mask.length; i += 1) if (mask[i] > 0) painted += 1
    return mask.length > 0 ? painted / mask.length : 0
  }

  /** Translate a mouse event into mask pixel coordinates. */
  function maskPoint(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = previewRef.current
    const pixels = sourcePixelsRef.current
    if (!canvas || !pixels) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * pixels.width)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * pixels.height)
    if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return null
    return { x, y, width: pixels.width, height: pixels.height }
  }

  function paintAt(event: React.MouseEvent<HTMLCanvasElement>) {
    const mask = protectRef.current
    const point = maskPoint(event)
    if (!mask || !point) return
    const value = tool === 'erase' ? 0 : 255
    const radius = Math.max(1, Math.round((brushSize / 100) * Math.max(point.width, point.height) * 0.25))
    const radiusSq = radius * radius
    for (let dy = -radius; dy <= radius; dy += 1) {
      const y = point.y + dy
      if (y < 0 || y >= point.height) continue
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = point.x + dx
        if (x < 0 || x >= point.width) continue
        if (dx * dx + dy * dy > radiusSq) continue
        mask[y * point.width + x] = value
      }
    }
    setProtectedPct(maskStats(mask))
    setMaskVersion((v) => v + 1)
  }

  /** One click shields a whole enclosed shape — an eye, the hole in an O. */
  function protectRegionAt(event: React.MouseEvent<HTMLCanvasElement>) {
    const mask = protectRef.current
    const pixels = sourcePixelsRef.current
    const point = maskPoint(event)
    if (!mask || !pixels || !point) return
    const region = selectRegion(
      { data: pixels.data, width: pixels.width, height: pixels.height },
      point.x,
      point.y,
      settings.knockoutTolerance,
    )
    for (let i = 0; i < mask.length; i += 1) if (region[i]) mask[i] = 255
    setProtectedPct(maskStats(mask))
    setMaskVersion((v) => v + 1)
  }

  function clearProtection() {
    if (!protectRef.current) return
    protectRef.current.fill(0)
    setProtectedPct(0)
    setMaskVersion((v) => v + 1)
  }

  function onCanvasDown(event: React.MouseEvent<HTMLCanvasElement>) {
    if (picking) {
      sampleColor(event)
      return
    }
    if (tool === 'region') {
      protectRegionAt(event)
      return
    }
    if (tool === 'brush' || tool === 'erase') {
      paintingRef.current = true
      paintAt(event)
    }
  }

  function onCanvasMove(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!paintingRef.current) return
    paintAt(event)
  }

  /** Eyedropper reads the untouched pixels, not whatever is currently drawn. */
  function sampleColor(event: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = previewRef.current
    const pixels = sourcePixelsRef.current
    if (!picking || !canvas || !pixels) return
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * pixels.width)
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * pixels.height)
    if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return
    const index = (y * pixels.width + x) * 4
    set('knockoutColor', {
      r: pixels.data[index],
      g: pixels.data[index + 1],
      b: pixels.data[index + 2],
    })
    setPicking(false)
  }

  async function exportPng() {
    if (!sourceUrl || !measured || !file || tooBig) return
    setBusy(true)
    setError(null)
    try {
      const image = await loadImage(sourceUrl)
      const canvas = document.createElement('canvas')
      canvas.width = exportW
      canvas.height = exportH
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('Could not open a canvas for export.')
      const area = crop ?? { x: 0, y: 0, width: measured.pixelWidth, height: measured.pixelHeight }
      ctx.clearRect(0, 0, exportW, exportH)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, exportW, exportH)
      let source = ctx.getImageData(0, 0, exportW, exportH)
      if (enhance && exportW > area.width) {
        const sharpened = unsharpBuffer({ data: source.data, width: exportW, height: exportH })
        source = new ImageData(sharpened.data, exportW, exportH)
      }
      const mask = protectRef.current
      const preview = sourcePixelsRef.current
      const exportMask =
        mask && preview ? scaleMask(mask, preview.width, preview.height, exportW, exportH) : null
      const { image: out } = processArtwork(source, settings, { protectMask: exportMask })
      ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0)

      // DPI is written into the PNG so the RIP places it at the right size.
      const blob = await canvasToPngBlob(canvas, settings.dpi)
      const base = file.name.replace(/\.[^.]+$/, '')
      const tag = settings.mode === 'both' ? 'halftone-knockout' : settings.mode
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${base}-${tag}-${settings.lpi}lpi-${settings.dpi}dpi.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="builder-shell halftone-shell">
      <nav className="shop-nav" aria-label="Shop tools">
        <a className="shop-nav-link" href="/shop">
          Shop builder
        </a>
        <a className="shop-nav-link" href="/shop/cutter-test">
          Cutter test
        </a>
        <a className="shop-nav-link" href="/shop/connect-drive">
          Connect Drive
        </a>
        <a className="shop-nav-link" href="/">
          Customer builder
        </a>
        <a className="shop-nav-link" href="/shop/halftone" aria-current="page">
          Halftone generator
        </a>
      </nav>

      <div className="builder-topbar">
        <div className="title-block">
          <h1>Halftone Generator</h1>
          <p className="lead">Screen artwork for soft-hand DTF prints.</p>
          <p className="sublead">
            Halftone turns the art into dots so less ink goes down. Knockout erases a colour you pick so the garment
            shows through. Run either on its own, or both together. Exports a transparent PNG with the DPI tagged.
          </p>
        </div>
      </div>

      <div className="halftone-grid">
        <section className="panel halftone-controls">
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept={DESIGN_ACCEPT}
            onChange={(e) => void onPick(e.target.files)}
          />
          <button
            type="button"
            className={`dropzone${dragging ? ' dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              setDragging(true)
            }}
            onDragLeave={(e) => {
              e.preventDefault()
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
              setDragging(false)
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              void onPick(e.dataTransfer.files)
            }}
          >
            <Upload size={26} />
            <strong>{file ? file.name : dragging ? 'Drop artwork to screen' : 'Drop artwork here'}</strong>
            <span>{DESIGN_ACCEPT_LABEL}</span>
            <small>or click to choose a file</small>
          </button>

          {measured && (
            <p className="halftone-meta">
              {formatInches(measured.widthIn)} × {formatInches(measured.heightIn)} in at{' '}
              {Math.round(measured.dpiX)} DPI
              {measured.dpiAssumed ? ' (assumed)' : ''}
            </p>
          )}

          {measured && crop && (
            <div className="halftone-step">
              <span className="halftone-step-title">Step 1 · Size &amp; crop</span>

              <div className="halftone-size-row">
                <label>
                  Width (in)
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={printW}
                    onChange={(e) => applyPrintWidth(Number(e.target.value) || 0)}
                  />
                </label>
                <label>
                  Height (in)
                  <input
                    type="number"
                    min="0.25"
                    step="0.25"
                    value={printH}
                    onChange={(e) => applyPrintHeight(Number(e.target.value) || 0)}
                  />
                </label>
              </div>
              <label className="halftone-check">
                <input type="checkbox" checked={lockAspect} onChange={(e) => setLockAspect(e.target.checked)} />
                Lock aspect ratio
              </label>

              <div className="halftone-segment halftone-tools">
                <button
                  type="button"
                  className={cropMode ? 'active' : ''}
                  onClick={() => {
                    setCropMode((current) => !current)
                    setTool('none')
                    setPicking(false)
                  }}
                >
                  <Crop size={14} /> {cropMode ? 'Done cropping' : 'Crop'}
                </button>
                <button type="button" onClick={fitCropToContent}>
                  <Scan size={14} /> Fit to art
                </button>
                <button type="button" onClick={resetCrop}>
                  Full frame
                </button>
              </div>

              <p className="halftone-hint">
                Crop: {Math.round(crop.width)} × {Math.round(crop.height)} px · {sourceDpi} DPI of real detail at{' '}
                {formatInches(widthIn)} in wide · exporting {exportW} × {exportH} px
                {upscaleFactor > 1.02 ? ` (${upscaleFactor.toFixed(1)}× upscale)` : ''}
              </p>

              {upscaleFactor > 1.02 && (
                <label className="halftone-check">
                  <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} />
                  Sharpen when upscaling
                </label>
              )}
            </div>
          )}

          <div className="halftone-step">
            <span className="halftone-step-title">Step 2 · Background removal</span>
            <label className="halftone-check">
              <input
                type="checkbox"
                checked={settings.removeBackground}
                onChange={(e) => set('removeBackground', e.target.checked)}
              />
              Strip the backdrop first
            </label>
            <p className="halftone-hint">
              Runs before everything else. Floods in from the edge through the backdrop colour, so only the surround
              goes — colour sealed inside the design survives. The canvas is never trimmed, so the printed size does
              not change.
            </p>
            {settings.removeBackground && (
              <>
                <label className="halftone-check">
                  <input type="checkbox" checked={settings.bgAuto} onChange={(e) => set('bgAuto', e.target.checked)} />
                  Detect the backdrop automatically
                </label>
                {settings.bgAuto ? (
                  <p className="halftone-hint">
                    {backdrop
                      ? `Found rgb(${backdrop.r}, ${backdrop.g}, ${backdrop.b}) around the edges.`
                      : 'No consistent backdrop found around the edges — nothing will be removed. Set the colour by hand below.'}
                  </p>
                ) : (
                  <div className="halftone-color-row">
                    <input
                      type="color"
                      aria-label="Backdrop colour"
                      value={hexFromRgb(settings.bgColor)}
                      onChange={(e) => set('bgColor', colorFromHex(e.target.value))}
                    />
                    <code>{hexFromRgb(settings.bgColor)}</code>
                  </div>
                )}
                <Slider
                  label="Backdrop match"
                  min={0}
                  max={60}
                  step={1}
                  value={settings.bgTolerance}
                  onChange={(v) => set('bgTolerance', v)}
                  suffix="%"
                />
                <Slider
                  label="Backdrop feather"
                  min={0}
                  max={30}
                  step={1}
                  value={settings.bgFeather}
                  onChange={(v) => set('bgFeather', v)}
                  suffix="%"
                />
              </>
            )}
          </div>

          <div className="halftone-field">
            <span className="halftone-label">Step 3 · Mode</span>
            <div className="halftone-segment halftone-segment-stack">
              {MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={settings.mode === mode.value ? 'active' : ''}
                  onClick={() => set('mode', mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {erases && (
            <div className="halftone-knockout-block">
              <div className="halftone-field">
                <span className="halftone-label">Knockout colour</span>
                <div className="halftone-color-row">
                  <input
                    type="color"
                    aria-label="Knockout colour"
                    value={hexFromRgb(settings.knockoutColor)}
                    onChange={(e) => set('knockoutColor', colorFromHex(e.target.value))}
                  />
                  <code>{hexFromRgb(settings.knockoutColor)}</code>
                  <button
                    type="button"
                    className={`upload-ghost-button${picking ? ' picking' : ''}`}
                    onClick={() => {
                      setPicking((current) => !current)
                      if (!picking) setView('original')
                    }}
                  >
                    <Pipette size={15} /> {picking ? 'Click the art…' : 'Pick from art'}
                  </button>
                </div>
              </div>
              <Slider
                label="Tolerance"
                min={0}
                max={60}
                step={1}
                value={settings.knockoutTolerance}
                onChange={(v) => set('knockoutTolerance', v)}
                suffix="%"
              />
              <Slider
                label="Edge softness"
                min={0}
                max={40}
                step={1}
                value={settings.knockoutSoftness}
                onChange={(v) => set('knockoutSoftness', v)}
                suffix="%"
              />

              <label className="halftone-check">
                <input
                  type="checkbox"
                  checked={settings.backgroundOnly}
                  onChange={(e) => set('backgroundOnly', e.target.checked)}
                />
                Background only
              </label>
              <p className="halftone-hint">
                Erases only colour connected to the outside edge, so white sealed inside the design — eyes,
                highlights, the hole in an O — survives on its own.
              </p>

              <div className="halftone-field">
                <span className="halftone-label">
                  Protect areas
                  <b>{Math.round(protectedPct * 100)}%</b>
                </span>
                <div className="halftone-segment halftone-tools">
                  {TOOLS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={tool === option.value ? 'active' : ''}
                      onClick={() => {
                        setTool(option.value)
                        if (option.value !== 'none') setPicking(false)
                      }}
                    >
                      {option.icon}
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="halftone-hint">
                <b>Click area</b> shields a whole enclosed shape in one click. <b>Protect</b> paints by hand for
                anything the flood misses. Protected pixels are left exactly as drawn — not knocked out, not screened.
              </p>

              {(tool === 'brush' || tool === 'erase') && (
                <Slider label="Brush size" min={4} max={100} step={1} value={brushSize} onChange={setBrushSize} />
              )}

              <div className="halftone-protect-actions">
                <label className="halftone-check">
                  <input
                    type="checkbox"
                    checked={showProtection}
                    onChange={(e) => setShowProtection(e.target.checked)}
                  />
                  Show protection
                </label>
                <button type="button" className="upload-ghost-button" onClick={clearProtection}>
                  <Trash2 size={14} /> Clear
                </button>
              </div>
            </div>
          )}

          {screens && (
            <>
              <div className="halftone-field">
                <span className="halftone-label">Step 4 · Screen preset</span>
                <div className="halftone-presets">
                  {Object.entries(LPI_PRESETS).map(([name, preset]) => (
                    <button
                      key={name}
                      type="button"
                      className="upload-ghost-button"
                      onClick={() => setSettings((current) => ({ ...current, ...preset }))}
                    >
                      {name === 'whiteUnderbase' ? 'White base' : name[0].toUpperCase() + name.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <Slider label="LPI (dot frequency)" min={15} max={65} step={1} value={settings.lpi} onChange={(v) => set('lpi', v)} />

              <div className="halftone-field">
                <span className="halftone-label">Screen angle</span>
                <div className="halftone-segment">
                  {ANGLES.map((angle) => (
                    <button
                      key={angle}
                      type="button"
                      className={settings.angleDeg === angle ? 'active' : ''}
                      onClick={() => set('angleDeg', angle)}
                    >
                      {angle}°
                    </button>
                  ))}
                </div>
              </div>

              <div className="halftone-field">
                <span className="halftone-label">Dot shape</span>
                <select value={settings.shape} onChange={(e) => set('shape', e.target.value as DotShape)}>
                  {SHAPES.map((shape) => (
                    <option key={shape.value} value={shape.value}>
                      {shape.label}
                    </option>
                  ))}
                </select>
              </div>

              <Slider label="Brightness" min={-100} max={100} step={1} value={settings.brightness} onChange={(v) => set('brightness', v)} />
              <Slider label="Contrast" min={-100} max={100} step={1} value={settings.contrast} onChange={(v) => set('contrast', v)} />
              <Slider label="Gamma (darkening)" min={0.2} max={3} step={0.05} value={settings.gamma} onChange={(v) => set('gamma', v)} />
              <Slider label="Min dot" min={0} max={20} step={1} value={settings.minDotPct} onChange={(v) => set('minDotPct', v)} suffix="%" />
              <Slider label="Max dot (ink limit)" min={50} max={100} step={1} value={settings.maxDotPct} onChange={(v) => set('maxDotPct', v)} suffix="%" />

              <label className="halftone-check">
                <input type="checkbox" checked={settings.preserveColor} onChange={(e) => set('preserveColor', e.target.checked)} />
                Keep original colours
              </label>
              <label className="halftone-check">
                <input type="checkbox" checked={settings.invert} onChange={(e) => set('invert', e.target.checked)} />
                Invert tone
              </label>
            </>
          )}

          <div className="halftone-field">
            <span className="halftone-label">Render DPI</span>
            <select value={settings.dpi} onChange={(e) => set('dpi', Number(e.target.value))}>
              {[300, 600, 1200].map((dpi) => (
                <option key={dpi} value={dpi}>
                  {dpi} DPI
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="build-button"
            disabled={!measured || busy || tooBig}
            onClick={() => void exportPng()}
          >
            <Download size={18} /> Export PNG
          </button>
          <button type="button" className="upload-ghost-button" onClick={() => setSettings(DEFAULT_HALFTONE)}>
            Reset settings
          </button>
        </section>

        <section className="panel halftone-preview">
          <div className="halftone-view-row">
            <div className="halftone-segment">
              {VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={view === option.value ? 'active' : ''}
                  onClick={() => setView(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <span className="halftone-view-hint">
              {view === 'original' && 'Artwork as uploaded.'}
              {view === 'print' && 'What goes on the film.'}
              {view === 'alpha' && 'Alpha channel — white is ink, black is bare film.'}
            </span>
          </div>

          <div className="halftone-stats">
            <Stat label="Gray levels" value={screens ? String(levels) : '—'} tone={screens && levels < 100 ? 'warn' : 'ok'} />
            <Stat label="Min dot" value={screens ? `${minDot} µm` : '—'} tone={screens && minDot < 90 ? 'warn' : 'ok'} />
            <Stat label="Ink coverage" value={coverage == null ? '—' : `${Math.round(coverage * 100)}%`} />
            <Stat
              label="Knocked out"
              value={!erases || knockedOut == null ? '—' : `${Math.round(knockedOut * 100)}%`}
            />
            <Stat
              label="Background"
              value={!settings.removeBackground || bgRemoved == null ? '—' : `${Math.round(bgRemoved * 100)}%`}
            />
            <Stat
              label="Art detail"
              value={sourceDpi ? `${sourceDpi} DPI` : '—'}
              tone={sourceDpi > 0 && sourceDpi < 150 ? 'warn' : 'ok'}
            />
            <Stat label="Protected" value={erases ? `${Math.round(protectedPct * 100)}%` : '—'} />
          </div>

          {warnings.map((warning) => (
            <p key={warning} className="upload-warn">
              {warning}
            </p>
          ))}
          {error && <p className="save-error">{error}</p>}

          <div className={`halftone-canvas-wrap${busy ? ' busy' : ''}${view === 'alpha' ? ' alpha-view' : ''}`}>
            {measured && cropMode && crop ? (
              <div className="halftone-crop-stage">
                <canvas ref={previewRef} className="halftone-canvas" />
                <CropOverlay
                  crop={crop}
                  imageWidth={measured.pixelWidth}
                  imageHeight={measured.pixelHeight}
                  onChange={setCropAndResize}
                />
              </div>
            ) : measured ? (
              <canvas
                ref={previewRef}
                className={`halftone-canvas${picking || tool !== 'none' ? ' picking' : ''}`}
                onMouseDown={onCanvasDown}
                onMouseMove={onCanvasMove}
                onMouseUp={() => {
                  paintingRef.current = false
                }}
                onMouseLeave={() => {
                  paintingRef.current = false
                }}
              />
            ) : (
              <div className="empty-designs">
                <span>Load artwork to see the screen.</span>
              </div>
            )}
          </div>
          <p className="sublead">
            {measured ? `Export: ${exportW} × ${exportH} px. ` : ''}
            Preview is screened at the same dots per inch of artwork as the export, so what you see is the dot density
            you will print. Always pull a film test before running a full sheet.
          </p>
        </section>
      </div>
    </main>
  )
}

/** Tint protected pixels so you can see the mask you painted. */
function paintProtectionOverlay(
  ctx: CanvasRenderingContext2D,
  mask: Uint8Array | null,
  width: number,
  height: number,
) {
  if (!mask) return
  const overlay = ctx.getImageData(0, 0, width, height)
  for (let point = 0, index = 0; point < mask.length; point += 1, index += 4) {
    if (mask[point] === 0) continue
    overlay.data[index] = Math.round(overlay.data[index] * 0.55 + 0 * 0.45)
    overlay.data[index + 1] = Math.round(overlay.data[index + 1] * 0.55 + 160 * 0.45)
    overlay.data[index + 2] = Math.round(overlay.data[index + 2] * 0.55 + 223 * 0.45)
    overlay.data[index + 3] = Math.max(overlay.data[index + 3], 90)
  }
  ctx.putImageData(overlay, 0, 0)
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  suffix = '',
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  suffix?: string
}) {
  return (
    <label className="halftone-slider">
      <span className="halftone-label">
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Stat({ label, value, tone = 'ok' }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone === 'warn' ? 'halftone-warn-text' : 'green-text'}>{value}</strong>
    </div>
  )
}
