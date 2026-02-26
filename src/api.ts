/*!
 * Copyright 2024, Staffbase GmbH and contributors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  EmailEvent,
  UserProfile,
  RecipientInteraction,
  SentEmail,
  SentEmailsApiResponse,
  OpenDetail,
} from "./types";

/**
 * A reusable, authenticated wrapper for the native `fetch` function.
 * @param url The API endpoint to fetch.
 * @param apiKey The dynamic Staffbase API Token (Studio Secret).
 * @returns A Promise that resolves to the Response object if the request is successful.
 * @throws An error if the network response has a non-2xx status code.
 */
const authenticatedFetch = async (url: string, apiKey: string) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${apiKey.trim()}`,
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
 * Fetches and parses the newline-delimited JSON stream of email interaction events.
 * @param apiKey The dynamic Staffbase API Token.
 * @param domain The Staffbase instance domain.
 * @param emailId The ID of the specific email to fetch performance data for.
 * @param since The start of the date range in ISO format.
 * @param until The end of the date range in ISO format.
 * @returns A promise resolving to an array of `EmailEvent` objects.
 */
const fetchAndParseEmailEvents = async (
  apiKey: string,
  domain: string,
  emailId: string,
  since: string,
  until: string,
): Promise<EmailEvent[]> => {
  // Defensive guard against malformed or missing IDs that trigger 400 errors
  if (
    !emailId ||
    emailId === "undefined" ||
    emailId === "dummy" ||
    emailId.length < 5
  ) {
    return [];
  }

  const baseUrl = `https://${domain}`;
  const url = `${baseUrl}/api/email-performance/${emailId}/events?since=${since}&until=${until}`;
  const response = await authenticatedFetch(url, apiKey);
  const textData = await response.text();

  return textData
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
};

// A simple in-memory cache implemented as a Map. This prevents the application from
// repeatedly fetching the same user's profile during a single session, reducing API calls.
const userProfileCache = new Map<string, UserProfile>();

/**
 * Fetches a user's public profile information, utilizing an in-memory cache to avoid redundant requests.
 * @param apiKey The dynamic Staffbase API Token.
 * @param domain The Staffbase instance domain.
 * @param userId The ID of the user whose profile is being requested.
 * @returns A promise resolving to a `UserProfile` object.
 */
const fetchUserProfile = async (
  apiKey: string,
  domain: string,
  userId: string,
): Promise<UserProfile> => {
  if (userProfileCache.has(userId)) {
    return userProfileCache.get(userId)!;
  }
  const baseUrl = `https://${domain}`;
  const url = `${baseUrl}/api/profiles/public/${userId}`;
  const response = await authenticatedFetch(url, apiKey);
  const user = await response.json();
  userProfileCache.set(userId, user);
  return user;
};

/**
 * Fetches a list of all recently sent emails for the email list view.
 * @param apiKey The dynamic Staffbase API Token.
 * @param domain The Staffbase instance domain.
 * @param limit The maximum number of emails to retrieve from the API.
 * @returns A promise resolving to an array of `SentEmail` objects.
 */
const getAllSentEmails = async (
  apiKey: string,
  domain: string,
  limit: number,
): Promise<SentEmail[]> => {
  const baseUrl = `https://${domain}`;
  // Updated to the modern email-performance endpoint
  const url = `${baseUrl}/api/email-performance/emails?limit=${limit}`;
  const response = await authenticatedFetch(url, apiKey);
  const result: SentEmailsApiResponse = await response.json();

  // Defensive mapping: ensures a sender object exists to prevent crashes on 'Internal System' emails
  return (result.data || []).map((email) => ({
    ...email,
    sender: email.sender?.name ? email.sender : { name: "Internal System" },
  }));
};

/**
 * Provides a static list of dummy emails with recent dates. This data is used for development
 * or as a fallback if the API call fails, ensuring the component is still demoable.
 */
export const getDummySentEmails = (): SentEmail[] => {
  console.warn("Using dummy data for sent emails list.");
  const now = new Date();
  const recentDate = (daysAgo: number) =>
    new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: "dummy-email-1",
      title: "The Heart Behind the Care 💙",
      thumbnailUrl: null,
      sentAt: recentDate(2),
      sender: { name: "Marcus Barlow" },
    },
    {
      id: "dummy-email-2",
      title: "Weekly Newsletter",
      thumbnailUrl: null,
      sentAt: recentDate(7),
      sender: { name: "Nicole Adams" },
    },
    {
      id: "dummy-email-3",
      title: "Townhall Briefing",
      thumbnailUrl: null,
      sentAt: recentDate(10),
      sender: { name: "Nicole Adams" },
    },
    {
      id: "dummy-email-4",
      title: "Monthly Newsletter",
      thumbnailUrl: null,
      sentAt: recentDate(15),
      sender: { name: "Nicole Adams" },
    },
    {
      id: "dummy-email-5",
      title: "Another Weekly Newsletter",
      thumbnailUrl: null,
      sentAt: recentDate(21),
      sender: { name: "Nicole Adams" },
    },
    {
      id: "dummy-email-6",
      title: "Summer Volunteering Opportunities",
      thumbnailUrl: null,
      sentAt: recentDate(25),
      sender: { name: "Nicole Adams" },
    },
  ];
};

/**
 * The primary public function for retrieving the list of sent emails. It acts as a robust
 * wrapper that attempts to fetch live data but falls back to dummy data on any error.
 * @param apiKey The dynamic Staffbase API Token.
 * @param domain The Staffbase instance domain.
 * @param limit The maximum number of emails to retrieve.
 * @returns A promise resolving to an array of `SentEmail` objects.
 */
export const getSentEmailsData = async (
  apiKey: string,
  domain: string,
  limit: number,
): Promise<SentEmail[]> => {
  if (!apiKey || domain.toLowerCase().includes("dummy")) {
    return getDummySentEmails();
  }
  try {
    const emails = await getAllSentEmails(apiKey, domain, limit);
    return emails.length > 0 ? emails : [];
  } catch (error) {
    console.error(
      "❗️ Failed to get sent emails list, returning dummy data as fallback.",
      error,
    );
    return getDummySentEmails();
  }
};

/**
 * Processes the raw, unordered event stream from the API into a structured, user-centric format.
 * This is a critical data transformation step.
 * @param apiKey The dynamic Staffbase API Token.
 * @param domain The Staffbase instance domain, needed to fetch user profiles.
 * @param events The raw array of `EmailEvent` objects.
 * @returns A promise resolving to a sorted array of `RecipientInteraction` objects.
 */
const processEvents = async (
  apiKey: string,
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
      fetchUserProfile(apiKey, domain, id).catch(() => null),
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

/**
 * Provides a static list of dummy recipient interactions for development or as a fallback.
 */
export const getDummyData = (): RecipientInteraction[] => {
  console.warn("Using dummy data for email performance widget.");
  return [
    {
      user: {
        id: "dummy1",
        firstName: "Nicole",
        lastName: "Adams",
        avatarUrl: "",
      },
      sentTime: "2025-09-16T10:05:01Z",
      wasOpened: true,
      opens: [
        {
          openTime: "2025-09-16T10:05:11Z",
          clicks: [
            {
              clickTime: "2025-09-16T10:05:15Z",
              targetUrl: "https://www.staffbase.com/blog/",
            },
            {
              clickTime: "2025-09-16T10:05:20Z",
              targetUrl: "https://www.staffbase.com/about-us/",
            },
          ],
        },
        { openTime: "2025-09-17T11:00:00Z", clicks: [] },
      ],
    },
    {
      user: {
        id: "dummy2",
        firstName: "Eira",
        lastName: "Topé",
        avatarUrl: "",
      },
      sentTime: "2025-09-15T14:29:55Z",
      wasOpened: true,
      opens: [{ openTime: "2025-09-15T14:30:00Z", clicks: [] }],
    },
    {
      user: {
        id: "dummy3",
        firstName: "Jean",
        lastName: "Kirstein",
        avatarUrl: "",
      },
      sentTime: "2025-09-14T09:00:10Z",
      wasOpened: false,
      opens: [],
    },
  ];
};

/**
 * The primary public function for retrieving detailed analytics for a single email.
 * @param apiKey The dynamic Staffbase API Token.
 * @param emailId The ID of the specific email to fetch performance data for.
 * @param domain The Staffbase instance domain.
 * @param since The start of the date range in ISO format.
 * @param until The end of the date range in ISO format.
 * @returns A promise resolving to an array of `RecipientInteraction` objects.
 */
export const getEmailPerformanceData = async (
  apiKey: string,
  emailId: string | undefined,
  domain: string,
  since: string,
  until: string,
): Promise<RecipientInteraction[]> => {
  if (!apiKey || !emailId || emailId.toLowerCase().includes("dummy")) {
    return getDummyData();
  }
  try {
    const events = await fetchAndParseEmailEvents(
      apiKey,
      domain,
      emailId,
      since,
      until,
    );
    return events.length > 0 ? processEvents(apiKey, domain, events) : [];
  } catch (error) {
    console.error(
      "❗️ Failed to get email performance data, returning dummy data as fallback.",
      error,
    );
    return getDummyData();
  }
};
