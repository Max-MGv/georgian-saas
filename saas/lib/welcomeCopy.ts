/**
 * Every word on vineworks.ge, in both languages.
 *
 * Split out of `components/WelcomeLanding.tsx` on purpose: this is the file Max
 * will edit, and nobody should have to read JSX to change a headline. The
 * component imports it and never contains a user-visible string of its own.
 *
 * **Georgian is the default and English is the toggle**, not the other way
 * round — the buyer is a Georgian winery owner. Every entry is a `Copy` pair,
 * so a missing translation is a type error rather than a half-Georgian page.
 *
 * Distinct from the demo's copy (`lib/demoTour.ts`, `components/DemoFrontDoor`),
 * which stays English-only: the demo is the product speaking, this is the
 * company speaking, and the division of labour agreed 2026-09-13 is that
 * **vineworks.ge explains and sells, demo.vineworks.ge shows**. Do not restate
 * the feature list inside the demo's front door, or a visitor reads the same
 * pitch twice and the front door becomes a speed bump.
 */

export type Lang = 'ka' | 'en'

/** One string in both languages. */
export type Copy = { ka: string; en: string }

/** Where every primary CTA on this page points. */
export const DEMO_URL = 'https://demo.vineworks.ge'

/** The side-by-side view — the one thing no competitor has, so it gets its own
 *  deep link rather than being found three clicks into the demo. */
export const DEMO_MIRROR_URL = 'https://demo.vineworks.ge/live'

export const CONTACT_EMAIL = 'max.mghvdliashvili@gmail.com'

export const NAV = {
  features: { ka: 'რას აკეთებს', en: 'What it does' },
  cta: { ka: 'ნახეთ დემო', en: 'See the demo' },
} satisfies Record<string, Copy>

export const HERO = {
  eyebrow: {
    ka: 'ქართული მარნებისთვის',
    en: 'Built for Georgian wineries',
  },
  title: {
    ka: 'თქვენი მარნის ონლაინ სისტემა — საიტი, ჯავშნები და გაყიდვები ერთად.',
    en: 'Your winery online — website, bookings and sales in one system.',
  },
  body: {
    ka: 'სტუმრები ჯავშნიან დეგუსტაციას პირდაპირ თქვენი საიტიდან. რესტორნები და იმპორტიორები თავად აკეთებენ ღვინის შეკვეთას, თითოეული თავისი შეთანხმებული ფასით. თქვენ კი ყველაფერს ერთი პანელიდან მართავთ — ტელეფონიდანაც.',
    en: 'Guests book tastings straight from your own site. Restaurants and importers place wine orders themselves, each on the rate you agreed with them. You run all of it from one panel — from your phone, if that is where you are.',
  },
  ctaPrimary: { ka: 'ნახეთ ცოცხალი დემო', en: 'See the live demo' },
  ctaSecondary: { ka: 'დაგვიკავშირდით', en: 'Talk to us' },
  ctaNote: {
    ka: 'რეგისტრაციის გარეშე. ნამდვილი სისტემა, 18 თვის ნამდვილი მონაცემებით.',
    en: 'No sign-up. A real system with eighteen months of real data in it.',
  },
} satisfies Record<string, Copy>

/**
 * `satisfies` rather than a bare `as const`: with `as const` alone, `heading`
 * and `close` were never checked against `Copy`, so a missing `en` here would
 * have slipped past the compiler and surfaced as `undefined` on the page. The
 * file header promises that a missing translation is a type error — this block
 * was the one place that was not true.
 */
export const PROBLEM = {
  heading: { ka: 'დღეს ეს ასე მუშაობს', en: 'How this works today' },
  items: [
    {
      ka: 'ჯავშანი მოდის Facebook-ის მიმოწერით, ზარით ან SMS-ით — და იწერება რვეულში.',
      en: 'A booking arrives by Facebook message, phone call or SMS — and gets written down in a notebook.',
    },
    {
      ka: 'თითოეულ ტუროპერატორს თავისი ფასი აქვს, და თქვენ ყოველ ჯერზე ხელით ითვლით.',
      en: 'Every tour operator is on a different rate, and you work the price out by hand every single time.',
    },
    {
      ka: 'რამდენი ჯავშანი გაქვთ ივლისში? პასუხს მაშინ იგებთ, როცა ივლისი დადგება.',
      en: 'How many bookings do you have in July? You find out when July gets here.',
    },
  ] satisfies Copy[],
  close: {
    ka: 'არცერთი მათგანი არ ნიშნავს, რომ ცუდად მუშაობთ. ნიშნავს, რომ ინსტრუმენტი არ გაქვთ.',
    en: 'None of that means the winery is run badly. It means nobody ever built the tool.',
  },
} satisfies { heading: Copy; items: Copy[]; close: Copy }

/**
 * The lucide components the landing page can draw, named as strings so this file
 * stays import-free and editable without touching code.
 *
 * A union rather than `string`: the component used to resolve it with
 * `ICONS[f.icon] ?? Wine`, so a typo fell back silently to a wine glass with no
 * type error anywhere. The map is now keyed by this union and the fallback is
 * gone. It is also the React `key` for each card, which
 * makes the union do double duty — reusing an icon is now a compile error rather
 * than a duplicate key at runtime.
 */
export type FeatureIcon = 'calendar' | 'wine' | 'dashboard' | 'trending' | 'receipt' | 'pencil'

export type Feature = { icon: FeatureIcon; title: Copy; body: Copy }

export const FEATURES: Feature[] = [
  {
    icon: 'calendar',
    title: { ka: 'ონლაინ ჯავშნები', en: 'Online bookings' },
    body: {
      ka: 'სტუმარი ირჩევს თარიღს, დროს და სტუმრების რაოდენობას, სისტემა თვითონ ითვლის ფასს და უგზავნის დადასტურებას. შაბათს 23:40-ზეც, როცა თქვენ გძინავთ.',
      en: 'The guest picks a date, a time and a party size; the system prices it and emails the confirmation. At 23:40 on a Saturday, while you are asleep.',
    },
  },
  {
    icon: 'wine',
    title: { ka: 'B2B ფასები და ღვინის შეკვეთები', en: 'Trade rates and wine orders' },
    body: {
      ka: 'ღვინის ბარები, რესტორნები და იმპორტიორები შეკვეთას თავად აკეთებენ თქვენი კატალოგიდან — თითოეული იმ ფასდაკლებით, რომელზეც შეთანხმდით.',
      en: 'Wine bars, restaurants and importers order from your catalogue themselves — each of them seeing the discount you agreed with them, and nobody else’s.',
    },
  },
  {
    icon: 'dashboard',
    title: { ka: 'ერთი ადმინ პანელი', en: 'One admin panel' },
    body: {
      ka: 'ჯავშნები, შეკვეთები, კომპანიები და ფასები ერთ ადგილას. გაფილტრეთ თარიღით, კომპანიით ან სტატუსით და იპოვეთ ნებისმიერი ჩანაწერი წამში.',
      en: 'Bookings, orders, companies and prices in one place. Filter by date, company or status and pull up any record in a second.',
    },
  },
  {
    icon: 'trending',
    title: { ka: 'სტატისტიკა და მომავალი შემოსავალი', en: 'Statistics and future revenue' },
    body: {
      ka: 'რამდენი ლარია უკვე დაჯავშნილი მომდევნო თვეებში — ეს ის ციფრია, რომელიც გეუბნებათ, დაიქირაოთ თუ არა ხალხი ზაფხულისთვის.',
      en: 'How much is already committed for the months ahead. That is the number that tells you whether to hire for the summer.',
    },
  },
  {
    icon: 'receipt',
    title: { ka: 'ინვოისები და გადახდები', en: 'Invoices and payments' },
    body: {
      ka: 'გაუგზავნეთ ინვოისი კომპანიას იმავე ჩანაწერიდან, სადაც ჯავშანია. ონლაინ გადახდა ჩართვადია, როცა მზად იქნებით.',
      en: 'Send a company its invoice from the same row the booking lives on. Online card payment switches on when you are ready for it.',
    },
  },
  {
    icon: 'pencil',
    title: { ka: 'საიტი, რომელსაც თავად არედაქტირებთ', en: 'A website you edit yourself' },
    body: {
      ka: 'ტექსტი, ფოტოები, ფასები, სამუშაო საათები — ყველაფერი იცვლება პანელიდან, ქართულად და ინგლისურად. პროგრამისტის გარეშე.',
      en: 'Text, photographs, prices, opening hours — all of it changed from the panel, in Georgian and in English. No developer, no ticket, no waiting a week for one paragraph.',
    },
  },
]

/** The standout. Given its own band rather than a seventh card because it is
 *  the thing that makes people say "wait, do that again". */
export const MIRROR = {
  eyebrow: { ka: 'ის, რაც სხვას არ აქვს', en: 'The part nobody else has' },
  title: {
    ka: 'ნახეთ ორივე მხარე ერთდროულად',
    en: 'Watch both sides at once',
  },
  body: {
    ka: 'მარცხნივ — თქვენი სტუმრის ეკრანი. მარჯვნივ — თქვენი ადმინ პანელი. დააჯავშნეთ მარცხნივ და უყურეთ, როგორ ჩნდება ჯავშანი მარჯვნივ, იმავე წამში. ეს ვიდეო არ არის — ეს ნამდვილი სისტემაა.',
    en: 'On the left, what your guest sees. On the right, your back office. Make a booking on the left and watch the row appear on the right in the same second. This is not a video — both panes are the real thing.',
  },
  cta: { ka: 'გახსენით ცოცხალი ხედი', en: 'Open the live mirror' },
} satisfies Record<string, Copy>

export const VISION = {
  heading: { ka: 'რატომ ვაკეთებთ ამას', en: 'Why we are building this' },
  body: [
    {
      ka: 'ქართულ ღვინოს რვა ათასი წლის ისტორია აქვს. მისი გაყიდვის ინსტრუმენტებს — არა.',
      en: 'Georgian wine has eight thousand years of history behind it. The tools for selling it do not.',
    },
    {
      ka: 'დიდ დასავლურ მარნებს აქვთ სისტემები, რომლებიც ჯავშნებს, ფასებს და B2B გაყიდვებს თავად უვლიან. ოჯახურ მარანს კახეთში იგივე შესაძლებლობა უნდა ჰქონდეს — ქართულად და იმ ფასად, რომელიც მისთვის რეალურია.',
      en: 'Large Western estates run software that handles bookings, rates and trade sales for them. A family marani in Kakheti deserves the same thing — in Georgian, and at a price that makes sense for a family marani.',
    },
    {
      ka: 'სწორედ ამას ვაშენებთ. თითო მარნისთვის — საკუთარი საიტი, საკუთარი ფასები, საკუთარი მონაცემები.',
      en: 'That is what Vineworks is. One winery, one site, its own rates, its own data — never pooled with anyone else’s.',
    },
  ] satisfies Copy[],
}

export const FINAL = {
  title: {
    ka: 'ყველაზე მარტივი გზა — უბრალოდ ნახოთ',
    en: 'The quickest way to judge it is to use it',
  },
  body: {
    ka: 'დემო ღიაა, რეგისტრაციის გარეშე. შიგნით სრულად აწყობილი მარანია — 400-მდე ჯავშანი, ტუროპერატორები თავიანთი ფასებით, ღვინის შეკვეთები. დააჯავშნეთ, წაშალეთ, შეცვალეთ ფასი, გატეხეთ თუ გინდათ — ყოველ ღამე თავიდან იწყება.',
    en: 'The demo is open, with no sign-up. Inside it is a fully working winery — close to 400 bookings, tour operators on their own rate ladders, trade orders in flight. Book something, cancel it, change a price, break it if you like. It rebuilds itself every night.',
  },
  ctaPrimary: { ka: 'გახსენით დემო', en: 'Open the demo' },
  ctaSecondary: { ka: 'მოგვწერეთ', en: 'Email us' },
} satisfies Record<string, Copy>

export const FOOTER = {
  tagline: {
    ka: 'ღვინის მარნის პლატფორმა საქართველოში',
    en: 'The winery platform, built in Georgia',
  },
} satisfies Record<string, Copy>

/** The toggle's own labels never translate — a Georgian speaker looking for
 *  English needs to see the word "English", not its Georgian name. */
export const LANG_LABEL: Record<Lang, string> = { ka: 'ქარ', en: 'ENG' }
