exports.handler = async (event, context) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    };
  }

  const incomingPath = event.path
    .replace("/.netlify/functions/api", "")
    .replace("/api", "");

  // Handle image proxy requests via query parameter ?imageUrl=...
  const queryParams = event.queryStringParameters || {};
  if (queryParams.imageUrl) {
    const imageUrl = decodeURIComponent(queryParams.imageUrl);

    console.log("[Proxy] Image URL:", imageUrl);

    try {
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent": "MangaDex-Static-Client/1.0",
          Referer: "https://mangadex.org/",
        },
      });

      if (!response.ok) {
        return {
          statusCode: response.status,
          body: JSON.stringify({ error: "Image not found" }),
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
          },
        };
      }

      const imageBuffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") || "image/jpeg";

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
        body: Buffer.from(imageBuffer).toString("base64"),
        isBase64Encoded: true,
      };
    } catch (error) {
      console.error("Image proxy error:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to fetch image" }),
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      };
    }
  }

  // Use multiValueQueryStringParameters to preserve array params like includes[]
  const params = event.multiValueQueryStringParameters || {};
  const singleParams = event.queryStringParameters || {};

  const queryPairs = [];

  // Handle multi-value params (arrays)
  Object.entries(params).forEach(([key, values]) => {
    if (Array.isArray(values)) {
      values.forEach((value) =>
        queryPairs.push(
          `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
        ),
      );
    } else {
      queryPairs.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(values)}`,
      );
    }
  });

  // Handle single-value params not in multiValue
  Object.entries(singleParams).forEach(([key, value]) => {
    if (!params[key]) {
      queryPairs.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
      );
    }
  });

  const queryString = queryPairs.length > 0 ? `?${queryPairs.join("&")}` : "";

  const mangadexUrl = `https://api.mangadex.org${incomingPath}${queryString}`;

  console.log("[Proxy] URL:", mangadexUrl);

  try {
    const response = await fetch(mangadexUrl, {
      headers: {
        "User-Agent": "MangaDex-Static-Client/1.0",
      },
    });

    const data = await response.text();

    return {
      statusCode: response.status,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
      body: data,
    };
  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch from MangaDex API" }),
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    };
  }
};
