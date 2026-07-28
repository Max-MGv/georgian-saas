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
  'form.visit_type': 'Visit Type',
  'form.tasting': 'Wine Tasting',
  'form.tasting_lunch': 'Tasting + Lunch',
  'form.company_rate': 'Company rate',
  'form.date': 'Date',
  'form.time_slot': 'Time Slot',
  'form.no_slots': 'No slots available today',
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
  'form.est_total': 'Estimated Total',
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
  'form.err_min_guests': 'Minimum {min} guests total required.',
  'form.pp': 'pp',
  'form.flat': 'flat',
  'form.pc': 'pc',

  // Success state
  'form.success_heading': 'Booking received!',
  'form.success_body': 'Thank you. We will contact you shortly to confirm your visit.',
  'form.est_total_label': 'Estimated total',

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
  'wine.filter.all': 'All',
  'wine.orderSubtitle': 'Select wines, set quantities, and place a reservation.',
  'wine.bottle.singular': 'bottle',
  'wine.bottle.plural': 'bottles',
  'wine.perBottle': '/ bottle',
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
  'form.visit_type': 'ვიზიტის ტიპი',
  'form.tasting': 'ღვინის დეგუსტაცია',
  'form.tasting_lunch': 'დეგუსტაცია + სადილი',
  'form.company_rate': 'საკომპანიო ტარიფი',
  'form.date': 'თარიღი',
  'form.time_slot': 'დრო',
  'form.no_slots': 'დღეს ვაკანტური დრო არ არის',
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
  'form.est_total': 'სავარაუდო ჯამი',
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
  'form.err_min_guests': 'საჭიროა მინიმუმ {min} სტუმარი.',
  'form.pp': 'პ',
  'form.flat': 'ფიქს.',
  'form.pc': 'ცალი',

  // Success state
  'form.success_heading': 'ჯავშანი მიღებულია!',
  'form.success_body': 'გმადლობთ. ჩვენ მალე დაგიკავშირდებით ვიზიტის დასადასტურებლად.',
  'form.est_total_label': 'სავარაუდო ჯამი',

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
  'wine.filter.all': 'ყველა',
  'wine.orderSubtitle': 'აირჩიეთ ღვინოები, მიუთითეთ რაოდენობა და გააფორმეთ ჯავშანი.',
  'wine.bottle.singular': 'ბოთლი',
  'wine.bottle.plural': 'ბოთლი',
  'wine.perBottle': '/ ბოთლი',
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
