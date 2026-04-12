// MangaDex Tag ID Mappings
// These UUIDs correspond to content tags in the MangaDex API
// Source: https://api.mangadex.org/manga/tag

export const MANGADEX_TAGS = {
  // Content Ratings
  SAFE: "safe",
  SUGGESTIVE: "suggestive",
  EROTICA: "erotica",
  PORNOGRAPHIC: "pornographic",

  // Formats
  MANGA: "manga",
  MANHWA: "manhwa",
  MANHUA: "manhua",
  ONESHOT: "oneshot",
  DOUJINSHI: "doujinshi",

  // Genres
  ACTION: "391b0423-d847-456f-aff0-8b0cfc03066b",
  ADVENTURE: "87cc87cd-a395-47af-b27a-93258263bbc6",
  COMEDY: "4d32cc48-9f00-4cca-9b5a-a839f0764984",
  DRAMA: "b9af3a63-f058-46de-a9a0-e0c13906197a",
  FANTASY: "cdc58593-87dd-415e-bbc0-2ec27bf404cc",
  HORROR: "cdad7e68-1419-41dd-bdce-27753074a640",
  MAHOU_SHOUJO: "81c836c9-914a-4eca-867a-9c7b4d27a40c",
  MECHA: "50880a9d-5440-4732-878d-ea2ef0bb1858",
  MYSTERY: "ee968100-4191-4968-93d3-f82d72be7e32",
  PSYCHOLOGICAL: "3b60b75c-a2d7-4860-ab56-05f391bb889c",
  ROMANCE: "423e2eae-a7a2-4a8b-ac03-a8351462d71d",
  SCI_FI: "256c8bd9-4904-4360-bf4f-508a76d67183",
  SLICE_OF_LIFE: "e5301a23-ebd9-49dd-a0cb-2add944c7fe9",
  SPORTS: "69964a64-2f90-4d33-beeb-f3ed2875eb4c",
  SUPERHERO: "7064a261-a137-4d3a-8848-2b3858a97f44",
  THRILLER: "07251805-a27e-4d59-b488-f0bfbec15168",
  TRAGEDY: "f8f62932-27da-4fe4-8ee1-6779a88c5b77",

  // Demographics
  JOSEI: "a3c67850-4684-404e-9b7f-c69850ee5da6",
  SEINEN: "5920b825-4181-4a17-beeb-9918b0ff7a30",
  SHOUJO: "9e2ab298-f45e-4b1f-a0fd-475815e097a2",
  SHOUNEN: "4b33a77d-4d61-4d15-a6a0-70d0cf159bb6",
};

// Tag display names for UI
export const TAG_DISPLAY_NAMES = {
  [MANGADEX_TAGS.ACTION]: "Action",
  [MANGADEX_TAGS.ADVENTURE]: "Adventure",
  [MANGADEX_TAGS.COMEDY]: "Comedy",
  [MANGADEX_TAGS.DRAMA]: "Drama",
  [MANGADEX_TAGS.FANTASY]: "Fantasy",
  [MANGADEX_TAGS.HORROR]: "Horror",
  [MANGADEX_TAGS.MAHOU_SHOUJO]: "Mahou Shoujo",
  [MANGADEX_TAGS.MECHA]: "Mecha",
  [MANGADEX_TAGS.MYSTERY]: "Mystery",
  [MANGADEX_TAGS.PSYCHOLOGICAL]: "Psychological",
  [MANGADEX_TAGS.ROMANCE]: "Romance",
  [MANGADEX_TAGS.SCI_FI]: "Sci-Fi",
  [MANGADEX_TAGS.SLICE_OF_LIFE]: "Slice of Life",
  [MANGADEX_TAGS.SPORTS]: "Sports",
  [MANGADEX_TAGS.SUPERHERO]: "Superhero",
  [MANGADEX_TAGS.THRILLER]: "Thriller",
  [MANGADEX_TAGS.TRAGEDY]: "Tragedy",
  [MANGADEX_TAGS.JOSEI]: "Josei",
  [MANGADEX_TAGS.SEINEN]: "Seinen",
  [MANGADEX_TAGS.SHOUJO]: "Shoujo",
  [MANGADEX_TAGS.SHOUNEN]: "Shounen",
};

// Genre categories for organized display
export const GENRE_CATEGORIES = {
  GENRES: [
    MANGADEX_TAGS.ACTION,
    MANGADEX_TAGS.ADVENTURE,
    MANGADEX_TAGS.COMEDY,
    MANGADEX_TAGS.DRAMA,
    MANGADEX_TAGS.FANTASY,
    MANGADEX_TAGS.HORROR,
    MANGADEX_TAGS.MYSTERY,
    MANGADEX_TAGS.PSYCHOLOGICAL,
    MANGADEX_TAGS.ROMANCE,
    MANGADEX_TAGS.SCI_FI,
    MANGADEX_TAGS.SLICE_OF_LIFE,
    MANGADEX_TAGS.SPORTS,
    MANGADEX_TAGS.THRILLER,
  ],
  THEMES: [
    MANGADEX_TAGS.MAHOU_SHOUJO,
    MANGADEX_TAGS.MECHA,
    MANGADEX_TAGS.SUPERHERO,
    MANGADEX_TAGS.TRAGEDY,
  ],
  DEMOGRAPHICS: [
    MANGADEX_TAGS.SHOUNEN,
    MANGADEX_TAGS.SHOUJO,
    MANGADEX_TAGS.SEINEN,
    MANGADEX_TAGS.JOSEI,
  ],
};

// Content type mappings (originalLanguage)
export const CONTENT_TYPES = {
  ALL: "all",
  MANGA: "manga",    // Japanese (ja)
  MANHWA: "manhwa",  // Korean (ko)
  MANHUA: "manhua",  // Chinese (zh)
};

export const CONTENT_TYPE_LANGUAGES = {
  [CONTENT_TYPES.MANGA]: ["ja"],
  [CONTENT_TYPES.MANHWA]: ["ko"],
  [CONTENT_TYPES.MANHUA]: ["zh"],
};

// Status mappings
export const PUBLICATION_STATUS = {
  ONGOING: "ongoing",
  COMPLETED: "completed",
  HIATUS: "hiatus",
  CANCELLED: "cancelled",
};

// Sort options
export const SORT_OPTIONS = {
  RELEVANCE: "relevance",
  LATEST: "latest",
  TRENDING: "trending",
  RATING: "rating",
  NEWEST: "newest",
  ALPHABETICAL: "alphabetical",
};

export const SORT_API_PARAMS = {
  [SORT_OPTIONS.RELEVANCE]: {},
  [SORT_OPTIONS.LATEST]: { updatedAt: "desc" },
  [SORT_OPTIONS.TRENDING]: { followedCount: "desc" },
  [SORT_OPTIONS.RATING]: { rating: "desc" },
  [SORT_OPTIONS.NEWEST]: { createdAt: "desc" },
  [SORT_OPTIONS.ALPHABETICAL]: { title: "asc" },
};

// Content ratings
export const CONTENT_RATINGS = {
  SAFE: "safe",
  SUGGESTIVE: "suggestive",
  EROTICA: "erotica",
  PORNOGRAPHIC: "pornographic",
};