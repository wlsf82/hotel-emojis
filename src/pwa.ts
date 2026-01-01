export function registerSW() {
  // VitePWA injects the registration helper at build time.
  // In dev it won't register a SW unless you enable it explicitly.
  // This keeps behavior predictable.
  if (import.meta.env.DEV) return

  // @ts-expect-error - injected by vite-plugin-pwa
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      immediate: true
    })
  })
}
