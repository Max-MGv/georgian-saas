'use client'

import { Dialog } from '@base-ui/react/dialog'
import { QRCodeSVG } from 'qrcode.react'

/**
 * A small button that opens a dialog showing a QR code for a link, so someone
 * standing next to the admin can scan it with their phone — the full URL never
 * needs to be shown.
 *
 * - The code is drawn in the browser (qrcode.react → inline SVG). The link can
 *   carry a payment token, so it is never sent to an outside "QR image" service.
 * - Always dark on white with a quiet-zone border, whatever the tenant's theme:
 *   a themed or inverted QR scans badly.
 * - Built on Base UI's Dialog (already a dependency), which provides the focus
 *   trap, Escape-to-close, scroll lock and ARIA roles; focus returns to the
 *   button on close.
 * - Labels are passed in, so the admin's own language system (adminT) drives
 *   them; this component knows no strings.
 *
 * "Copy link" and "Email" stay outside this component as the other ways to hand
 * the link over (a QR cannot be read by a screen reader or pasted into WhatsApp).
 */
export default function QrCodeDialog({
  url,
  triggerLabel,
  title,
  hint,
  qrAriaLabel,
  openLabel,
  closeLabel,
  triggerClassName,
  triggerStyle,
}: {
  url: string
  triggerLabel: string
  title: string
  /** One line under the code, e.g. "Ask the guest to scan this with their phone camera." */
  hint: string
  /** Accessible name for the code image. */
  qrAriaLabel: string
  /** "Open link" — for when the admin is already holding the guest's phone. */
  openLabel: string
  closeLabel: string
  triggerClassName?: string
  triggerStyle?: React.CSSProperties
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger className={triggerClassName} style={triggerStyle}>
        {triggerLabel}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop
          style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.45)' }}
        />
        <Dialog.Popup
          style={{
            position: 'fixed', zIndex: 1001, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 340px)', maxHeight: '92vh', overflowY: 'auto',
            backgroundColor: 'var(--site-surface)', color: 'var(--site-text)',
            border: '1px solid var(--site-border)', borderRadius: 16, padding: 20,
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)', textAlign: 'center',
          }}
        >
          <Dialog.Title className="text-sm font-semibold mb-1" style={{ color: 'var(--site-text)' }}>
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-xs mb-4" style={{ color: 'var(--site-secondary)' }}>
            {hint}
          </Dialog.Description>
          <div
            role="img"
            aria-label={qrAriaLabel}
            style={{ display: 'inline-block', backgroundColor: '#ffffff', padding: 12, borderRadius: 12, border: '1px solid var(--site-border)' }}
          >
            <QRCodeSVG value={url} size={240} level="M" marginSize={2} bgColor="#ffffff" fgColor="#000000" aria-hidden="true" />
          </div>
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-2 rounded font-medium"
              style={{ border: '1px solid var(--site-border)', color: 'var(--site-text)' }}
            >
              {openLabel}
            </a>
            <Dialog.Close
              className="text-xs px-3 py-2 rounded font-medium text-white"
              style={{ backgroundColor: 'var(--color-brand)' }}
            >
              {closeLabel}
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
