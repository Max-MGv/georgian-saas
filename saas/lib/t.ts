type Translations = Record<string, string>

const en: Translations = {
  // Nav
  'nav.home': 'Home',
  'nav.about': 'About',
  'nav.wines': 'Order Wine',
  'nav.contact': 'Contact',
  'nav.book': 'Book a Visit',

  // Home page static
  'home.book_heading': 'Book a Visit',
  'home.order_wine': 'Order Wine',

  // About page static
  'about.eyebrow': 'Our Story',
  'about.heading': 'About Us',
  'about.expect_heading': 'What to Expect',
  'about.cta_text': 'Ready to visit?',
  'about.cta_btn': 'Book a Visit',

  // Contact page static
  'contact.eyebrow': 'Get in Touch',
  'contact.heading': 'Contact Us',
  'contact.label_phone': 'Phone',
  'contact.label_email': 'Email',
  'contact.label_location': 'Location',
  'contact.label_cancel': 'Cancellation',
  'contact.note_phone': 'Call or WhatsApp, Georgian or English',
  'contact.note_email': 'We reply within 24 hours',
  'contact.note_location': 'Georgia',
  'contact.note_cancel': 'Please notify us at least 48 hours before your visit',
  'contact.cancel_value': '48-hour policy',
  'contact.map_placeholder': 'Georgia',
  'contact.map_directions': 'Exact directions are sent with your booking confirmation.',
  'contact.find_us': 'How to Find Us',
  'contact.book_cta': 'Prefer to just book directly?',
  'contact.book_btn': 'Book a Visit',

  // Legal pages static
  'legal.breadcrumb_home': 'Home',
  'legal.terms_title': 'Terms and conditions',
  'legal.privacy_title': 'Confidentiality policy',
  'legal.returns_title': 'Return conditions',

  // Footer
  'footer.cancel': '48-hour cancellation policy applies.',
  'footer.terms': 'Terms',
  'footer.privacy': 'Privacy',
  'footer.returns': 'Returns',

  // BookingForm labels
  'form.booking_type': 'Booking Type',
  'form.individual': 'Individual Booking',
  'form.company_type': 'Tour Company',
  'form.company': 'Company',
  'form.company_placeholder': 'Select your company…',
  'form.nationality': 'Nationality (optional)',
  'form.nationality_placeholder': 'Type or browse to add a country…',
  'form.nationality_empty': 'No matches',
  'form.visit_type': 'Visit Type',
  'form.tasting': 'Wine Tasting',
  'form.tasting_lunch': 'Tasting + Lunch',
  'form.company_rate': 'Company rate',
  'form.date': 'Date',
  'form.time_slot': 'Time Slot',
  'form.no_slots': 'No slots available today',
  'form.select_date_first': 'Select a date first',
  'form.blocked_date': 'The winery is closed on this date. Please choose another date.',
  'form.guest_counts': 'Guest Counts',
  'form.guests_tasting': 'Tasting',
  'form.guests_lunch': 'Lunch',
  'form.guests_free': 'Free / Guide',
  'form.total': 'Total',
  'form.paying': 'paying',
  'form.guest_singular': 'guest',
  'form.guest_plural': 'guests',
  'form.num_guests': 'Number of Guests',
  'form.minimum': 'minimum',
  'form.guest_min_warn': 'Minimum is {min} guests — reset to {min}.',
  'form.hot_dish': 'Hot Dish Selection',
  'form.veg_dish': 'Vegetable dish',
  'form.meat_dish': 'Meat dish',
  'form.choose': '— choose —',
  'form.masterclass': 'Masterclass Add-ons',
  'form.qty': 'qty',
  'form.food_notes': 'Food Notes',
  'form.food_notes_sub': 'allergies, dietary requirements',
  'form.food_notes_placeholder': 'Any dietary restrictions or special requests for the kitchen…',
  'form.first_name': 'First Name',
  'form.last_name': 'Last Name',
  'form.phone': 'Phone',
  'form.email': 'Email',
  'form.est_total': 'Total',
  'form.per_pp': '/ person',
  'form.registration': 'Registration',
  'form.price_after_submit': 'Price will be confirmed after submission.',
  'form.no_rate': 'No rate for {n} guests',
  'form.no_rate_detail': 'This company has no pricing tier that covers {n} guests. Please contact us directly.',
  'form.company_rate_applies': 'Your company rate applies',
  'form.submit': 'Request Booking',
  'form.submitting': 'Submitting…',
  'form.cancel_policy': '48-hour cancellation policy. We will contact you to confirm.',
  'form.err_contact': 'Please provide at least a phone number or email so we can confirm your booking.',
  'form.err_blocked': 'The winery is closed on this date. Please choose another date.',
  'form.err_day_closed': 'The winery is closed on this day of the week. Please choose another date.',
  'form.err_lead_time': 'Bookings must be made at least {hours} hours in advance. Please choose a later time.',
  'form.err_min_guests': 'Minimum {min} guests total required.',
  'form.pp': 'pp',
  'form.flat': 'flat',
  'form.pc': 'pc',

  // Confirm-your-visit step (Feature 184) — shown after validation passes,
  // before the booking is actually sent.
  'form.confirm_heading': 'Review your visit',
  'form.confirm_subheading': 'Take a second look — nothing is booked yet.',
  'form.confirm_section_visit': 'Visit',
  'form.confirm_section_guests': 'Guests & contact',
  'form.confirm_arrive': 'Arrive',
  'form.confirm_duration_note': '~{hours} hrs · plan to finish around {end}',
  'form.confirm_edit': 'Edit details',
  'form.confirm_button': 'Confirm & Request Booking',
  'form.confirm_button_pay': 'Confirm & Book',

  // Success state
  'form.submit_pay': 'Book & Pay',
  'form.success_heading': 'Booking received!',
  'form.success_body': 'Thank you. We will contact you shortly to confirm your visit.',
  'form.est_total_label': 'Total',
  'form.guest_count_adjusted': 'We can accommodate up to {max} guests for this visit — your booking has been adjusted to {max} guests.',
  'form.guest_count_over_max_notice': 'Groups over {max} guests will be confirmed with you directly.',
  'form.onsite_pending_company_note': "Since your company isn't set up in our system yet, this isn't confirmed — we'll set up your account and follow up to confirm your booking and pricing.",

  // New Company popup (Feature: On-Site Messages, Chunk 1). Body/success/error
  // text is admin-editable via SiteContent; these are the code fallbacks.
  // Field placeholders and buttons are fixed chrome (translated, not editable).
  'form.new_company_title': 'New Company?',
  'form.new_company_body_with_booking': "Fill in your company details — we'll submit your booking along with a request to set up your account. Your booking won't be confirmed until we do.",
  'form.new_company_body_no_booking': "Fill in your details and we'll get in touch to set up your account.",
  'form.new_company_success_title': 'Request received!',
  'form.new_company_success_body': "We'll be in touch to set up your account.",
  'form.new_company_error': 'Something went wrong. Please try again.',
  'form.new_company_name_placeholder': 'Company Name *',
  'form.new_company_contact_placeholder': 'Your Name *',
  'form.new_company_phone_placeholder': 'Phone Number *',
  'form.new_company_email_placeholder': 'Email (optional)',
  'form.new_company_send_with_booking': 'Send Booking & Request',
  'form.new_company_send_request': 'Send Request',
  'form.new_company_sending': 'Sending…',
  'form.new_company_close': 'Close',
  'form.new_company_cancel': 'Cancel',
  'form.new_company_chip': 'New Company?',
  'form.new_company_dropdown_option': '+ New Company',

  // Company access-code popup (Chunk 3). Title/intro/error are admin-editable
  // via SiteContent (mc()); placeholder + buttons are fixed chrome (t() only).
  'form.access_code_title': 'Enter your company code',
  'form.access_code_intro': '{company} — enter the access code provided by the winery.',
  'form.access_code_error': 'Incorrect code — please try again or contact the winery.',
  'form.access_code_placeholder': 'e.g. MARANI42',
  'form.access_code_checking': 'Checking…',
  'form.access_code_confirm': 'Confirm',
  'form.access_code_enter_manually': 'Enter Manually',
  // Guide picker (KnownBugs #55) — shown after a COMPANY-level code is accepted
  // for a company that has guides, so the booking is still attributed to a person.
  'form.guide_picker_title': 'Who is bringing the group?',
  'form.guide_picker_intro': '{company} — choose your name so the winery knows who to contact on the day.',
  'form.guide_picker_not_listed': 'I am not on this list',
  // Direct-entry variant (hideCompanyDropdown tenants) — its own inline field,
  // not a popup, but shares the same "wrong code" concept.
  'form.access_code_direct_placeholder': 'Enter your company code',
  'form.access_code_direct_not_recognised': 'Code not recognised.',

  // Chunk 4 — validation & server errors. All admin-editable (mc()), per
  // Max's call: full consistency with the rest of this plan over the
  // "translate only" option, even though these read more like system
  // errors than brand copy. Several are shared between the client-side
  // check and createBooking.ts's authoritative server-side re-check of the
  // same rule — one editable field controls both surfaces rather than two
  // near-duplicate fields that could drift out of sync.
  'form.err_select_date': 'Please select a date.',
  'form.err_future_date': 'Please choose a future date.',
  'form.err_working_hours': "That time is outside the winery's working hours on this date. Please choose another time.",

  // Online payment result page
  'payment.success_heading': 'Payment received',
  'payment.success_body': 'Thank you — your payment went through and your booking is confirmed. A confirmation has been sent to you.',
  // Says "not charged" because that is what a declined or abandoned Flitt
  // checkout means, and it is the first thing a worried customer wants to know.
  'payment.failed_heading': 'Payment was not completed',
  'payment.failed_body': 'You have not been charged. Your reservation is still being held — please contact us and we will arrange payment another way.',
  'payment.pending_heading': 'Checking your payment',
  'payment.pending_body': 'This can take a moment. If you have already paid, your confirmation will arrive shortly — there is no need to pay again.',
  'payment.back_home': 'Back to home',

  // Wine catalogue — type/sweetness badges
  'wine.type.RED': 'Red',
  'wine.type.WHITE': 'White',
  'wine.type.AMBER': 'Amber',
  'wine.type.ROSE': 'Rosé',
  'wine.sweetness.DRY': 'Dry',
  'wine.sweetness.SEMI_DRY': 'Semi-dry',
  'wine.sweetness.SEMI_SWEET': 'Semi-sweet',
  'wine.sweetness.SWEET': 'Sweet',
  'wine.sparkling': 'Sparkling',
  'wine.filter.type': 'Type',
  'wine.filter.style': 'Style',
  'wine.filter.year': 'Year',
  'wine.filter.all': 'All',
  'wine.orderSubtitle': 'Select wines, set quantities, and place a reservation.',
  'wine.bottle.singular': 'bottle',
  'wine.bottle.plural': 'bottles',
  'wine.perBottle': '/ bottle',
  'wines.view.grid': 'Grid view',
  'wines.view.list': 'List view',
}

const ka: Translations = {
  // Nav
  'nav.home': 'მთავარი',
  'nav.about': 'ჩვენ შესახებ',
  'nav.wines': 'ღვინის შეკვეთა',
  'nav.contact': 'კონტაქტი',
  'nav.book': 'ჯავშანი',

  // Home page static
  'home.book_heading': 'ვიზიტის ჯავშანი',
  'home.order_wine': 'ღვინის შეკვეთა',

  // About page static
  'about.eyebrow': 'ჩვენი ამბავი',
  'about.heading': 'ჩვენ შესახებ',
  'about.expect_heading': 'რას უნდა ელოდოთ',
  'about.cta_text': 'მზად ხართ ვიზიტისთვის?',
  'about.cta_btn': 'ვიზიტის ჯავშანი',

  // Contact page static
  'contact.eyebrow': 'დაგვიკავშირდით',
  'contact.heading': 'კონტაქტი',
  'contact.label_phone': 'ტელეფონი',
  'contact.label_email': 'ელ-ფოსტა',
  'contact.label_location': 'მდებარეობა',
  'contact.label_cancel': 'გაუქმება',
  'contact.note_phone': 'დარეკეთ ან WhatsApp, ქართულად ან ინგლისურად',
  'contact.note_email': 'ვპასუხობთ 24 საათის განმავლობაში',
  'contact.note_location': 'საქართველო',
  'contact.note_cancel': 'გთხოვთ, გვაცნობოთ მინიმუმ 48 საათით ადრე',
  'contact.cancel_value': '48-საათიანი პოლიტიკა',
  'contact.map_placeholder': 'საქართველო',
  'contact.map_directions': 'ზუსტი მარშრუტი გაიგზავნება ჯავშნის დადასტურებასთან ერთად.',
  'contact.find_us': 'როგორ მოგვინახოთ',
  'contact.book_cta': 'გირჩევნიათ პირდაპირ ჯავშანი?',
  'contact.book_btn': 'ვიზიტის ჯავშანი',

  // Legal pages static
  'legal.breadcrumb_home': 'მთავარი',
  'legal.terms_title': 'წესები და პირობები',
  'legal.privacy_title': 'კონფიდენციალურობის პოლიტიკა',
  'legal.returns_title': 'დაბრუნების პირობები',

  // Footer
  'footer.cancel': 'გაუქმების პოლიტიკა: 48 საათი.',
  'footer.terms': 'წესები და პირობები',
  'footer.privacy': 'კონფიდენციალურობა',
  'footer.returns': 'დაბრუნების პირობები',

  // BookingForm labels
  'form.booking_type': 'ჯავშნის ტიპი',
  'form.individual': 'ინდივიდუალური',
  'form.company_type': 'ტური კომპანია',
  'form.company': 'კომპანია',
  'form.company_placeholder': 'აირჩიეთ კომპანია…',
  // Drafted, not native-reviewed (Plan-CompanyNationality) — flag for Max.
  'form.nationality': 'ეროვნება (არასავალდებულო)',
  'form.nationality_placeholder': 'ჩაწერეთ ან დაათვალიერეთ ქვეყნების დასამატებლად…',
  'form.nationality_empty': 'შედეგები არ მოიძებნა',
  'form.visit_type': 'ვიზიტის ტიპი',
  'form.tasting': 'ღვინის დეგუსტაცია',
  'form.tasting_lunch': 'დეგუსტაცია + სადილი',
  'form.company_rate': 'საკომპანიო ტარიფი',
  'form.date': 'თარიღი',
  'form.time_slot': 'დრო',
  'form.no_slots': 'დღეს ვაკანტური დრო არ არის',
  'form.select_date_first': 'ჯერ აირჩიეთ თარიღი',
  'form.blocked_date': 'მარანი დახურულია ამ თარიღს. გთხოვთ, აირჩიოთ სხვა თარიღი.',
  'form.guest_counts': 'სტუმრების რაოდენობა',
  'form.guests_tasting': 'დეგუსტაცია',
  'form.guests_lunch': 'სადილი',
  'form.guests_free': 'უფასო / გიდი',
  'form.total': 'სულ',
  'form.paying': 'გადამხდელი',
  'form.guest_singular': 'სტუმარი',
  'form.guest_plural': 'სტუმარი',
  'form.num_guests': 'სტუმრების რაოდენობა',
  'form.minimum': 'მინიმუმი',
  'form.guest_min_warn': 'მინიმუმი {min} სტუმარია — გადაყენდა {min}-ზე.',
  'form.hot_dish': 'ცხელი კერძის შერჩევა',
  'form.veg_dish': 'მცენარეული კერძი',
  'form.meat_dish': 'ხორცის კერძი',
  'form.choose': '— აირჩიეთ —',
  'form.masterclass': 'მასტერკლასის დამატებები',
  'form.qty': 'რაოდ.',
  'form.food_notes': 'შენიშვნები კვებაზე',
  'form.food_notes_sub': 'ალერგია, დიეტური მოთხოვნები',
  'form.food_notes_placeholder': 'ნებისმიერი დიეტური შეზღუდვა ან სპეციალური მოთხოვნა სამზარეულოსთვის…',
  'form.first_name': 'სახელი',
  'form.last_name': 'გვარი',
  'form.phone': 'ტელეფონი',
  'form.email': 'ელ-ფოსტა',
  'form.est_total': 'ჯამი',
  'form.per_pp': '/ პერსონა',
  'form.registration': 'რეგისტრაცია',
  'form.price_after_submit': 'ფასი დადასტურდება განაცხადის შემდეგ.',
  'form.no_rate': '{n} სტუმარზე ტარიფი არ არის',
  'form.no_rate_detail': 'ამ კომპანიას არ აქვს ფასების კატეგორია {n} სტუმრისთვის. გთხოვთ, დაგვიკავშირდეთ პირდაპირ.',
  'form.company_rate_applies': 'თქვენი საკომპანიო ტარიფი ვრცელდება',
  'form.submit': 'ჯავშნის მოთხოვნა',
  'form.submitting': 'იგზავნება…',
  'form.cancel_policy': 'გაუქმება შესაძლებელია 48 საათამდე. ჩვენ დაგიკავშირდებით დასადასტურებლად.',
  'form.err_contact': 'გთხოვთ, მიუთითოთ ტელეფონის ნომერი ან ელ-ფოსტა, რათა დავადასტუროთ ჯავშანი.',
  'form.err_blocked': 'მარანი დახურულია ამ თარიღს. გთხოვთ, აირჩიოთ სხვა თარიღი.',
  'form.err_day_closed': 'მარანი დახურულია კვირის ამ დღეს. გთხოვთ, აირჩიოთ სხვა თარიღი.',
  'form.err_lead_time': 'ჯავშნის გაკეთება შესაძლებელია მინიმუმ {hours} საათით ადრე. გთხოვთ, აირჩიოთ უფრო გვიანი დრო.',
  'form.err_min_guests': 'საჭიროა მინიმუმ {min} სტუმარი.',
  'form.pp': 'პ',
  'form.flat': 'ფიქს.',
  'form.pc': 'ცალი',

  'form.confirm_heading': 'გადაამოწმეთ ვიზიტი',
  'form.confirm_subheading': 'გადახედეთ დეტალებს — ჯავშანი ჯერ არ არის გაგზავნილი.',
  'form.confirm_section_visit': 'ვიზიტი',
  'form.confirm_section_guests': 'სტუმრები და კონტაქტი',
  'form.confirm_arrive': 'ჩამოსვლა',
  'form.confirm_duration_note': '~{hours} სთ · დასრულება დაახლოებით {end}-ზე',
  'form.confirm_edit': 'დეტალების რედაქტირება',
  'form.confirm_button': 'დადასტურება და ჯავშნის მოთხოვნა',
  'form.confirm_button_pay': 'დადასტურება და ჯავშანი',

  // Success state
  'form.submit_pay': 'დაჯავშნა და გადახდა',
  'form.success_heading': 'ჯავშანი მიღებულია!',
  'form.success_body': 'გმადლობთ. ჩვენ მალე დაგიკავშირდებით ვიზიტის დასადასტურებლად.',
  'form.est_total_label': 'ჯამი',
  'form.guest_count_adjusted': 'ჩვენ შეგვიძლია მივიღოთ მაქსიმუმ {max} სტუმარი ამ ვიზიტისთვის — თქვენი ჯავშანი შესწორდა {max} სტუმარზე.',
  'form.guest_count_over_max_notice': '{max}-ზე მეტი სტუმრის ჯგუფები დადასტურდება პირდაპირ თქვენთან.',
  'form.onsite_pending_company_note': 'რადგან თქვენი კომპანია ჯერ არ არის რეგისტრირებული ჩვენს სისტემაში, ეს ჯავშანი ჯერ არ არის დადასტურებული — ჩვენ შევქმნით თქვენს ანგარიშს და დაგიკავშირდებით ჯავშნისა და ფასის დასადასტურებლად.',

  'form.new_company_title': 'ახალი კომპანია?',
  'form.new_company_body_with_booking': 'შეავსეთ კომპანიის დეტალები — ჩვენ გავაგზავნით თქვენს ჯავშანს ანგარიშის შექმნის მოთხოვნასთან ერთად. თქვენი ჯავშანი დადასტურებული არ იქნება მანამ, სანამ ამას არ გავაკეთებთ.',
  'form.new_company_body_no_booking': 'შეავსეთ თქვენი მონაცემები და ჩვენ დაგიკავშირდებით ანგარიშის შესაქმნელად.',
  'form.new_company_success_title': 'მოთხოვნა მიღებულია!',
  'form.new_company_success_body': 'ჩვენ დაგიკავშირდებით თქვენი ანგარიშის შესაქმნელად.',
  'form.new_company_error': 'დაფიქსირდა შეცდომა. გთხოვთ სცადოთ ხელახლა.',
  'form.new_company_name_placeholder': 'კომპანიის დასახელება *',
  'form.new_company_contact_placeholder': 'თქვენი სახელი *',
  'form.new_company_phone_placeholder': 'ტელეფონის ნომერი *',
  'form.new_company_email_placeholder': 'ელ-ფოსტა (არასავალდებულო)',
  'form.new_company_send_with_booking': 'ჯავშნისა და მოთხოვნის გაგზავნა',
  'form.new_company_send_request': 'მოთხოვნის გაგზავნა',
  'form.new_company_sending': 'იგზავნება…',
  'form.new_company_close': 'დახურვა',
  'form.new_company_cancel': 'გაუქმება',
  'form.new_company_chip': 'ახალი კომპანია?',
  'form.new_company_dropdown_option': '+ ახალი კომპანია',

  'form.access_code_title': 'შეიყვანეთ კომპანიის კოდი',
  'form.access_code_intro': '{company} — შეიყვანეთ მარნის მიერ მოწოდებული წვდომის კოდი.',
  'form.access_code_error': 'არასწორი კოდი — გთხოვთ სცადოთ ხელახლა ან დაუკავშირდით მარანს.',
  'form.access_code_placeholder': 'მაგ.: MARANI42',
  'form.access_code_checking': 'მოწმდება…',
  'form.access_code_confirm': 'დადასტურება',
  'form.access_code_enter_manually': 'ხელით შეყვანა',
  // Guide picker (KnownBugs #55) — KA drafted, not natively reviewed, per the
  // standing caveat on every Georgian string added by Claude in this project.
  'form.guide_picker_title': 'ვინ მოჰყავს ჯგუფი?',
  'form.guide_picker_intro': '{company} — აირჩიეთ თქვენი სახელი, რომ მარანმა იცოდეს ვის დაუკავშირდეს.',
  'form.guide_picker_not_listed': 'ამ სიაში არ ვარ',
  'form.access_code_direct_placeholder': 'შეიყვანეთ კომპანიის კოდი',
  'form.access_code_direct_not_recognised': 'კოდი ვერ მოიძებნა.',

  'form.err_select_date': 'გთხოვთ, აირჩიოთ თარიღი.',
  'form.err_future_date': 'გთხოვთ, აირჩიოთ მომავალი თარიღი.',
  'form.err_working_hours': 'ეს დრო მარნის სამუშაო საათების მიღმაა ამ თარიღისთვის. გთხოვთ, აირჩიოთ სხვა დრო.',

  // Online payment result page
  'payment.success_heading': 'გადახდა მიღებულია',
  'payment.success_body': 'გმადლობთ — გადახდა წარმატებით შესრულდა და თქვენი ჯავშანი დადასტურებულია. დადასტურება გამოგზავნილია.',
  'payment.failed_heading': 'გადახდა ვერ დასრულდა',
  'payment.failed_body': 'თანხა არ ჩამოგეჭრათ. თქვენი ჯავშანი კვლავ ძალაშია — გთხოვთ დაგვიკავშირდეთ და გადახდას სხვა გზით მოვაგვარებთ.',
  'payment.pending_heading': 'მიმდინარეობს გადახდის შემოწმება',
  'payment.pending_body': 'ამას შეიძლება ერთი წუთი დასჭირდეს. თუ უკვე გადაიხადეთ, დადასტურება მალე მოგივათ — ხელახლა გადახდა საჭირო არ არის.',
  'payment.back_home': 'მთავარ გვერდზე დაბრუნება',

  // Wine catalogue — type/sweetness badges
  'wine.type.RED': 'წითელი',
  'wine.type.WHITE': 'თეთრი',
  'wine.type.AMBER': 'ქარვისფერი',
  'wine.type.ROSE': 'ვარდისფერი',
  'wine.sweetness.DRY': 'მშრალი',
  'wine.sweetness.SEMI_DRY': 'ნახევრად მშრალი',
  'wine.sweetness.SEMI_SWEET': 'ნახევრად ტკბილი',
  'wine.sweetness.SWEET': 'ტკბილი',
  'wine.sparkling': 'ცქრიალა',
  'wine.filter.type': 'ტიპი',
  'wine.filter.style': 'სტილი',
  'wine.filter.year': 'წელი',
  'wine.filter.all': 'ყველა',
  'wine.orderSubtitle': 'აირჩიეთ ღვინოები, მიუთითეთ რაოდენობა და გააფორმეთ ჯავშანი.',
  'wine.bottle.singular': 'ბოთლი',
  'wine.bottle.plural': 'ბოთლი',
  'wine.perBottle': '/ ბოთლი',
  'wines.view.grid': 'ბადის ხედი',
  'wines.view.list': 'სიის ხედი',
}

const dict: Record<string, Translations> = { en, ka }

export function t(locale: string, key: string, vars?: Record<string, string | number>): string {
  let str = dict[locale]?.[key] ?? dict.en[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v))
    }
  }
  return str
}
