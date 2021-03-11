import { pipe } from "@effect-ts/core/Function"
import React from "react"

export default function Home() {
  const [base, setBase] = React.useState(0)
  return (
    <div>
      {pipe(base, n => n + 1, (n) => `n: ${n}`)}
      <button onClick={() => {
        setBase(base + 1)
      }}>next</button>
    </div>
  )
}
