import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type SignaturePadHandle = { clear: () => void; isEmpty: () => boolean; toDataURL: () => string }

const SignaturePad = forwardRef<SignaturePadHandle>(function SignaturePad(_props, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    const c = canvas.current!
    const ratio = Math.max(window.devicePixelRatio || 1, 1)
    c.width = c.offsetWidth * ratio
    c.height = c.offsetHeight * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111827'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return [e.clientX - r.left, e.clientY - r.top]
  }

  useImperativeHandle(ref, () => ({
    clear() {
      const c = canvas.current!
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
      dirty.current = false
    },
    isEmpty: () => !dirty.current,
    toDataURL() {
      // Fondo blanco para que la firma se vea en cualquier visor.
      const c = canvas.current!
      const out = document.createElement('canvas')
      out.width = c.width
      out.height = c.height
      const ctx = out.getContext('2d')!
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, out.width, out.height)
      ctx.drawImage(c, 0, 0)
      return out.toDataURL('image/png')
    },
  }))

  return (
    <canvas
      ref={canvas}
      className="sigpad"
      onPointerDown={(e) => {
        drawing.current = true
        canvas.current!.setPointerCapture(e.pointerId)
        const ctx = canvas.current!.getContext('2d')!
        const [x, y] = pos(e)
        ctx.beginPath()
        ctx.moveTo(x, y)
      }}
      onPointerMove={(e) => {
        if (!drawing.current) return
        const ctx = canvas.current!.getContext('2d')!
        const [x, y] = pos(e)
        ctx.lineTo(x, y)
        ctx.stroke()
        dirty.current = true
      }}
      onPointerUp={() => (drawing.current = false)}
      onPointerLeave={() => (drawing.current = false)}
    />
  )
})

export default SignaturePad
