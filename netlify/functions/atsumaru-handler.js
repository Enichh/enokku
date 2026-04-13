const AtsumaruScraper = require("./atsumaru");

const scraper = new AtsumaruScraper();

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const path = event.path
    .replace("/.netlify/functions/atsumaru", "")
    .replace("/atsumaru", "");
  const params = event.queryStringParameters || {};

  try {
    switch (path) {
      case "/search":
        if (!params.q) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Query parameter 'q' required" }),
          };
        }
        const searchResults = await scraper.searchManga(
          params.q,
          parseInt(params.limit) || 10,
        );
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ results: searchResults }),
        };

      case "/manga":
        if (!params.id) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Parameter 'id' required" }),
          };
        }
        const manga = await scraper.getMangaDetails(params.id);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(manga),
        };

      case "/chapter":
        if (!params.mangaId || !params.chapterId) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: "Parameters 'mangaId' and 'chapterId' required",
            }),
          };
        }
        const chapter = await scraper.getChapterPages(
          params.mangaId,
          params.chapterId,
        );
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(chapter),
        };

      case "/find":
        if (!params.title) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Parameter 'title' required" }),
          };
        }
        const found = await scraper.findMangaByTitle(params.title);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ result: found }),
        };

      case "/library":
        const library = await scraper.getLibrary();
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ items: library }),
        };

      default:
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: "Unknown endpoint" }),
        };
    }
  } catch (error) {
    console.error("[Atsumaru Function] Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
