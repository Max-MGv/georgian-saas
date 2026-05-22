import { Resend } from 'resend'

type BookingEmailData = {
  name: string
  surname: string
  email: string
  date: string        // e.g. "Saturday, 24 May 2026"
  timeSlot: string    // e.g. "14:00"
  guestCount: number
  visitType: 'TASTING' | 'TASTING_LUNCH'
  totalPrice: number
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  const visitLabel = data.visitType === 'TASTING' ? 'Wine Tasting' : 'Wine Tasting + Lunch'

  const html = `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #1c1008;">

      <div style="background-color: #7c1d23; padding: 32px 40px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: bold;">Nikalas Marani</h1>
        <p style="color: #f5c6c8; margin: 6px 0 0; font-size: 14px;">Kardanakhi, Kakheti · Family Winery</p>
      </div>

      <div style="background-color: #fff9f3; padding: 32px 40px; border-radius: 0 0 8px 8px; border: 1px solid #e0d4c0; border-top: none;">

        <p style="font-size: 16px; margin: 0 0 24px;">Dear ${data.name},</p>

        <p style="font-size: 15px; color: #4a3728; margin: 0 0 24px; line-height: 1.6;">
          Thank you for your booking request. We have received your reservation and will contact you shortly to confirm the details.
        </p>

        <div style="background-color: #f5efe6; border-radius: 8px; padding: 20px 24px; margin: 0 0 24px;">
          <p style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #8b4513; margin: 0 0 14px;">Booking Summary</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="color: #6b5a47; padding: 5px 0;">Visit type</td>
              <td style="color: #1c1008; font-weight: bold; text-align: right;">${visitLabel}</td>
            </tr>
            <tr>
              <td style="color: #6b5a47; padding: 5px 0;">Date</td>
              <td style="color: #1c1008; font-weight: bold; text-align: right;">${data.date}</td>
            </tr>
            <tr>
              <td style="color: #6b5a47; padding: 5px 0;">Time</td>
              <td style="color: #1c1008; font-weight: bold; text-align: right;">${data.timeSlot}</td>
            </tr>
            <tr>
              <td style="color: #6b5a47; padding: 5px 0;">Guests</td>
              <td style="color: #1c1008; font-weight: bold; text-align: right;">${data.guestCount}</td>
            </tr>
            <tr style="border-top: 1px solid #e0d4c0;">
              <td style="color: #6b5a47; padding: 10px 0 5px;">Estimated total</td>
              <td style="color: #7c1d23; font-weight: bold; font-size: 16px; text-align: right;">${data.totalPrice}₾</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 13px; color: #6b5a47; margin: 0 0 8px;">
          📍 Kardanakhi village, Gurjaani Municipality, Kakheti
        </p>
        <p style="font-size: 13px; color: #6b5a47; margin: 0 0 8px;">
          📞 +995 599 96 33 17 · Call or WhatsApp
        </p>
        <p style="font-size: 13px; color: #6b5a47; margin: 0 0 24px;">
          ✉️ nikalasmarani@gmail.com
        </p>

        <div style="border-top: 1px solid #e0d4c0; padding-top: 16px;">
          <p style="font-size: 12px; color: #a89070; margin: 0; line-height: 1.6;">
            48-hour cancellation policy applies. Please notify us at least 48 hours before your visit if you need to cancel or reschedule.
          </p>
        </div>

      </div>
    </div>
  `

  const resend = new Resend(process.env.RESEND_API_KEY)

  return resend.emails.send({
    from: 'onboarding@resend.dev',
    to: data.email,
    replyTo: 'max.mghvdliashvili@gmail.com',
    subject: `Booking request received — ${data.date} at ${data.timeSlot}`,
    html,
  })
}
