---
tags: [feature, i18n, georgian]
---

# Georgian Translations

Translations ready to use when the Georgian language feature is added.

---

## Admin Settings — Payment Details section

| English label (current) | Georgian translation | Notes |
|---|---|---|
| Recipient name | მიმღების სახელი | e.g. ი/მ ელენე ხუნდაძე |
| Personal ID number | პირადი ნომერი | e.g. 01001040828 |
| Recipient bank | მიმღები ბანკი | e.g. ს.ბ "თიბისი ბანკი" |
| Bank code | ბანკის კოდი | e.g. TBCBGE22 |
| Recipient IBAN | მიმღების ანგარიში | e.g. GE65TB7183445064300079 |
| Payment Details (section header) | გადახდის რეკვიზიტები | |
| Thank you for your visit! Please find your invoice below. | გმადლობთ ვიზიტისთვის! Please find your invoice below. | Placeholder for invoice email message textarea |

---

## File to update when implementing

`C:\Users\Max\Desktop\claude-projects\georgian-saas\saas\app\admin\settings\SettingsClient.tsx`

- `paymentRows` array — label fields
- Section header line (`Payment Details`)
- Textarea placeholder (`invoice_email_message`)
