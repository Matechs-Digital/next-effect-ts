// tracing: off

import type * as T from "@effect-ts/core/Effect"
import type { Has } from "@effect-ts/core/Has"

import { createApp } from "../goods/appEnvironmet"
import type { ArtworkDataSource } from "./DataSources"
import type { ArtworkRepo } from "./Repositories"

//
// App
//

export const App = createApp<Has<ArtworkRepo> & Has<ArtworkDataSource> & T.DefaultEnv>()
