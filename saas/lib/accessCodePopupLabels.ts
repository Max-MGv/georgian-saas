import { t } from '@/lib/t'

/**
 * The locale-fixed (non-admin-editable) strings AccessCodePopupView.tsx needs
 * — placeholder and button text. Both BookingForm.tsx (real popup) and
 * MessagesPanel.tsx (admin preview) call this rather than each building the
 * same object by hand, so the two can't drift out of sync with each other.
 */
export function buildAccessCodeLabels(locale: string) {
  return {
    placeholder: t(locale, 'form.access_code_placeholder'),
    checking: t(locale, 'form.access_code_checking'),
    confirm: t(locale, 'form.access_code_confirm'),
    enterManually: t(locale, 'form.access_code_enter_manually'),
  }
}
