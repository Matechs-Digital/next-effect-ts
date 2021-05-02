import type * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import type { Has } from "@effect-ts/core/Has"
import * as RE from "@effect-ts/react"

import type { ArtworkDataSource } from "./DataSources"
import { ClientArtworkDataSource } from "./DataSources"
import type { ArtworkRepo } from "./Repositories"
import { LiveArtworkRepo } from "./Repositories"

//
// App
//

export const App = RE.makeApp<
  Has<ArtworkRepo> & Has<ArtworkDataSource> & T.DefaultEnv
>()

export const ClientEnv = L.identity<T.DefaultEnv>()["+++"](
  LiveArtworkRepo["+++"](ClientArtworkDataSource)
)
