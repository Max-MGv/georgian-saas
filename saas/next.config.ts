import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js rejects any Server Action request body over 1 MB by default, before
  // the action even runs - so every upload that went through one (bug-report
  // screenshots, logos, favicons, backgrounds, wine photos) silently failed with
  // "Something went wrong" once the file passed ~1 MB, whatever the action's own
  // size check said. Real screenshots are usually 1-4 MB. 4.4mb leaves room for
  // a file at the 4 MB cap plus form fields, and stays under Vercel's own ~4.5 MB
  // request-body limit, which no config can raise (KnownBugs #72).
  experimental: {
    serverActions: { bodySizeLimit: '4.4mb' },
  },
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
