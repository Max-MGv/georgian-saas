import dotenv from 'dotenv'
dotenv.config({ path: '.env' })

// Dynamic imports ensure DATABASE_URL is set before Prisma client is created
async function main() {
  const { db } = await import('../lib/db')
  const { createBooking } = await import('../app/actions/createBooking')

  // Seed wines (skip if already exist)
  const wineCount = await db.wine.count()
  if (wineCount === 0) {
    const wines = [
      { name: 'Saperavi 2022',         type: 'Red Dry',    price: 18, color: '#7c1d23', sortOrder: 0 },
      { name: 'Rkatsiteli 2023',       type: 'White Dry',  price: 15, color: '#8b6914', sortOrder: 1 },
      { name: 'Rkatsiteli Amber 2022', type: 'Amber',      price: 22, color: '#c27c2a', sortOrder: 2 },
      { name: 'Mtsvane 2023',          type: 'White Dry',  price: 16, color: '#5a7c14', sortOrder: 3 },
      { name: 'Rosé 2023',             type: 'Rosé Dry',   price: 17, color: '#c45a6e', sortOrder: 4 },
      { name: 'Chacha',                type: 'Spirit 55%', price: 25, color: '#6b5a47', sortOrder: 5 },
    ]
    await db.wine.createMany({ data: wines })
    console.log(`  ✓ Seeded ${wines.length} wines`)
  } else {
    console.log(`  — Wines already seeded (${wineCount} found), skipping`)
  }

  // Fetch companies and their tiers so we can make valid company bookings
  const companies = await db.company.findMany({ include: { prices: { orderBy: { minGuests: 'asc' } } } })
  const companiesWithTiers = companies.filter(c => c.prices.length > 0)

  // Spread dates across the past 6 months
  function daysAgo(n: number) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().split('T')[0]
  }

  const TIME_SLOTS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00']

  const INDIVIDUAL_GUESTS = [
    { name: 'Giorgi',   surname: 'Beridze',      phone: '+995 555 11 22 33', guests: 4  },
    { name: 'Nino',     surname: 'Kvaratskhelia', email: 'nino.k@gmail.com',  guests: 6  },
    { name: 'Luka',     surname: 'Tsiklauri',     phone: '+995 577 44 55 66', guests: 8  },
    { name: 'Tamar',    surname: 'Gelashvili',    email: 'tamar.g@mail.ge',   guests: 5  },
    { name: 'David',    surname: 'Chikvanaia',    phone: '+995 599 77 88 99', guests: 10 },
    { name: 'Ana',      surname: 'Maisuradze',    email: 'ana.m@gmail.com',   guests: 4  },
    { name: 'Mikheil',  surname: 'Jgarkava',      phone: '+995 555 00 11 22', guests: 7  },
    { name: 'Mariam',   surname: 'Khachidze',     email: 'mariam.h@mail.ge',  guests: 9  },
    { name: 'Levan',    surname: 'Lomidze',        phone: '+995 577 33 44 55', guests: 12 },
    { name: 'Ketevan',  surname: 'Javakhishvili',  email: 'keti.j@gmail.com',  guests: 5  },
    { name: 'Beka',     surname: 'Sturua',         phone: '+995 599 22 33 44', guests: 6  },
    { name: 'Salome',   surname: 'Iashvili',       email: 'salome.i@mail.ge',  guests: 14 },
    { name: 'Tornike',  surname: 'Megrelidze',     phone: '+995 555 66 77 88', guests: 4  },
    { name: 'Elene',    surname: 'Nadiradze',      email: 'elene.n@gmail.com', guests: 8  },
    { name: 'Zaza',     surname: 'Kobiashvili',    phone: '+995 577 99 00 11', guests: 11 },
    { name: 'Nato',     surname: 'Gigauri',        email: 'nato.g@mail.ge',    guests: 5  },
    { name: 'Shota',    surname: 'Arveladze',      phone: '+995 599 55 66 77', guests: 7  },
    { name: 'Maka',     surname: 'Chikhladze',     email: 'maka.ch@gmail.com', guests: 4  },
    { name: 'Irakli',   surname: 'Tsulukidze',     phone: '+995 555 88 99 00', guests: 9  },
    { name: 'Tinatin',  surname: 'Darchiashvili',  email: 'tina.d@mail.ge',    guests: 6  },
  ]

  // Date distribution: cluster more orders in recent months, fewer earlier
  const DATE_OFFSETS = [
    3, 5, 8, 11, 14, 18, 22, 25, 30, 35,
    40, 45, 52, 60, 68, 75, 85, 100, 120, 150,
  ]

  const VISIT_TYPES: ('TASTING' | 'TASTING_LUNCH')[] = [
    'TASTING', 'TASTING', 'TASTING',
    'TASTING_LUNCH', 'TASTING_LUNCH',
  ]

  console.log(`\nSeeding database...`)
  console.log(`Found ${companies.length} companies, ${companiesWithTiers.length} with price tiers.\n`)

  let success = 0
  let failed = 0

  // Individual bookings
  for (let i = 0; i < INDIVIDUAL_GUESTS.length; i++) {
    const person = INDIVIDUAL_GUESTS[i]
    const visitType = VISIT_TYPES[i % VISIT_TYPES.length]
    const date = daysAgo(DATE_OFFSETS[i % DATE_OFFSETS.length])
    const timeSlot = TIME_SLOTS[i % TIME_SLOTS.length]

    const result = await createBooking({
      bookingType: 'INDIVIDUAL',
      visitType,
      date,
      timeSlot,
      guestCount: person.guests,
      name: person.name,
      surname: person.surname,
      email: person.email,
      phone: person.phone,
    })

    if (result.success) {
      console.log(`  ✓ ${person.name} ${person.surname} — ${person.guests} guests, ${visitType}, ${date}`)
      success++
    } else {
      console.log(`  ✗ ${person.name} ${person.surname} — ${result.error}`)
      failed++
    }
  }

  // Company bookings — one per company-tier pair, only if tiers exist
  for (const company of companiesWithTiers) {
    for (const tier of company.prices) {
      const midpoint = Math.floor((tier.minGuests + tier.maxGuests) / 2)
      const visitType = VISIT_TYPES[success % VISIT_TYPES.length]
      const date = daysAgo(DATE_OFFSETS[success % DATE_OFFSETS.length])
      const timeSlot = TIME_SLOTS[success % TIME_SLOTS.length]

      const result = await createBooking({
        bookingType: 'COMPANY',
        companyId: company.id,
        visitType,
        date,
        timeSlot,
        guestCount: midpoint,
        name: 'Group',
        surname: company.name,
        phone: '+995 555 00 00 00',
      })

      if (result.success) {
        console.log(`  ✓ ${company.name} — ${midpoint} guests (tier ${tier.minGuests}–${tier.maxGuests}), ${visitType}, ${date}`)
        success++
      } else {
        console.log(`  ✗ ${company.name} — ${result.error}`)
        failed++
      }
    }
  }

  console.log(`\nDone. ${success} orders created, ${failed} failed.\n`)
  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
