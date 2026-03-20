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

/**
 * Represents a single raw interaction event from the API (e.g., sent, open, click).
 */
export interface EmailEvent {
  id: string;
  emailId: string;
  eventSubject: string; // The entity that performed the action, e.g., "user/123"
  eventTime: string; // ISO 8601 date string
  eventType: "sent" | "open" | "click";
  eventTarget?: string; // e.g., the URL that was clicked
}

/**
 * Represents the public profile of a user.
 */
export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null; // Can be null if no avatar is set
  position: string | null; // Can be null if no position is set
  department: string | null; // Can be null if no department is set
  location: string | null; // Can be null if no location is set
  publicEmailAddress: string | null; // Can be null if no public email is set
  phoneNumber: string | null; // Can be null if no phone number is set
  system_manager: string | null; // Can be null if no system manager is set
}

/**
 * Represents the details of a single link click within an email.
 */
export interface ClickDetail {
  clickTime: string; // ISO 8601 date string
  targetUrl: string;
}

/**
 * Represents the details of a single email open, including any subsequent clicks.
 */
export interface OpenDetail {
  openTime: string; // ISO 8601 date string
  clicks: ClickDetail[];
}

/**
 * Represents the processed interaction data for a single recipient,
 * combining all their events into a structured timeline.
 */
export interface RecipientInteraction {
  user: UserProfile;
  sentTime: string | null;
  wasOpened: boolean;
  opens: OpenDetail[];
}

/**
 * Represents the metadata for a single email retrieved from the sent emails list.
 */
export interface SentEmail {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  sentAt: string; // ISO 8601 date string
  sender: {
    name: string;
  };
  targetAudience?: {
    totalRecipients: number;
  };
}

/**
 * Represents the structure of the API response for the sent emails endpoint.
 */
export interface SentEmailsApiResponse {
  data: SentEmail[];
}