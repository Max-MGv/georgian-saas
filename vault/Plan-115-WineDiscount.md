---
tags: [plan, feature-115]
---

# Plan: Feature #115 — Company wine % discount

Progress tracker. If context runs out mid-task, resume here.

## Steps

- [x] 1. Create this file
- [x] 2. `schema.prisma` — add `wineDiscountPercent Float?` to Company, `discountPercent Float?` to WineOrder
- [x] 3. `prisma db push`
- [x] 4. `actions/companies.ts` — add field to CompanyProfile / updateCompany / verifyCompanyCode / findCompanyByCode
- [x] 5. `actions/submitWineOrder.ts` — read discountPercent, apply to total, store
- [x] 6. `admin/(panel)/companies/page.tsx` — pass wineDiscountPercent to CompaniesClient
- [x] 7. `admin/(panel)/companies/CompaniesClient.tsx` — discount field in EditPanel + Wine Orders expanded view
- [x] 8. `(site)/wines/page.tsx` — include wineDiscountPercent in company select
- [x] 9. `(site)/wines/WineCatalogueClient.tsx` — discount state, struck-through total, hidden field
- [x] 10. `admin/(panel)/wine-orders/WineOrdersClient.tsx` — discountPercent type + −X% badge
- [x] 11. `admin/(panel)/wine-orders/page.tsx` — pass discountPercent in ordersWithTotal
- [x] 12. Update vault docs (SessionLog, FeatureLog, MyToDo — Roadmap had no #115 entry)
- [ ] 13. Git commit
