const WeebCentralScraper = require("./weebcentral");

const scraper = new WeebCentralScraper();

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

  const path = event.path.replace("/.netlify/functions/weebcentral", "").replace("/weebcentral", "");
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
        const searchResults = await scraper.searchManga(params.q, parseInt(params.limit) || 10);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ results: searchResults }),
        };

      case "/manga":
        if (!params.url) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Parameter 'url' required" }),
          };
        }
        const manga = await scraper.getMangaDetails(params.url);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(manga),
        };

      case "/chapters":
        if (!params.url) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Parameter 'url' required" }),
          };
        }
        const chapters = await scraper.getChapters(params.url);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ chapters }),
        };

      case "/pages":
        if (!params.url) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "Parameter 'url' required" }),
          };
        }
        const pages = await scraper.getChapterPages(params.url);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ pages }),
        };

      case "/latest":
        const updates = await scraper.getLatestUpdates(parseInt(params.limit) || 20);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ updates }),
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

      default:
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: "Unknown endpoint" }),
        };
    }
  } catch (error) {
    console.error("[WeebCentral Function] Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
