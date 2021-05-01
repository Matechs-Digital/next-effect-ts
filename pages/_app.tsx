import "nprogress/nprogress.css"

import type { AppProps } from "next/app"
import { useRouter } from "next/router"
import NProgress from "nprogress"
import { useEffect } from "react"

function App({ Component, pageProps }: AppProps) {
  const router = useRouter()

  useEffect(() => {
    const routeChangeStart = () => NProgress.start()
    const routeChangeComplete = () => NProgress.done()

    router.events.on("routeChangeStart", routeChangeStart)
    router.events.on("routeChangeComplete", routeChangeComplete)
    router.events.on("routeChangeError", routeChangeComplete)
    return () => {
      router.events.off("routeChangeStart", routeChangeStart)
      router.events.off("routeChangeComplete", routeChangeComplete)
      router.events.off("routeChangeError", routeChangeComplete)
    }
  }, [])

  return <Component {...pageProps} />
}

export default App
