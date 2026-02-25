import {
  EmailEvent,
  UserProfile,
  RecipientInteraction,
  SentEmail,
  SentEmailsApiResponse,
  OpenDetail,
} from "./types";

/**
 * Your Staffbase API Token.
 */
const API_TOKEN =
  "NjdkODIyMmZkMWNjMTA1ODI4NGJlN2EzOlY2ZypsMjtGe20ydVZDXVUse0JVKE5Db1pMe3txVEMoNkN5TnApLWYoMjNXSCxvaDdYRlMwSSp0K3lfNm8yXzM=";

/**
 * Reusable wrapper for fetch that uses Basic Authentication.
 */
const authenticatedFetch = async (url: string) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      // Switched to Basic per your requirement for the Studio Secret
      Authorization: `Basic ${API_TOKEN.trim()}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `API request failed: ${response.status} ${errorData.message || response.statusText} for ${url}`,
    );
  }
  return response;
};

/**
 * Fetches interaction events for a specific email.
 */
export const fetchAndParseEmailEvents = async (
  domain: string,
  emailId: string,
  since: string,
  until: string,
): Promise<EmailEvent[]> => {
  // Safety guard to prevent fetching 'undefined' or empty IDs
  if (
    !emailId ||
    emailId === "undefined" ||
    emailId === "dummy" ||
    emailId.length < 5
  )
    return [];

  const baseUrl = `https://${domain}`;
  const url = `${baseUrl}/api/email-performance/${emailId}/events?since=${since}&until=${until}`;
  const response = await authenticatedFetch(url);
  const textData = await response.text();

  return textData
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
};

const userProfileCache = new Map<string, UserProfile>();

const fetchUserProfile = async (
  domain: string,
  userId: string,
): Promise<UserProfile> => {
  if (userProfileCache.has(userId)) return userProfileCache.get(userId)!;
  const baseUrl = `https://${domain}`;
  const url = `${baseUrl}/api/profiles/public/${userId}`;
  const response = await authenticatedFetch(url);
  const user = await response.json();
  userProfileCache.set(userId, user);
  return user;
};

/**
 * Fetches the list of all sent emails using the modernized endpoint.
 */
export const getAllSentEmails = async (
  domain: string,
  limit: number,
): Promise<SentEmail[]> => {
  const baseUrl = `https://${domain}`;
  // Corrected modern endpoint path
  const url = `${baseUrl}/api/email-performance/emails?limit=${limit}`;
  const response = await authenticatedFetch(url);
  const result: SentEmailsApiResponse = await response.json();

  // Defensive mapping to handle missing 'sender' data from the API
  return (result.data || []).map((email) => ({
    ...email,
    sender: email.sender?.name ? email.sender : { name: "Internal System" },
  }));
};

/**
 * Logic to decide between dummy data (fallback) and live API data.
 */
export const getSentEmailsData = async (
  domain: string,
  limit: number,
): Promise<SentEmail[]> => {
  if (domain.toLowerCase().includes("dummy")) return getDummySentEmails();
  try {
    const emails = await getAllSentEmails(domain, limit);
    return emails.length > 0 ? emails : [];
  } catch (error) {
    console.error(
      "Failed to fetch live emails. Falling back to dummy data.",
      error,
    );
    return getDummySentEmails();
  }
};

/**
 * Processes raw events into recipient interactions.
 */
const processEvents = async (
  domain: string,
  events: EmailEvent[],
): Promise<RecipientInteraction[]> => {
  if (!events || events.length === 0) return [];
  const eventsByUser = new Map<string, EmailEvent[]>();
  for (const event of events) {
    const userId = event.eventSubject.match(/user\/(.*)/)?.[1];
    if (userId) {
      if (!eventsByUser.has(userId)) eventsByUser.set(userId, []);
      eventsByUser.get(userId)!.push(event);
    }
  }
  const userProfiles = await Promise.all(
    Array.from(eventsByUser.keys()).map((id) =>
      fetchUserProfile(domain, id).catch(() => null),
    ),
  );
  const userProfileMap = new Map(
    userProfiles.filter(Boolean).map((p) => [p!.id, p!]),
  );
  const recipientInteractions: RecipientInteraction[] = [];
  for (const [userId, userEvents] of eventsByUser.entries()) {
    const userProfile = userProfileMap.get(userId);
    if (!userProfile) continue;
    userEvents.sort(
      (a, b) =>
        new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime(),
    );
    const interaction: RecipientInteraction = {
      user: userProfile,
      sentTime: null,
      wasOpened: false,
      opens: [],
    };
    let lastOpenDetail: OpenDetail | null = null;
    for (const event of userEvents) {
      if (event.eventType === "sent") interaction.sentTime = event.eventTime;
      else if (event.eventType === "open") {
        interaction.wasOpened = true;
        lastOpenDetail = { openTime: event.eventTime, clicks: [] };
        interaction.opens.push(lastOpenDetail);
      } else if (
        event.eventType === "click" &&
        lastOpenDetail &&
        event.eventTarget
      ) {
        lastOpenDetail.clicks.push({
          clickTime: event.eventTime,
          targetUrl: event.eventTarget,
        });
      }
    }
    recipientInteractions.push(interaction);
  }
  return recipientInteractions.sort((a, b) =>
    a.user.lastName.localeCompare(b.user.lastName),
  );
};

export const getDummySentEmails = (): SentEmail[] => {
  return [
    {
      id: "dummy1",
      title: "Live Connection Failed (Showing Fallback)",
      thumbnailUrl: null,
      sentAt: new Date().toISOString(),
      sender: { name: "System" },
    },
  ];
};

export const getDummyData = (): RecipientInteraction[] => [];

export const getEmailPerformanceData = async (
  emailId: string | undefined,
  domain: string,
  since: string,
  until: string,
): Promise<RecipientInteraction[]> => {
  if (!emailId || emailId.toLowerCase().includes("dummy"))
    return getDummyData();
  try {
    const events = await fetchAndParseEmailEvents(
      domain,
      emailId,
      since,
      until,
    );
    return events.length > 0 ? processEvents(domain, events) : [];
  } catch (error) {
    return getDummyData();
  }
};
