import "nprogress/nprogress.css"

import type * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import * as RDS from "@effect-ts/react/DataSource"
import type { AppProps } from "next/app"
import { useRouter } from "next/router"
import NProgress from "nprogress"
import * as React from "react"
import { useEffect } from "react"

import { AppEnv } from "../src/AppEnv"
import { artworkClientDataSource, ClientArtworkDataSource } from "../src/DataSources"
import { LiveArtworkRepo } from "../src/Repositories"

function ExtendedApp({ Component, pageProps }: AppProps) {
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

  return (
    <RDS.Provider env={AppEnv} sources={[artworkClientDataSource]}>
      <AppEnv.Provider
        layer={L.identity<T.DefaultEnv>()["+++"](
          LiveArtworkRepo["+++"](ClientArtworkDataSource)
        )}
      >
        <Component {...pageProps} />
      </AppEnv.Provider>
    </RDS.Provider>
  )
}

export default ExtendedApp
