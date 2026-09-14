import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only. Lets Playwright's onboarding-wizard.spec.ts reach a second
  // tenant ("Test Onboarding Wizard") via its own domain, resolved locally
  // via a Chromium --host-resolver-rules flag scoped to that one test file
  // (see the spec file's own comment) — without touching DEFAULT_TENANT_ID,
  // which every other test/tenant on localhost depends on. Without this,
  // Next.js's dev-server cross-origin protection silently blocks the RSC/HMR
  // requests behind client-side navigation (e.g. the post-login redirect),
  // which looked like a login failure until traced to this. Has no effect
  // outside `next dev` — allowedDevOrigins is a dev-only guard.
  allowedDevOrigins: ['test-onboarding-wizard.invalid'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // `sharp` (app/actions/uploadImage.ts) is a native module — Next's build-time
  // file tracing doesn't pick up its platform-specific .node/.so binaries
  // automatically, which is exactly the deployed "Could not load the sharp
  // module using the linux-x64 runtime — ERR_DLOPEN_FAILED: libvips-cpp.so"
  // crash on every route whose server-action bundle includes uploadImage.ts
  // (/admin/wines, /admin/content, /admin/onboarding). Documented fix, see
  // node_modules/next/dist/docs/.../output.md "Common include patterns for
  // native/runtime assets".
  outputFileTracingIncludes: {
    '/*': ['node_modules/sharp/**/*', 'node_modules/@img/**/*'],
  },
};

export default nextConfig;
