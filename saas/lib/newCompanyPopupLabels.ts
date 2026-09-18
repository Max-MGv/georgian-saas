import { t } from '@/lib/t'

/**
 * The locale-fixed (non-admin-editable) strings NewCompanyPopupView.tsx needs
 * — placeholders and button text. Both BookingForm.tsx (real popup) and
 * MessagesPanel.tsx (admin preview) call this rather than each building the
 * same object by hand, so the two can't drift out of sync with each other.
 */
export function buildNewCompanyLabels(locale: string) {
  return {
    namePlaceholder: t(locale, 'form.new_company_name_placeholder'),
    contactPlaceholder: t(locale, 'form.new_company_contact_placeholder'),
    phonePlaceholder: t(locale, 'form.new_company_phone_placeholder'),
    emailPlaceholder: t(locale, 'form.new_company_email_placeholder'),
    sending: t(locale, 'form.new_company_sending'),
    sendWithBooking: t(locale, 'form.new_company_send_with_booking'),
    sendRequest: t(locale, 'form.new_company_send_request'),
    cancel: t(locale, 'form.new_company_cancel'),
    close: t(locale, 'form.new_company_close'),
  }
}
