// tracing: off

import * as T from "@effect-ts/core/Effect"
import { intersect } from "@effect-ts/core/Utils"

import { ArtworkDataSource, artworkServerDataSource } from "./DataSources"
import { ArtworkRepo, makeArtworkRepo } from "./Repositories"

export const serverRuntime = T.defaultRuntime.withEnvironment((defEnv) =>
  intersect(
    defEnv,
    ArtworkRepo.of(makeArtworkRepo()),
    ArtworkDataSource.of({ artworkDataSource: artworkServerDataSource })
  )
)
