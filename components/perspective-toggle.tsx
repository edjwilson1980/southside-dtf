'use client'

/** Perspective stays on unless the customer turns it off to stretch the image. */
export function PerspectiveToggle({ checked, onChange, name }: {
  checked: boolean
  onChange: (on: boolean) => void
  name: string
}) {
  return (
    <label
      className="perspective-toggle"
      title="On: the image keeps its shape. Off: it stretches to the width and height, so it can be taller than it is wide."
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={`Perspective for ${name}`}
        onChange={(event) => onChange(event.target.checked)}
      />
      Perspective
    </label>
  )
}
