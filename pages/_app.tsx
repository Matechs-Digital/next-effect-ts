import "../styles/globals.css"

import React from "react"

import { LiveServiceContext } from "../context"

function MyApp({ Component, pageProps }: any) {
  return (
    <LiveServiceContext>
      <Component {...pageProps} />
    </LiveServiceContext>
  )
}

export default MyApp
