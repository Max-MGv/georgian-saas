import { redirect } from 'next/navigation'

// "Masterclass" became "Add-ons" (T-7, Plan-AddOnsAndWine): masterclass is now one group of add-ons. Old bookmarks,
// emails and the onboarding wizard's links keep working.
export default function MasterclassRedirect() {
  redirect('/admin/add-ons')
}
