'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { canvasToPngBlob, loadImage } from '@/lib/image-utils'
import { formatInches, measureUploadFile, type MeasuredFile } from '@/lib/measure-file'
import {
  DEFAULT_HALFTONE,
  KNOCKOUT_BG_PRESETS,
  LPI_PRESETS,
  grayLevels,
  halfToneImage,
  hexToRgb,
  minDotMicrons,
  rgbToHex,
  type DotShape,
  type HalftoneMode,
  type HalftoneSettings,
} from '@/lib/halftone'

/** Browsers cap canvas area; stay well under it. */
const MAX_EXPORT_PX = 14000
const MAX_PREVIEW_PX = 1100

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

  const [file, setFile] = useState<File | null>(null)
  const [measured, setMeasured] = useState<MeasuredFile | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [coverage, setCoverage] = useState<number | null>(null)
  const [settings, setSettings] = useState<HalftoneSettings>(DEFAULT_HALFTONE)

  const set = useCallback(<K extends keyof HalftoneSettings>(key: K, value: HalftoneSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const widthIn = measured?.widthIn ?? 0
  const heightIn = measured?.heightIn ?? 0
  const levels = grayLevels(settings.dpi, settings.lpi)
  const minDot = minDotMicrons(settings)
  const exportW = Math.round(widthIn * settings.dpi)
  const exportH = Math.round(heightIn * settings.dpi)
  const tooBig = exportW > MAX_EXPORT_PX || exportH > MAX_EXPORT_PX

  const warnings = useMemo(() => {
    const list: string[] = []
    if (levels < 100) {
      list.push(
        `Only ${levels} gray levels at ${settings.dpi} DPI and ${settings.lpi} LPI — gradients will band. Raise the render DPI to 600 or drop the LPI.`,
      )
    }
    if (minDot < 90) {
      list.push(
        `Smallest dot is about ${minDot} microns. Dots that fine may not hold powder — raise the minimum dot percentage.`,
      )
    }
    if (tooBig) {
      list.push(
        `${exportW} × ${exportH} px is past what the browser will render. Lower the DPI, or half-tone this design before it goes on the sheet.`,
      )
    }
    return list
  }, [levels, minDot, settings.dpi, settings.lpi, tooBig, exportW, exportH])

  useEffect(() => {
    return () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    }
  }, [sourceUrl])

  async function onPick(list: FileList | null) {
    const next = list?.[0]
    if (!next) return
    setError(null)
    try {
      const info = await measureUploadFile(next)
      if (info.kind === 'pdf') {
        setError('PDFs cannot be screened here. Export the art as a transparent PNG or TIFF first.')
        return
      }
      setFile(next)
      setMeasured(info)
      setSourceUrl((url) => {
        if (url) URL.revokeObjectURL(url)
        return URL.createObjectURL(next)
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
        const previewDpi = Math.min(settings.dpi, MAX_PREVIEW_PX / Math.max(0.01, measured.widthIn))
        const w = Math.max(1, Math.round(measured.widthIn * previewDpi))
        const h = Math.max(1, Math.round(measured.heightIn * previewDpi))
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) return
        ctx.clearRect(0, 0, w, h)
        ctx.drawImage(image, 0, 0, w, h)
        const source = ctx.getImageData(0, 0, w, h)
        const { image: out, stats } = halfToneImage(
          { data: source.data, width: source.width, height: source.height },
          { ...settings, dpi: previewDpi },
        )
        ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
        if (!cancelled) setCoverage(stats.coverage)
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
  }, [sourceUrl, measured, settings])

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
      ctx.clearRect(0, 0, exportW, exportH)
      ctx.drawImage(image, 0, 0, exportW, exportH)
      const source = ctx.getImageData(0, 0, exportW, exportH)
      const { image: out } = halfToneImage(
        { data: source.data, width: source.width, height: source.height },
        settings,
      )
      ctx.putImageData(new ImageData(out.data, out.width, out.height), 0, 0)

      // DPI is written into the PNG so the RIP places it at the right size.
      const blob = await canvasToPngBlob(canvas, settings.dpi)
      const base = file.name.replace(/\.[^.]+$/, '')
      const tag = settings.mode === 'knockout' ? 'knockout' : 'halftone'
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
            Halftone turns the art into dots so less ink goes down. Knockout punches the dot pattern out of solid art
            so the garment shows through. Exports a transparent PNG with the DPI tagged.
          </p>
        </div>
      </div>

      <div className="halftone-grid">
        <section className="panel halftone-controls">
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/png,image/tiff,image/tif,.png,.tif,.tiff"
            onChange={(e) => void onPick(e.target.files)}
          />
          <button type="button" className="dropzone" onClick={() => inputRef.current?.click()}>
            <Upload size={26} />
            <strong>{file ? file.name : 'Choose artwork'}</strong>
            <span>Transparent PNG or TIFF</span>
          </button>

          {measured && (
            <p className="halftone-meta">
              {formatInches(measured.widthIn)} × {formatInches(measured.heightIn)} in at {Math.round(measured.dpiX)} DPI
              {measured.dpiAssumed ? ' (assumed)' : ''}
            </p>
          )}

          <div className="halftone-field">
            <span className="halftone-label">Mode</span>
            <div className="halftone-segment">
              {(['halftone', 'knockout'] as HalftoneMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={settings.mode === mode ? 'active' : ''}
                  onClick={() => set('mode', mode)}
                >
                  {mode === 'halftone' ? 'Halftone' : 'Knockout'}
                </button>
              ))}
            </div>
          </div>

          <div className="halftone-field">
            <span className="halftone-label">Preset</span>
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

          {settings.mode === 'knockout' && (
            <>
              <label className="halftone-check">
                <input
                  type="checkbox"
                  checked={settings.useImageTone}
                  onChange={(e) => set('useImageTone', e.target.checked)}
                />
                Follow the artwork&apos;s tone
              </label>
              {!settings.useImageTone && (
                <Slider
                  label="Knockout amount"
                  min={5}
                  max={95}
                  step={1}
                  value={settings.knockoutAmountPct}
                  onChange={(v) => set('knockoutAmountPct', v)}
                  suffix="%"
                />
              )}
              <div className="halftone-field">
                <span className="halftone-label">
                  Background colour
                  <b>{rgbToHex(settings.knockoutBgColor)}</b>
                </span>
                <p className="halftone-hint">
                  Shirt colour shown through the punched holes in the preview. Export stays transparent for film.
                </p>
                <div className="halftone-swatches" role="listbox" aria-label="Knockout background presets">
                  {KNOCKOUT_BG_PRESETS.map((preset) => {
                    const active =
                      preset.color.r === settings.knockoutBgColor.r &&
                      preset.color.g === settings.knockoutBgColor.g &&
                      preset.color.b === settings.knockoutBgColor.b
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        role="option"
                        aria-selected={active}
                        title={preset.name}
                        className={`halftone-swatch${active ? ' active' : ''}`}
                        style={{ background: rgbToHex(preset.color) }}
                        onClick={() => set('knockoutBgColor', { ...preset.color })}
                      >
                        <span className="sr-only">{preset.name}</span>
                      </button>
                    )
                  })}
                  <label className="halftone-color-picker" title="Custom background colour">
                    <span className="sr-only">Custom background colour</span>
                    <input
                      type="color"
                      value={rgbToHex(settings.knockoutBgColor)}
                      onChange={(e) => {
                        const next = hexToRgb(e.target.value)
                        if (next) set('knockoutBgColor', next)
                      }}
                    />
                  </label>
                </div>
              </div>
            </>
          )}

          <Slider label="Brightness" min={-100} max={100} step={1} value={settings.brightness} onChange={(v) => set('brightness', v)} />
          <Slider label="Contrast" min={-100} max={100} step={1} value={settings.contrast} onChange={(v) => set('contrast', v)} />
          <Slider label="Gamma (darkening)" min={0.2} max={3} step={0.05} value={settings.gamma} onChange={(v) => set('gamma', v)} />
          <Slider label="Min dot" min={0} max={20} step={1} value={settings.minDotPct} onChange={(v) => set('minDotPct', v)} suffix="%" />
          <Slider
            label="Max dot (ink limit)"
            min={50}
            max={100}
            step={1}
            value={settings.maxDotPct}
            onChange={(v) => set('maxDotPct', v)}
            suffix="%"
          />

          <label className="halftone-check">
            <input
              type="checkbox"
              checked={settings.preserveColor}
              onChange={(e) => set('preserveColor', e.target.checked)}
            />
            Keep original colours
          </label>
          <label className="halftone-check">
            <input type="checkbox" checked={settings.invert} onChange={(e) => set('invert', e.target.checked)} />
            Invert tone
          </label>

          <button type="button" className="build-button" disabled={!measured || busy || tooBig} onClick={() => void exportPng()}>
            <Download size={18} /> Export PNG
          </button>
          <button type="button" className="upload-ghost-button" onClick={() => setSettings(DEFAULT_HALFTONE)}>
            Reset settings
          </button>
        </section>

        <section className="panel halftone-preview">
          <div className="halftone-stats">
            <Stat label="Gray levels" value={String(levels)} tone={levels < 100 ? 'warn' : 'ok'} />
            <Stat label="Min dot" value={`${minDot} µm`} tone={minDot < 90 ? 'warn' : 'ok'} />
            <Stat label="Ink coverage" value={coverage == null ? '—' : `${Math.round(coverage * 100)}%`} />
            <Stat label="Export size" value={measured ? `${exportW} × ${exportH} px` : '—'} tone={tooBig ? 'warn' : 'ok'} />
          </div>

          {warnings.map((warning) => (
            <p key={warning} className="upload-warn">
              {warning}
            </p>
          ))}
          {error && <p className="save-error">{error}</p>}

          <div
            className={`halftone-canvas-wrap${busy ? ' busy' : ''}${settings.mode === 'knockout' ? ' knockout-bg' : ''}`}
            style={
              settings.mode === 'knockout'
                ? {
                    background: rgbToHex(settings.knockoutBgColor),
                    backgroundImage: 'none',
                  }
                : undefined
            }
          >
            {measured ? (
              <canvas ref={previewRef} className="halftone-canvas" />
            ) : (
              <div className="halftone-empty">
                <span>Load artwork to see the screen.</span>
              </div>
            )}
          </div>
          <p className="sublead">
            Preview is screened at the same dots per inch of artwork as the export, so what you see is the dot density
            you will print. Always pull a film test before running a full sheet.
          </p>
        </section>
      </div>
    </main>
  )
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
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
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
