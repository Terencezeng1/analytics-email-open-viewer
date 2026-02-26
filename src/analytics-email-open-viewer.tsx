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

import React, { ReactElement, useState, useEffect, useMemo } from "react";
import { BlockAttributes } from "widget-sdk";
import { getEmailPerformanceData, getSentEmailsData } from "./api";
import { RecipientInteraction, SentEmail } from "./types";
import { FaCaretRight, FaCaretLeft, FaFileCsv } from "react-icons/fa";
import { getScopedWidgetStyles } from "./styles";

// --- HELPERS --- //

/**
 * Formats a Date object into a `YYYY-MM-DDTHH:mm` string, which is the required format
 * for `<input type="datetime-local">` elements.
 * @param date The date to format.
 * @returns A formatted string.
 */
const toInputDateTimeString = (date: Date): string => {
  const pad = (num: number) => num.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/**
 * Creates a "now" date that is safely in the past (by 10 seconds). This prevents timing issues
 * where the client's request might be slightly ahead of the server's event logging, ensuring
 * that all recent events are included in the API query.
 * @returns A Date object set a few seconds in the past.
 */
const createSafeNow = (): Date => {
  const now = new Date();
  now.setSeconds(now.getSeconds() - 10);
  return now;
};

/**
 * Formats an ISO date string into a human-readable local date and time format (e.g., "Oct 14, 2025, 10:01 AM").
 * @param isoString The ISO date string to format.
 * @returns A localized, readable date-time string.
 */
const formatDisplayDateTime = (isoString: string): string => {
  return new Date(isoString).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

// --- COMPONENT PROPS --- //

/**
 * Defines the configuration properties (props) that can be passed to the main component from the Staffbase platform.
 */
export interface AnalyticsEmailOpenViewerProps extends BlockAttributes {
  apikey?: string; // Added apiKey to props
  emailid?: string;
  domain?: string;
  allemailsview?: boolean;
  emaillistlimit?: number;
  defaultemailpagesize?: number;
  defaultrecipientpagesize?: number;
  enablecsvdownload?: boolean;
}

// --- SUB-COMPONENTS --- //

/**
 * Displays a user's initials in a circular container as a fallback when their profile picture is unavailable.
 * It dynamically generates the initials from the user's first and last names.
 * @param firstName The user's first name.
 * @param lastName The user's last name.
 * @param className Optional CSS classes to apply to the container.
 */
const InitialsAvatar = ({
  firstName,
  lastName,
  className,
}: {
  firstName: string;
  lastName: string;
  className?: string;
}) => {
  // Safely gets the first character of the first and last name, creating the initials.
  const initials =
    `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase();
  return (
    <div className={`${className} user-avatar-placeholder`}>
      <span className="avatar-initials">{initials}</span>
    </div>
  );
};

/**
 * A placeholder SVG icon used when an email's thumbnail image is not available.
 */
const PlaceholderThumbnailIcon = ({ className }: { className?: string }) => (
  <div
    className={`${className} placeholder-thumbnail`}
    style={{
      backgroundColor: "#f0f0f0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 171 171"
      width="60%"
      height="60%"
    >
      <g>
        <circle cx="85.5" cy="85.5" r="85.5" fill="#e0e0e0" />
        <path
          d="M49.2,53.9,78.8,87a8.94,8.94,0,0,0,6.7,3,9.1,9.1,0,0,0,6.7-3l29.1-32.6a1.56,1.56,0,0,1,.8-.6,10.57,10.57,0,0,0-4-.8H52.9a10.06,10.06,0,0,0-3.9.8A.35.35,0,0,0,49.2,53.9Z"
          fill="#fff"
        />
        <path
          d="M126.5,58a1.8,1.8,0,0,1-.6.9l-29,32.5a15.38,15.38,0,0,1-11.4,5.1,15.54,15.54,0,0,1-11.4-5.1L44.6,58.3l-.2-.2A9.75,9.75,0,0,0,43,63.2V108a9.94,9.94,0,0,0,10,9.9h65a9.94,9.94,0,0,0,10-9.9V63.2a10.19,10.19,0,0,0-1.5-5.2"
          fill="#fff"
        />
      </g>
    </svg>
  </div>
);

/**
 * Renders a single row in the recipient performance table. It handles its own state for
 * expanding and collapsing to show detailed interaction information (opens and clicks).
 * @param interaction The full interaction data for a single recipient.
 */
const RecipientRow = ({
  interaction,
}: {
  interaction: RecipientInteraction;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isExpandable = interaction.sentTime || interaction.opens.length > 0;

  return (
    <>
      <tr
        className={`recipient-row ${isExpandable ? "expandable" : ""}`}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        <td>
          <div className="user-info">
            {interaction.user.avatarUrl ? (
              <img
                src={interaction.user.avatarUrl}
                alt={`${interaction.user.firstName} ${interaction.user.lastName}`}
                className="user-avatar"
              />
            ) : (
              <InitialsAvatar
                firstName={interaction.user.firstName}
                lastName={interaction.user.lastName}
                className="user-avatar"
              />
            )}
            <span>
              {interaction.user.firstName} {interaction.user.lastName}
            </span>
          </div>
        </td>
        <td>
          <div className="status-cell">
            {interaction.wasOpened ? (
              <span className="status-badge opened">
                Opened
                {interaction.opens.length > 1 && (
                  <span className="open-count">
                    ({interaction.opens.length}x)
                  </span>
                )}
              </span>
            ) : interaction.sentTime ? (
              <span className="status-badge sent">Sent</span>
            ) : (
              <span className="status-badge unknown">Unknown</span>
            )}
            {isExpandable && (
              <span className={`chevron ${isExpanded ? "expanded" : ""}`}>
                &#9654;
              </span>
            )}
          </div>
        </td>
      </tr>
      {isExpanded && isExpandable && (
        <tr className="details-row">
          <td colSpan={2}>
            <div className="details-container">
              <h4
                style={{
                  color: "#333",
                  fontSize: "1.15rem",
                  fontWeight: "bold",
                  paddingBottom: "0.7rem",
                }}
              >
                Interaction Details
              </h4>
              {interaction.sentTime && (
                <div className="detail-block">
                  <p>
                    <strong>Sent at:</strong>{" "}
                    {formatDisplayDateTime(interaction.sentTime)}
                  </p>
                </div>
              )}
              {interaction.opens.map((open, index) => (
                <div key={index} className="detail-block">
                  <p>
                    <strong>Opened at:</strong>{" "}
                    {formatDisplayDateTime(open.openTime)}
                  </p>
                  {open.clicks.length > 0 && (
                    <ul>
                      {open.clicks.map((click, cIndex) => (
                        <li key={cIndex}>
                          <strong>
                            Clicked link at{" "}
                            {formatDisplayDateTime(click.clickTime)}
                          </strong>
                          <a
                            href={click.targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {click.targetUrl}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// --- MAIN COMPONENT --- //

/**
 * The root component for the Email Open Analytics Viewer. It manages all state,
 * triggers data fetching, and renders either the list of emails or the detailed
 * performance view for a single email.
 */
export const AnalyticsEmailOpenViewer = ({
  apikey,
  emailid,
  domain = "app.staffbase.com",
  allemailsview = true,
  emaillistlimit = 100,
  defaultemailpagesize = 5,
  defaultrecipientpagesize = 5,
  enablecsvdownload = false,
}: AnalyticsEmailOpenViewerProps): ReactElement => {
  // A unique class name for the root container to scope all CSS styles.
  const WIDGET_SCOPE_CLASS = "individual-email-widget";

  // --- STATE MANAGEMENT (useState) --- //
  // Manages all dynamic data for the component.
  const [currentView, setCurrentView] = useState<"list" | "detail">(
    allemailsview ? "list" : "detail",
  );
  const [selectedEmailId, setSelectedEmailId] = useState<string | undefined>(
    allemailsview ? undefined : emailid,
  );
  const [allEmails, setAllEmails] = useState<SentEmail[]>([]);
  const [recipientData, setRecipientData] = useState<
    RecipientInteraction[] | null
  >(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [recipientSearchTerm, setRecipientSearchTerm] = useState("");
  const [emailListPage, setEmailListPage] = useState(0);
  const [recipientPage, setRecipientPage] = useState(0);
  const [emailsPerPage, setEmailsPerPage] = useState(defaultemailpagesize);
  const [recipientsPerPage, setRecipientsPerPage] = useState(
    defaultrecipientpagesize,
  );
  const [untilDate, setUntilDate] = useState(createSafeNow);
  const [sinceDate, setSinceDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [detailUntilDate, setDetailUntilDate] = useState(createSafeNow);
  const [detailSinceDate, setDetailSinceDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [emailStats, setEmailStats] = useState<{
    totalRecipients: number;
    totalOpens: number;
    uniqueOpens: number;
  } | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: "recipient" | "status" | null;
    direction: "ascending" | "descending" | "original";
  }>({ key: null, direction: "original" });

  // --- DERIVED STATE & CONSTANTS --- //
  const nowString = toInputDateTimeString(new Date());

  // --- SIDE EFFECTS (useEffect) --- //

  // This effect synchronizes the component's internal state with its props.
  // If the props from Staffbase change (e.g., `allemailsview`), the component's view will update accordingly.
  useEffect(() => {
    setCurrentView(allemailsview ? "list" : "detail");
    setSelectedEmailId(allemailsview ? undefined : emailid);
  }, [allemailsview, emailid]);

  // This is the primary data-fetching effect. It runs whenever the view changes or a new email is selected.
  // It determines whether to fetch the list of all sent emails or the detailed performance for one email.
  useEffect(() => {
    const fetchAllEmails = async () => {
      if (!apikey) {
        setError("Please provide an API Key in the widget settings.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await getSentEmailsData(apikey, domain, emaillistlimit);
        setAllEmails(result);
      } catch (err) {
        setError("Failed to fetch sent emails.");
        setAllEmails([]);
      } finally {
        setLoading(false);
      }
    };

    const fetchRecipientData = async (
      id: string,
      since: string,
      until: string,
    ) => {
      if (!apikey) {
        setError("Please provide an API Key in the widget settings.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setRecipientData(null);
      setRecipientSearchTerm("");
      setRecipientPage(0);
      try {
        const result = await getEmailPerformanceData(
          apikey,
          id,
          domain,
          since,
          until,
        );
        setRecipientData(result);
      } catch (err) {
        setError("Failed to fetch analytics data.");
      } finally {
        setLoading(false);
      }
    };

    if (currentView === "list" && allemailsview) {
      fetchAllEmails();
    } else if (currentView === "detail" && selectedEmailId) {
      fetchRecipientData(
        selectedEmailId,
        detailSinceDate.toISOString(),
        detailUntilDate.toISOString(),
      );
    } else {
      setLoading(false);
    }
  }, [
    apikey,
    domain,
    currentView,
    selectedEmailId,
    emaillistlimit,
    allemailsview,
    detailSinceDate,
    detailUntilDate,
  ]);

  // This effect calculates the summary statistics (recipients, unique opens, total opens) for the detail view.
  // It runs whenever the recipient data changes or a new email is selected.
  useEffect(() => {
    if (recipientData && selectedEmailId && allEmails.length > 0) {
      const selectedEmail = allEmails.find((e) => e.id === selectedEmailId);
      const totalRecipients =
        selectedEmail?.targetAudience?.totalRecipients ?? 0;
      const totalOpens = recipientData.reduce(
        (sum, interaction) => sum + interaction.opens.length,
        0,
      );
      const uniqueOpens = recipientData.filter(
        (interaction) => interaction.wasOpened,
      ).length;
      setEmailStats({ totalRecipients, totalOpens, uniqueOpens });
    } else if (selectedEmailId && allEmails.length > 0) {
      const selectedEmail = allEmails.find((e) => e.id === selectedEmailId);
      const totalRecipients =
        selectedEmail?.targetAudience?.totalRecipients ?? 0;
      setEmailStats({ totalRecipients, totalOpens: 0, uniqueOpens: 0 });
    } else {
      setEmailStats(null);
    }
  }, [recipientData, selectedEmailId, allEmails]);

  // --- EVENT HANDLERS --- //

  const handleEmailSelect = (id: string) => {
    const selectedEmail = allEmails.find((email) => email.id === id);
    if (!selectedEmail) return;

    const sentAtDate = new Date(selectedEmail.sentAt);
    const now = createSafeNow();
    const thirtyDaysInMillis = 30 * 24 * 60 * 60 * 1000;

    const newSince = new Date(sentAtDate.getTime() - 60 * 1000);
    const sentAtPlus30Days = new Date(
      sentAtDate.getTime() + thirtyDaysInMillis,
    );
    const newUntil = sentAtPlus30Days < now ? sentAtPlus30Days : now;

    setDetailSinceDate(newSince);
    setDetailUntilDate(newUntil);
    setSelectedEmailId(id);
    setCurrentView("detail");
  };

  const handleBackToList = () => {
    setSelectedEmailId(undefined);
    setCurrentView("list");
    setRecipientData(null);
    setSortConfig({ key: null, direction: "original" });
  };

  const handleDetailDateChange = (value: string, type: "since" | "until") => {
    const newDate = new Date(value);
    let since = type === "since" ? newDate : detailSinceDate;
    let until = type === "until" ? newDate : detailUntilDate;

    const thirtyDaysInMillis = 30 * 24 * 60 * 60 * 1000;
    if (until.getTime() - since.getTime() > thirtyDaysInMillis) {
      if (type === "since")
        until = new Date(since.getTime() + thirtyDaysInMillis);
      else since = new Date(until.getTime() - thirtyDaysInMillis);
    }
    setDetailSinceDate(since);
    setDetailUntilDate(until);
    setRecipientPage(0);
  };

  const handleSort = (key: "recipient" | "status") => {
    setSortConfig((prev) => {
      const isNewKey = prev.key !== key;
      if (key === "recipient") {
        if (isNewKey) return { key: "recipient", direction: "ascending" };
        if (prev.direction === "ascending")
          return { key: "recipient", direction: "descending" };
        return { key: null, direction: "original" };
      }
      if (key === "status") {
        if (isNewKey) return { key: "status", direction: "descending" };
        if (prev.direction === "descending")
          return { key: "status", direction: "ascending" };
        return { key: null, direction: "original" };
      }
      return { key: null, direction: "original" };
    });
    setRecipientPage(0);
  };

  const handleCsvExport = () => {
    if (!filteredRecipients || filteredRecipients.length === 0) {
      alert("No data available to export.");
      return;
    }

    const escapeCsvField = (field: any): string => {
      if (field === null || field === undefined) return '""';
      const stringField = String(field);
      return stringField.includes(",") ||
        stringField.includes('"') ||
        stringField.includes("\n")
        ? `"${stringField.replace(/"/g, '""')}"`
        : `"${stringField}"`;
    };

    const headers = [
      "First Name",
      "Last Name",
      "User ID",
      "Interaction Type",
      "Interaction Time",
      "Clicked URL",
    ];
    const csvRows = [headers.join(",")];

    for (const interaction of filteredRecipients) {
      const { user, sentTime, opens } = interaction;
      const baseRow = [
        escapeCsvField(user.firstName),
        escapeCsvField(user.lastName),
        escapeCsvField(user.id),
      ];
      if (sentTime)
        csvRows.push(
          [
            ...baseRow,
            '"Sent"',
            `"${formatDisplayDateTime(sentTime)}"`,
            '""',
          ].join(","),
        );
      for (const open of opens) {
        csvRows.push(
          [
            ...baseRow,
            '"Open"',
            `"${formatDisplayDateTime(open.openTime)}"`,
            '""',
          ].join(","),
        );
        for (const click of open.clicks) {
          csvRows.push(
            [
              ...baseRow,
              '"Click"',
              `"${formatDisplayDateTime(click.clickTime)}"`,
              escapeCsvField(click.targetUrl),
            ].join(","),
          );
        }
      }
    }

    const csvString = csvRows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const emailTitle = selectedEmailTitle
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    link.setAttribute("href", url);
    link.setAttribute("download", `email_performance_${emailTitle}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- PERFORMANCE OPTIMIZATIONS (useMemo) --- //

  const sortedRecipients = useMemo(() => {
    if (!recipientData) return [];
    const sortableData = [...recipientData];
    if (sortConfig.key && sortConfig.direction !== "original") {
      sortableData.sort((a, b) => {
        if (sortConfig.key === "recipient") {
          const nameA = `${a.user.firstName} ${a.user.lastName}`;
          const nameB = `${b.user.firstName} ${b.user.lastName}`;
          return sortConfig.direction === "ascending"
            ? nameA.localeCompare(nameB)
            : nameB.localeCompare(nameA);
        }
        if (sortConfig.key === "status") {
          const getStatusScore = (item: RecipientInteraction) =>
            item.wasOpened ? item.opens.length : item.sentTime ? 0 : -1;
          return sortConfig.direction === "descending"
            ? getStatusScore(b) - getStatusScore(a)
            : getStatusScore(a) - getStatusScore(b);
        }
        return 0;
      });
    }
    return sortableData;
  }, [recipientData, sortConfig]);

  const filteredEmails = useMemo(
    () =>
      allEmails.filter((email) => {
        const sent = new Date(email.sentAt);
        return sent >= sinceDate && sent <= untilDate;
      }),
    [allEmails, sinceDate, untilDate],
  );

  const filteredRecipients = sortedRecipients.filter((r) =>
    `${r.user.firstName} ${r.user.lastName}`
      .toLowerCase()
      .includes(recipientSearchTerm.toLowerCase()),
  );

  // --- PAGINATION LOGIC --- //
  const emailPageCount = Math.ceil(filteredEmails.length / emailsPerPage);
  const paginatedEmails = filteredEmails.slice(
    emailListPage * emailsPerPage,
    (emailListPage + 1) * emailsPerPage,
  );
  const recipientPageCount = Math.ceil(
    filteredRecipients.length / recipientsPerPage,
  );
  const paginatedRecipients = filteredRecipients.slice(
    recipientPage * recipientsPerPage,
    (recipientPage + 1) * recipientsPerPage,
  );
  const selectedEmailTitle = useMemo(
    () => allEmails.find((e) => e.id === selectedEmailId)?.title || "Email",
    [allEmails, selectedEmailId],
  );

  // --- RENDER LOGIC --- //
  return (
    <div className={WIDGET_SCOPE_CLASS}>
      <style>{getScopedWidgetStyles(WIDGET_SCOPE_CLASS)}</style>

      {loading && <div className="message-container">Loading...</div>}
      {error && <div className="message-container">{error}</div>}

      {!loading && !error && currentView === "list" && (
        <>
          <div className="widget-header list-view">
            <h3 className="widget-title">Sent Email Overview</h3>
            <div className="date-controls">
              <label htmlFor="sinceDate">From:</label>
              <input
                type="datetime-local"
                id="sinceDate"
                value={toInputDateTimeString(sinceDate)}
                onChange={(e) => {
                  setEmailListPage(0);
                  setSinceDate(new Date(e.target.value));
                }}
                max={nowString}
              />
              <label htmlFor="untilDate">To:</label>
              <input
                type="datetime-local"
                id="untilDate"
                value={toInputDateTimeString(untilDate)}
                onChange={(e) => {
                  setEmailListPage(0);
                  setUntilDate(new Date(e.target.value));
                }}
                max={nowString}
              />
            </div>
          </div>
          {paginatedEmails.length > 0 ? (
            <>
              <div className="email-list-container">
                {paginatedEmails.map((email) => (
                  <div
                    key={email.id}
                    className="email-list-item"
                    onClick={() => handleEmailSelect(email.id)}
                  >
                    <div className="email-list-item-left">
                      {email.thumbnailUrl ? (
                        <img
                          src={email.thumbnailUrl}
                          alt=""
                          className="email-thumbnail"
                        />
                      ) : (
                        <PlaceholderThumbnailIcon className="email-thumbnail" />
                      )}
                      <div className="email-info">
                        <h4 className="email-title">{email.title}</h4>
                        <p className="email-meta">
                          Sent by {email.sender.name} on{" "}
                          {formatDisplayDateTime(email.sentAt)}
                        </p>
                      </div>
                    </div>
                    <div className="email-list-item-right">
                      {email.targetAudience?.totalRecipients !== undefined && (
                        <span className="recipient-count-pill">
                          {email.targetAudience.totalRecipients} Recipients
                        </span>
                      )}
                      <span className="email-chevron">&#8250;</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pagination-controls">
                <div className="page-size-control">
                  <label htmlFor="email-page-size">Show:</label>
                  <select
                    id="email-page-size"
                    value={emailsPerPage}
                    onChange={(e) => {
                      setEmailsPerPage(Number(e.target.value));
                      setEmailListPage(0);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="page-buttons">
                  <button
                    onClick={() => setEmailListPage((p) => p - 1)}
                    disabled={emailListPage === 0}
                  >
                    <FaCaretLeft />
                  </button>
                  <button
                    onClick={() => setEmailListPage((p) => p + 1)}
                    disabled={emailListPage >= emailPageCount - 1}
                  >
                    <FaCaretRight />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="message-container">
              No emails found for the selected period.
            </div>
          )}
        </>
      )}

      {!loading && !error && currentView === "detail" && (
        <>
          <div className="widget-header">
            {allemailsview && (
              <button className="back-button" onClick={handleBackToList}>
                <FaCaretLeft />
              </button>
            )}
            <h3 className="widget-title">"{selectedEmailTitle}" Performance</h3>
          </div>
          <div className="detail-view-controls">
            <div className="filter-and-date-container">
              <div className="recipient-filter">
                <input
                  type="text"
                  placeholder="Filter recipients..."
                  value={recipientSearchTerm}
                  onChange={(e) => {
                    setRecipientSearchTerm(e.target.value);
                    setRecipientPage(0);
                  }}
                />
              </div>
              <div className="date-picker-group">
                <label>From:</label>
                <input
                  type="datetime-local"
                  value={toInputDateTimeString(detailSinceDate)}
                  onChange={(e) =>
                    handleDetailDateChange(e.target.value, "since")
                  }
                  max={nowString}
                />
                <label>To:</label>
                <input
                  type="datetime-local"
                  value={toInputDateTimeString(detailUntilDate)}
                  onChange={(e) =>
                    handleDetailDateChange(e.target.value, "until")
                  }
                  max={nowString}
                />
              </div>
            </div>
            <div className="stats-and-export-container">
              {emailStats && (
                <div className="email-stats-container">
                  <div className="stat-item">
                    <span className="stat-value">
                      {emailStats.totalRecipients}
                    </span>
                    <span className="stat-label">Recipients</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{emailStats.uniqueOpens}</span>
                    <span className="stat-label">Unique Opens</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{emailStats.totalOpens}</span>
                    <span className="stat-label">Total Opens</span>
                  </div>
                </div>
              )}
              {enablecsvdownload && (
                <button
                  className="export-csv-button"
                  onClick={handleCsvExport}
                  disabled={!recipientData || filteredRecipients.length === 0}
                >
                  <FaFileCsv style={{ marginRight: "8px" }} /> Generate CSV
                </button>
              )}
            </div>
          </div>
          {paginatedRecipients.length > 0 ? (
            <>
              <table className="performance-table">
                <thead>
                  <tr>
                    <th role="button" onClick={() => handleSort("recipient")}>
                      Recipient
                    </th>
                    <th
                      role="button"
                      style={{ width: "120px" }}
                      onClick={() => handleSort("status")}
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRecipients.map((i) => (
                    <RecipientRow key={i.user.id} interaction={i} />
                  ))}
                </tbody>
              </table>
              <div className="pagination-controls">
                <div className="page-size-control">
                  <label>Show:</label>
                  <select
                    value={recipientsPerPage}
                    onChange={(e) => {
                      setRecipientsPerPage(Number(e.target.value));
                      setRecipientPage(0);
                    }}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
                <div className="page-buttons">
                  <button
                    onClick={() => setRecipientPage((p) => p - 1)}
                    disabled={recipientPage === 0}
                  >
                    <FaCaretLeft />
                  </button>
                  <button
                    onClick={() => setRecipientPage((p) => p + 1)}
                    disabled={recipientPage >= recipientPageCount - 1}
                  >
                    <FaCaretRight />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="message-container">
              {recipientData
                ? "No matching recipients found."
                : "No recipient data available for this email in the selected date range."}
            </div>
          )}
        </>
      )}
    </div>
  );
};
