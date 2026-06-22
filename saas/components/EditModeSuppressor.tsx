'use client'

import { useEffect } from 'react'

// Intercepts link clicks and form submissions inside the edit-mode iframe
// so the admin doesn't navigate away while editing.
export default function EditModeSuppressor() {
  useEffect(() => {
    function onLinkClick(e: MouseEvent) {
      const a = (e.target as Element).closest('a')
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      // Allow scroll anchors (e.g. #book) to still work
      if (href.startsWith('#')) return
      e.preventDefault()
    }

    function onFormSubmit(e: Event) {
      e.preventDefault()
    }

    document.addEventListener('click', onLinkClick, true)
    document.addEventListener('submit', onFormSubmit, true)
    return () => {
      document.removeEventListener('click', onLinkClick, true)
      document.removeEventListener('submit', onFormSubmit, true)
    }
  }, [])

  return null
}
