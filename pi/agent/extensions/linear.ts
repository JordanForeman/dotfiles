import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { IntegrationExtensionCore } from "../extension-core/integration-extension-core";

const LINEAR_API_URL = "https://api.linear.app/graphql";
const MAX_ISSUES_FETCH = 100;

type LinearIssue = {
  id: string;
  identifier: string;
  title: string;
  url?: string;
  priority?: number;
  updatedAt?: string;
  description?: string | null;
  state?: { id: string; name: string; type?: string } | null;
  team?: { id: string; key: string; name: string } | null;
  assignee?: { id: string; name?: string | null; email?: string | null } | null;
};

type LinearTeam = { id: string; key: string; name: string };
type LinearWorkflowState = {
  id: string;
  name: string;
  type?: string;
  team?: { id: string; key: string; name: string } | null;
};

function getApiKey(): string | undefined {
  const key = process.env.LINEAR_API_KEY?.trim();
  return key ? key : undefined;
}

function getDefaultTeamKey(): string | undefined {
  const key = process.env.LINEAR_TEAM_KEY?.trim();
  return key ? key : undefined;
}

function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

async function linearGraphQL<T>(
  query: string,
  variables: Record<string, unknown> | undefined,
  signal?: AbortSignal
): Promise<T> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("LINEAR_API_KEY is not set");
  }

  const response = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Linear API HTTP ${response.status}: ${response.statusText}`);
  }

  const json = (await response.json()) as {
    data?: T;
    errors?: Array<{ message?: string }>;
  };

  if (json.errors?.length) {
    const message = json.errors.map((e) => e.message || "Unknown GraphQL error").join("; ");
    throw new Error(message);
  }

  if (!json.data) {
    throw new Error("Linear API returned no data");
  }

  return json.data;
}

async function listTeams(signal?: AbortSignal): Promise<LinearTeam[]> {
  const data = await linearGraphQL<{ teams?: { nodes?: LinearTeam[] } }>(
    `query ListTeams {
      teams {
        nodes {
          id
          key
          name
        }
      }
    }`,
    undefined,
    signal
  );

  return data.teams?.nodes ?? [];
}

async function listWorkflowStates(signal?: AbortSignal): Promise<LinearWorkflowState[]> {
  const data = await linearGraphQL<{ workflowStates?: { nodes?: LinearWorkflowState[] } }>(
    `query ListWorkflowStates {
      workflowStates {
        nodes {
          id
          name
          type
          team {
            id
            key
            name
          }
        }
      }
    }`,
    undefined,
    signal
  );

  return data.workflowStates?.nodes ?? [];
}

async function listRecentIssues(first = 50, signal?: AbortSignal): Promise<LinearIssue[]> {
  const safeFirst = Math.max(1, Math.min(first, MAX_ISSUES_FETCH));

  const data = await linearGraphQL<{ issues?: { nodes?: LinearIssue[] } }>(
    `query ListIssues($first: Int!) {
      issues(first: $first) {
        nodes {
          id
          identifier
          title
          description
          url
          priority
          updatedAt
          state {
            id
            name
            type
          }
          team {
            id
            key
            name
          }
          assignee {
            id
            name
            email
          }
        }
      }
    }`,
    { first: safeFirst },
    signal
  );

  return data.issues?.nodes ?? [];
}

function formatIssue(issue: LinearIssue, includeDescription = false): string {
  const parts = [
    `${issue.identifier}: ${issue.title}`,
    issue.team?.key ? `team=${issue.team.key}` : undefined,
    issue.state?.name ? `state=${issue.state.name}` : undefined,
    typeof issue.priority === "number" ? `priority=${issue.priority}` : undefined,
    issue.assignee?.name || issue.assignee?.email
      ? `assignee=${issue.assignee?.name ?? issue.assignee?.email}`
      : undefined,
    issue.updatedAt ? `updated=${issue.updatedAt}` : undefined,
    issue.url,
  ].filter(Boolean);

  const lines = [parts.join(" | ")];
  if (includeDescription && issue.description?.trim()) {
    lines.push(`description: ${issue.description.trim()}`);
  }
  return lines.join("\n");
}

async function resolveTeamId(args: { teamId?: string; teamKey?: string }, signal?: AbortSignal): Promise<string> {
  if (args.teamId?.trim()) return args.teamId.trim();

  const requestedKey = args.teamKey?.trim() || getDefaultTeamKey();
  const teams = await listTeams(signal);

  if (requestedKey) {
    const team = teams.find((t) => t.key.toLowerCase() === requestedKey.toLowerCase());
    if (!team) throw new Error(`Could not find team with key '${requestedKey}'`);
    return team.id;
  }

  if (teams.length === 1) return teams[0].id;

  throw new Error(
    "Team is ambiguous. Provide teamKey/teamId, or set LINEAR_TEAM_KEY in your environment."
  );
}

async function resolveStateIdForTeam(
  teamId: string,
  stateName: string,
  signal?: AbortSignal
): Promise<string> {
  const states = await listWorkflowStates(signal);
  const matched = states.find(
    (state) => state.team?.id === teamId && state.name.toLowerCase() === stateName.toLowerCase()
  );
  if (!matched) {
    throw new Error(`Could not find workflow state '${stateName}' for team`);
  }
  return matched.id;
}

function hasLinearCredentials() {
  return Boolean(getApiKey());
}

class LinearExtension extends IntegrationExtensionCore {
  constructor(pi: ExtensionAPI) {
    super(pi, {
      id: "linear",
      name: "Linear",
      summary: "Linear API integration tools",
    });
  }

  protected registerExtension(): void {
    this.pi.on("before_agent_start", async (event) => {
    if (!hasLinearCredentials()) return;

    return {
      systemPrompt:
        event.systemPrompt +
        `\n\n## Linear Integration\nYou can use Linear tools to list teams, inspect issues, search recent issues, and create or move issues.\nIf the team is unclear, run linear_list_teams first. If LINEAR_TEAM_KEY is configured, use that as the default team when creating issues.`,
    };
  });

    this.pi.registerCommand("linear", {
    description: "Show Linear extension status and setup hints",
    handler: async (_args, ctx) => {
      const apiKeyConfigured = hasLinearCredentials();
      const defaultTeamKey = getDefaultTeamKey();

      if (!apiKeyConfigured) {
        ctx.ui.notify(
          "Linear extension is loaded, but LINEAR_API_KEY is not set.\nSet LINEAR_API_KEY to your personal Linear API key to enable tools.",
          "warning"
        );
        return;
      }

      ctx.ui.notify(
        `Linear extension ready ✓\nLINEAR_TEAM_KEY: ${defaultTeamKey ?? "(not set)"}\nUse tools like linear_list_teams, linear_search_issues, linear_get_issue, linear_create_issue, and linear_move_issue_state.`,
        "info"
      );
    },
  });

    this.pi.registerTool({
    name: "linear_list_teams",
    label: "Linear List Teams",
    description: "List available Linear teams (id, key, name).",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, signal) {
      if (!hasLinearCredentials()) {
        return errorResult("LINEAR_API_KEY is not set. Configure it, then retry.");
      }

      try {
        const teams = await listTeams(signal);
        if (!teams.length) {
          return { content: [{ type: "text" as const, text: "No Linear teams found." }], details: { teams } };
        }

        const text = teams.map((t) => `${t.key} (${t.name}) | id=${t.id}`).join("\n");
        return { content: [{ type: "text" as const, text }], details: { teams } };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Linear error: ${message}`);
      }
    },
  });

    this.pi.registerTool({
    name: "linear_search_issues",
    label: "Linear Search Issues",
    description:
      "Search recent Linear issues by free-text match against identifier/title, with optional team and state filtering.",
    parameters: Type.Object({
      query: Type.Optional(Type.String({ description: "Text to match in identifier or title" })),
      teamKey: Type.Optional(Type.String({ description: "Optional team key (e.g. ENG)" })),
      state: Type.Optional(Type.String({ description: "Optional exact workflow state name" })),
      limit: Type.Optional(Type.Number({ description: "Maximum results to return (default 20, max 50)" })),
    }),
    async execute(_toolCallId, params, signal) {
      if (!hasLinearCredentials()) {
        return errorResult("LINEAR_API_KEY is not set. Configure it, then retry.");
      }

      try {
        const limit = Math.max(1, Math.min(Math.floor(params.limit ?? 20), 50));
        const issues = await listRecentIssues(100, signal);

        const query = params.query?.trim().toLowerCase();
        const teamKey = params.teamKey?.trim().toLowerCase();
        const state = params.state?.trim().toLowerCase();

        let filtered = issues;

        if (query) {
          filtered = filtered.filter(
            (issue) =>
              issue.identifier.toLowerCase().includes(query) ||
              issue.title.toLowerCase().includes(query)
          );
        }

        if (teamKey) {
          filtered = filtered.filter((issue) => issue.team?.key?.toLowerCase() === teamKey);
        }

        if (state) {
          filtered = filtered.filter((issue) => issue.state?.name?.toLowerCase() === state);
        }

        filtered = filtered.slice(0, limit);

        if (!filtered.length) {
          return {
            content: [{ type: "text" as const, text: "No matching issues found in recent issues." }],
            details: { totalScanned: issues.length, matches: [] },
          };
        }

        const text = filtered.map((issue) => formatIssue(issue)).join("\n\n");
        return {
          content: [{ type: "text" as const, text }],
          details: { totalScanned: issues.length, matches: filtered },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Linear error: ${message}`);
      }
    },
  });

    this.pi.registerTool({
    name: "linear_get_issue",
    label: "Linear Get Issue",
    description: "Get one issue by Linear identifier (e.g. ENG-123) or internal issue id.",
    parameters: Type.Object({
      identifierOrId: Type.String({ description: "Issue identifier (ENG-123) or issue id" }),
      includeDescription: Type.Optional(
        Type.Boolean({ description: "Include issue description in output (default false)" })
      ),
    }),
    async execute(_toolCallId, params, signal) {
      if (!hasLinearCredentials()) {
        return errorResult("LINEAR_API_KEY is not set. Configure it, then retry.");
      }

      try {
        const needle = params.identifierOrId.trim().toLowerCase();
        const issues = await listRecentIssues(100, signal);
        const issue = issues.find(
          (item) => item.identifier.toLowerCase() === needle || item.id.toLowerCase() === needle
        );

        if (!issue) {
          return {
            content: [{ type: "text" as const, text: `Issue '${params.identifierOrId}' was not found in recent issues.` }],
            isError: true,
          };
        }

        return {
          content: [{ type: "text" as const, text: formatIssue(issue, params.includeDescription === true) }],
          details: { issue },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Linear error: ${message}`);
      }
    },
  });

    this.pi.registerTool({
    name: "linear_create_issue",
    label: "Linear Create Issue",
    description: "Create a new Linear issue. Team comes from teamId/teamKey or LINEAR_TEAM_KEY.",
    parameters: Type.Object({
      title: Type.String({ description: "Issue title" }),
      description: Type.Optional(Type.String({ description: "Issue description (markdown)" })),
      teamId: Type.Optional(Type.String({ description: "Team id (overrides teamKey)" })),
      teamKey: Type.Optional(Type.String({ description: "Team key, e.g. ENG" })),
      priority: Type.Optional(Type.Number({ description: "0=No priority, 1=Urgent, 2=High, 3=Normal, 4=Low" })),
      stateName: Type.Optional(
        Type.String({ description: "Optional workflow state name to assign on create (e.g. Backlog)" })
      ),
    }),
    async execute(_toolCallId, params, signal) {
      if (!hasLinearCredentials()) {
        return errorResult("LINEAR_API_KEY is not set. Configure it, then retry.");
      }

      try {
        const teamId = await resolveTeamId({ teamId: params.teamId, teamKey: params.teamKey }, signal);
        const stateId = params.stateName?.trim()
          ? await resolveStateIdForTeam(teamId, params.stateName.trim(), signal)
          : undefined;

        const input: Record<string, unknown> = {
          teamId,
          title: params.title,
        };

        if (params.description?.trim()) input.description = params.description;
        if (typeof params.priority === "number") input.priority = Math.max(0, Math.min(4, Math.floor(params.priority)));
        if (stateId) input.stateId = stateId;

        const data = await linearGraphQL<{
          issueCreate?: {
            success?: boolean;
            issue?: LinearIssue;
          };
        }>(
          `mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
                title
                url
                priority
                state {
                  id
                  name
                  type
                }
                team {
                  id
                  key
                  name
                }
              }
            }
          }`,
          { input },
          signal
        );

        const created = data.issueCreate?.issue;
        if (!data.issueCreate?.success || !created) {
          return errorResult("Linear did not confirm issue creation.");
        }

        return {
          content: [{ type: "text" as const, text: `Created ${created.identifier}: ${created.title}\n${created.url ?? ""}`.trim() }],
          details: { issue: created },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Linear error: ${message}`);
      }
    },
  });

    this.pi.registerTool({
    name: "linear_move_issue_state",
    label: "Linear Move Issue State",
    description: "Move an issue to another workflow state by name (e.g. In Progress, Done).",
    parameters: Type.Object({
      identifierOrId: Type.String({ description: "Issue identifier (ENG-123) or issue id" }),
      stateName: Type.String({ description: "Target workflow state name" }),
    }),
    async execute(_toolCallId, params, signal) {
      if (!hasLinearCredentials()) {
        return errorResult("LINEAR_API_KEY is not set. Configure it, then retry.");
      }

      try {
        const issues = await listRecentIssues(100, signal);
        const needle = params.identifierOrId.trim().toLowerCase();
        const issue = issues.find(
          (item) => item.identifier.toLowerCase() === needle || item.id.toLowerCase() === needle
        );

        if (!issue) {
          return errorResult(`Issue '${params.identifierOrId}' was not found in recent issues.`);
        }

        const teamId = issue.team?.id;
        if (!teamId) {
          return errorResult(`Issue ${issue.identifier} has no team information available.`);
        }

        const stateId = await resolveStateIdForTeam(teamId, params.stateName.trim(), signal);

        const data = await linearGraphQL<{
          issueUpdate?: {
            success?: boolean;
            issue?: LinearIssue;
          };
        }>(
          `mutation MoveIssueState($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) {
              success
              issue {
                id
                identifier
                title
                url
                state {
                  id
                  name
                  type
                }
                team {
                  id
                  key
                  name
                }
              }
            }
          }`,
          { id: issue.id, input: { stateId } },
          signal
        );

        const updated = data.issueUpdate?.issue;
        if (!data.issueUpdate?.success || !updated) {
          return errorResult(`Linear did not confirm state update for ${issue.identifier}.`);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Moved ${updated.identifier} to '${updated.state?.name ?? params.stateName}'.\n${updated.url ?? ""}`.trim(),
            },
          ],
          details: { issue: updated },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return errorResult(`Linear error: ${message}`);
      }
    },
  });
  }
}

export default function linearExtension(pi: ExtensionAPI) {
  new LinearExtension(pi).register();
}
