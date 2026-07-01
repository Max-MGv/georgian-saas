import { getPlatformConfig } from '@/app/actions/platform'
import PlatformSettingsClient from './PlatformSettingsClient'

export default async function PlatformSettingsPage() {
  const config = await getPlatformConfig()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-semibold" style={{ color: '#f1f5f9' }}>Platform Settings</h1>
        <p className="text-sm mt-1" style={{ color: '#64748b' }}>
          Global settings that apply across all tenants.
        </p>
      </div>

      <PlatformSettingsClient
        logoUrl={config?.logoUrl ?? null}
        logoAlt={config?.logoAlt ?? ''}
      />
    </div>
  )
}
