// Instagram Graph API client for PotolokAI auto-posting
// Docs: https://developers.facebook.com/docs/instagram-platform/content-publishing/

const GRAPH_API = "https://graph.instagram.com/v21.0";
const GRAPH_FB_API = "https://graph.facebook.com/v21.0";

// ─────────────────────────────────────────────────────
// Token management
// ─────────────────────────────────────────────────────

/** Exchange short-lived token for a 60-day long-lived token */
export async function getLongLivedToken(shortToken: string): Promise<{
  token: string;
  expiresIn: number;
}> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) throw new Error("INSTAGRAM_APP_ID/SECRET not set");

  const url = new URL(`${GRAPH_FB_API}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error) {
    throw new Error(`Token exchange failed: ${data.error.message}`);
  }

  return {
    token: data.access_token,
    expiresIn: data.expires_in || 5184000, // 60 days default
  };
}

/** Refresh a long-lived token (must be done before expiry) */
export async function refreshToken(token: string): Promise<{
  token: string;
  expiresIn: number;
}> {
  const url = new URL(`${GRAPH_FB_API}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", process.env.INSTAGRAM_APP_ID || "");
  url.searchParams.set("client_secret", process.env.INSTAGRAM_APP_SECRET || "");
  url.searchParams.set("fb_exchange_token", token);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error.message}`);
  }

  return {
    token: data.access_token,
    expiresIn: data.expires_in || 5184000,
  };
}

// ─────────────────────────────────────────────────────
// Account info
// ─────────────────────────────────────────────────────

export async function getAccountInfo(
  userId: string,
  token: string
): Promise<{ id: string; username: string; mediaCount: number }> {
  const res = await fetch(
    `${GRAPH_API}/${userId}?fields=id,username,media_count&access_token=${token}`
  );
  const data = await res.json();
  if (data.error) throw new Error(`Account info failed: ${data.error.message}`);
  return {
    id: data.id,
    username: data.username,
    mediaCount: data.media_count || 0,
  };
}

// ─────────────────────────────────────────────────────
// Publishing — Single image
// ─────────────────────────────────────────────────────

/** Create a single image media container */
export async function createImageContainer(
  userId: string,
  token: string,
  imageUrl: string,
  caption?: string
): Promise<string> {
  const body: Record<string, string> = {
    image_url: imageUrl,
    access_token: token,
  };
  if (caption) body.caption = caption;

  const res = await fetch(`${GRAPH_API}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Create image container failed: ${data.error.message}`);
  return data.id;
}

// ─────────────────────────────────────────────────────
// Publishing — Carousel
// ─────────────────────────────────────────────────────

/** Create a carousel child item (no caption on individual items) */
export async function createCarouselItem(
  userId: string,
  token: string,
  imageUrl: string
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_url: imageUrl,
      is_carousel_item: true,
      access_token: token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Create carousel item failed: ${data.error.message}`);
  return data.id;
}

/** Create a carousel container from child IDs */
export async function createCarouselContainer(
  userId: string,
  token: string,
  childrenIds: string[],
  caption: string
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "CAROUSEL",
      children: childrenIds,
      caption,
      access_token: token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Create carousel container failed: ${data.error.message}`);
  return data.id;
}

// ─────────────────────────────────────────────────────
// Publishing — Publish
// ─────────────────────────────────────────────────────

/** Check if a media container is ready for publishing */
export async function checkContainerStatus(
  containerId: string,
  token: string
): Promise<"IN_PROGRESS" | "FINISHED" | "ERROR"> {
  const res = await fetch(
    `${GRAPH_API}/${containerId}?fields=status_code&access_token=${token}`
  );
  const data = await res.json();
  if (data.error) throw new Error(`Check status failed: ${data.error.message}`);
  return data.status_code || "IN_PROGRESS";
}

/** Publish a media container (single image or carousel) */
export async function publishMedia(
  userId: string,
  token: string,
  containerId: string
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${userId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Publish failed: ${data.error.message}`);
  return data.id; // Instagram media ID
}

/** Wait for container to be ready, then publish */
export async function waitAndPublish(
  userId: string,
  token: string,
  containerId: string,
  maxRetries = 10
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const status = await checkContainerStatus(containerId, token);
    console.log(`[Instagram] Container ${containerId} status: ${status} (attempt ${i + 1}/${maxRetries})`);
    if (status === "FINISHED") {
      return await publishMedia(userId, token, containerId);
    }
    if (status === "ERROR") {
      throw new Error("Container processing failed on Instagram side — check media format/size");
    }
    // Wait 5 seconds between checks (videos need more time)
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Container not ready after ${maxRetries} retries (${maxRetries * 5}s)`);
}

// ─────────────────────────────────────────────────────
// Publishing — Video
// ─────────────────────────────────────────────────────

/** Create a video carousel child item */
export async function createVideoCarouselItem(
  userId: string,
  token: string,
  videoUrl: string
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "VIDEO",
      video_url: videoUrl,
      is_carousel_item: true,
      access_token: token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Create video carousel item failed: ${data.error.message}`);
  return data.id;
}

/** Create a single video container (Reels) */
export async function createVideoContainer(
  userId: string,
  token: string,
  videoUrl: string,
  caption: string
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${userId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      access_token: token,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Create video container failed: ${data.error.message}`);
  return data.id;
}

// ─────────────────────────────────────────────────────
// High-level: publish a post (photos, videos, or mix)
// ─────────────────────────────────────────────────────

export async function publishCarouselPost(
  userId: string,
  token: string,
  mediaUrls: string[],
  caption: string,
  mediaTypes?: ("photo" | "video")[]
): Promise<string> {
  if (mediaUrls.length === 0) throw new Error("No media provided");

  const types = mediaTypes || mediaUrls.map(() => "photo" as const);

  // Single image → simple image post
  if (mediaUrls.length === 1 && types[0] === "photo") {
    const containerId = await createImageContainer(userId, token, mediaUrls[0], caption);
    return await waitAndPublish(userId, token, containerId);
  }

  // Single video → Reels
  if (mediaUrls.length === 1 && types[0] === "video") {
    const containerId = await createVideoContainer(userId, token, mediaUrls[0], caption);
    return await waitAndPublish(userId, token, containerId, 20); // Videos take longer
  }

  // Carousel: create child items (photos and videos)
  const childIds: string[] = [];
  for (let i = 0; i < mediaUrls.length; i++) {
    if (types[i] === "video") {
      const childId = await createVideoCarouselItem(userId, token, mediaUrls[i]);
      childIds.push(childId);
    } else {
      const childId = await createCarouselItem(userId, token, mediaUrls[i]);
      childIds.push(childId);
    }
  }

  // Create carousel container
  const carouselId = await createCarouselContainer(userId, token, childIds, caption);

  // Wait and publish (carousel with video takes longer)
  const hasVideo = types.includes("video");
  return await waitAndPublish(userId, token, carouselId, hasVideo ? 20 : 10);
}
